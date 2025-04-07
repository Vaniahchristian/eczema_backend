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

# Load the TensorFlow Lite model for body part classification
interpreter = tf.lite.Interpreter(model_path="mobilenet_bodypart_model_quantized.tflite")
interpreter.allocate_tensors()

print("Models loaded successfully!")

# Preprocessing
def preprocess_image(image_bytes, target_size=(150, 150)):
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = img.resize(target_size)
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)  # Adding batch dimension
    img_array = img_array / 255.0  # Normalization
    return img_array

# Severity
def get_severity(confidence):
    if confidence >= 0.8:
        return "Severe"
    elif confidence >= 0.5:
        return "Moderate"
    else:
        return "Mild"

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
        img_array = preprocess_image(image_bytes, target_size=(150, 150))  # Resize to (150, 150) for body part model

        # Eczema Prediction
        vgg_features = vgg_model.predict(img_array)
        features_flat = vgg_features.reshape(1, -1)
        eczema_preds = eczema_model.predict(features_flat)
        eczema_class = int(np.argmax(eczema_preds[0]))
        eczema_label = eczema_class_names[eczema_class]
        eczema_confidence = float(eczema_preds[0][eczema_class])

        # Body Part Prediction (Using TensorFlow Lite model)
        body_preds = predict_with_tflite(interpreter, img_array)
        body_class = int(np.argmax(body_preds[0]))
        body_label = body_part_class_names[body_class]
        body_confidence = float(body_preds[0][body_class])

        # Return prediction
        if eczema_label == 'Eczema':
            return jsonify({
                'prediction': 'Eczema',
                'confidence': eczema_confidence,
                'severity': get_severity(eczema_confidence),
                'bodyPart': body_label,
                'bodyPartConfidence': body_confidence
            })
        else:
            return jsonify({
                'prediction': 'No Eczema Detected',
                'confidence': eczema_confidence,
                'severity': 'None',
                'bodyPart': body_label,
                'bodyPartConfidence': body_confidence
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
