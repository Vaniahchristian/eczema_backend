from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.vgg19 import VGG19, preprocess_input
from PIL import Image
import numpy as np
import io
import logging
import os

app = Flask(__name__)
CORS(app)

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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
try:
    # Preload VGG19 weights locally (download and add to repo)
    vgg_model = VGG19(weights=None, include_top=False, input_shape=(180, 180, 3))
    vgg_model.load_weights('vgg19_weights_tf_dim_ordering_tf_kernels_notop.h5')
    for layer in vgg_model.layers:
        layer.trainable = False

    eczema_model = load_model('eczema.h5')

    # Load TensorFlow Lite model for body part classification
    interpreter = tf.lite.Interpreter(model_path='mobilenet_bodypart_model_quantized.tflite')
    interpreter.allocate_tensors()

    logger.info("Models loaded successfully!")
except Exception as e:
    logger.error(f"Failed to load models: {str(e)}", exc_info=True)
    raise

# Preprocessing functions
def preprocess_image_for_vgg(image_bytes):
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        img = img.resize((180, 180))  # VGG19 input size
        img_array = image.img_to_array(img)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = preprocess_input(img_array)
        return img_array
    except Exception as e:
        logger.error(f"Error preprocessing VGG image: {str(e)}")
        raise

def preprocess_image_for_bodypart(image_bytes, target_size=(150, 150)):
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        img = img.resize(target_size)  # Body part model input size
        img_array = image.img_to_array(img)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = img_array / 255.0
        return img_array
    except Exception as e:
        logger.error(f"Error preprocessing body part image: {str(e)}")
        raise

# Severity and recommendations (unchanged)
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
    model_interpreter.set_tensor(input_details[0]['index'], img_array)
    model_interpreter.invoke()
    output_data = model_interpreter.get_tensor(output_details[0]['index'])
    return output_data

def get_treatment_recommendations(severity, body_part):
    general_tips = [
        "Keep the affected area clean and moisturized",
        "Avoid scratching the affected area",
        "Wear loose, breathable clothing",
        "Use fragrance-free products"
    ]
    severe_treatments = [
        "Consult a dermatologist immediately",
        "Consider prescription topical corticosteroids",
        "Use wet wrap therapy",
        "Monitor for signs of infection"
    ]
    moderate_treatments = [
        "Apply over-the-counter hydrocortisone cream",
        "Use antihistamines to reduce itching",
        "Apply cold compresses to reduce inflammation",
        "Consider phototherapy treatment"
    ]
    mild_treatments = [
        "Use emollients regularly",
        "Apply calamine lotion for itching",
        "Take lukewarm baths with colloidal oatmeal",
        "Identify and avoid triggers"
    ]
    body_part_specific = {
        'Face': ["Use gentle, non-comedogenic products", "Avoid harsh facial scrubs"],
        'Hand': ["Wear protective gloves when using cleaning products", "Apply moisturizer after washing hands"],
        'Foot': ["Wear cotton socks", "Keep feet dry and well-ventilated"],
        'Eye': ["Avoid rubbing eyes", "Use hypoallergenic eye products"],
        'Neck': ["Avoid wearing tight necklaces", "Keep neck area dry"],
        'Elbow': ["Apply extra moisturizer to elbow area", "Avoid leaning on elbows"],
        'Knee': ["Wear loose-fitting pants", "Avoid kneeling for long periods"],
        'Belly': ["Wear loose, cotton clothing", "Keep the area dry"],
        'Ear': ["Keep ears dry", "Avoid ear piercings during flare-ups"],
        'Shoulders': ["Avoid shoulder straps that can irritate", "Keep shoulders moisturized"]
    }
    
    if severity == "Severe":
        recommendations = severe_treatments
    elif severity == "Moderate":
        recommendations = moderate_treatments
    else:
        recommendations = mild_treatments
        
    if body_part in body_part_specific:
        recommendations.extend(body_part_specific[body_part])
    recommendations.extend(general_tips)
    return recommendations

def get_skincare_tips():
    return [
        "Maintain a consistent skincare routine",
        "Use gentle, fragrance-free cleansers",
        "Apply sunscreen daily",
        "Stay hydrated and maintain a balanced diet",
        "Get adequate sleep and manage stress",
        "Avoid hot showers and pat dry skin gently",
        "Use a humidifier in dry environments",
        "Consider using products with ceramides and hyaluronic acid"
    ]

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        logger.warning("No image provided in request")
        return jsonify({'error': 'No image provided'}), 400

    try:
        image_file = request.files['image']
        image_bytes = image_file.read()

        # Preprocess image for both models
        img_array_vgg = preprocess_image_for_vgg(image_bytes)
        img_array_bodypart = preprocess_image_for_bodypart(image_bytes)

        # Eczema Prediction
        vgg_features = vgg_model.predict(img_array_vgg)
        features_flat = vgg_features.reshape(1, -1)
        eczema_preds = eczema_model.predict(features_flat)
        eczema_class = int(np.argmax(eczema_preds[0]))
        eczema_label = eczema_class_names[eczema_class]
        eczema_confidence = float(eczema_preds[0][eczema_class])

        # Body Part Prediction
        body_preds = predict_with_tflite(interpreter, img_array_bodypart)
        body_class = int(np.argmax(body_preds[0]))
        body_label = body_part_class_names[body_class]
        body_confidence = float(body_preds[0][body_class])

        # Log prediction
        logger.info(f"Eczema: {eczema_label}, Confidence: {eczema_confidence}, Body Part: {body_label}, Body Confidence: {body_confidence}")

        # Get severity and recommendations
        if eczema_label == 'Eczema':
            severity = get_severity(eczema_confidence)
            recommendations = get_treatment_recommendations(severity, body_label)
            return jsonify({
                'eczemaPrediction': 'Eczema',
                'eczemaConfidence': eczema_confidence,
                'eczemaSeverity': severity,
                'bodyPart': body_label,
                'bodyPartConfidence': body_confidence,
                'recommendations': recommendations
            })
        else:
            return jsonify({
                'eczemaPrediction': 'No Eczema Detected',
                'eczemaConfidence': eczema_confidence,
                'eczemaSeverity': 'None',
                'bodyPart': body_label,
                'bodyPartConfidence': body_confidence,
                'skincareTips': get_skincare_tips()
            })

    except Exception as e:
        logger.error(f"Prediction error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)