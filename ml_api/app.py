from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.vgg19 import VGG19, preprocess_input
from PIL import Image
import numpy as np
import io

app = Flask(__name__)
CORS(app)

# Class mappings
eczema_class_names = {
    0: 'Acne and Rosacea',
    1: 'Normal',
    2: 'Vitiligo',
    3: 'Fungal Infections',
    4: 'Melanoma',
    5: 'Eczema'
}

body_part_class_names = {
    0: 'Belly', 1: 'Ear', 2: 'Elbow', 3: 'Eye', 4: 'Foot',
    5: 'Hand', 6: 'Knee', 7: 'Neck', 8: 'Nose', 9: 'Shoulders'
}

# Load models
vgg_model = VGG19(weights='imagenet', include_top=False, input_shape=(180, 180, 3))
for layer in vgg_model.layers:
    layer.trainable = False

eczema_model = load_model('eczema.h5')

# Load TensorFlow Lite model for body part classification
interpreter = tf.lite.Interpreter(model_path="mobilenet_bodypart_model_quantized.tflite")
interpreter.allocate_tensors()

print("Models loaded successfully!")

# Preprocessing function for VGG19
def preprocess_image_for_vgg(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = img.resize((180, 180))  # Resize to (180, 180) for VGG19
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)  # Add batch dimension
    img_array = preprocess_input(img_array)  # VGG19 preprocessing
    return img_array

# Preprocessing function for MobileNetV2 (Body part model)
def preprocess_image_for_bodypart(image_bytes, target_size=(150, 150)):
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = img.resize(target_size)  # Resize to (150, 150) for body part model
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)  # Add batch dimension
    img_array = img_array / 255.0  # Normalize image to [0, 1] range
    return img_array

# Severity function based on confidence level
def get_severity(confidence):
    if confidence >= 0.8:
        return "Severe"
    elif confidence >= 0.5:
        return "Moderate"
    else:
        return "Mild"

# Function to predict using TensorFlow Lite model
def predict_with_tflite(model_interpreter, img_array):
    input_details = model_interpreter.get_input_details()
    output_details = model_interpreter.get_output_details()

    # Set input tensor
    model_interpreter.set_tensor(input_details[0]['index'], img_array)

    # Run inference
    model_interpreter.invoke()

    # Get output tensor
    output_data = model_interpreter.get_tensor(output_details[0]['index'])

    return output_data

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    try:
        image_file = request.files['image']
        image_bytes = image_file.read()

        # Preprocess image for both models
        img_array_vgg = preprocess_image_for_vgg(image_bytes)  # For eczema model
        img_array_bodypart = preprocess_image_for_bodypart(image_bytes)  # For body part model

        # Eczema Prediction (Using VGG19 model)
        vgg_features = vgg_model.predict(img_array_vgg)
        features_flat = vgg_features.reshape(1, -1)  # Flatten the features for the model input
        eczema_preds = eczema_model.predict(features_flat)
        eczema_class = int(np.argmax(eczema_preds[0]))
        eczema_label = eczema_class_names[eczema_class]
        eczema_confidence = float(eczema_preds[0][eczema_class])

        # Body Part Prediction (Using TensorFlow Lite model)
        body_preds = predict_with_tflite(interpreter, img_array_bodypart)
        body_class = int(np.argmax(body_preds[0]))
        body_label = body_part_class_names[body_class]
        body_confidence = float(body_preds[0][body_class])

        # Return prediction results
        if eczema_label == 'Eczema':
            return jsonify({
                'eczemaPrediction': 'Eczema',
                'eczemaConfidence': eczema_confidence,
                'eczemaSeverity': get_severity(eczema_confidence),
                'bodyPart': body_label,
                'bodyPartConfidence': body_confidence
            })
        else:
            return jsonify({
                'eczemaPrediction': 'No Eczema Detected',
                'eczemaConfidence': eczema_confidence,
                'eczemaSeverity': 'None',
                'bodyPart': body_label,
                'bodyPartConfidence': body_confidence
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
