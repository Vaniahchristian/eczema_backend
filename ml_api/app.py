from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from PIL import Image
import numpy as np
import io

app = Flask(__name__)
CORS(app)

# Load model
model = None

def load_model():
    global model
    try:
        model = tf.keras.models.load_model('eczema.h5')
        print("Model loaded successfully!")
    except Exception as e:
        print(f"Error loading model: {e}")
        return False
    return True

def preprocess_image(image_bytes):
    # Convert bytes to image
    img = Image.open(io.BytesIO(image_bytes))

    # Resize to 224x224
    img = img.resize((224, 224))

    # Convert to array and normalize
    img_array = tf.keras.preprocessing.image.img_to_array(img)
    img_array = tf.expand_dims(img_array, 0)
    img_array = img_array / 255.0

    return img_array

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    try:
        image_file = request.files['image']
        image_bytes = image_file.read()

        # Preprocess image
        img_array = preprocess_image(image_bytes)

        # Flatten image to match model input shape
        flattened_img_array = tf.reshape(img_array, (1, -1))

        # Make prediction
        predictions = model.predict(flattened_img_array)
        confidence = float(predictions[0][0])
        has_eczema = confidence > 0.5

        # Determine severity
        severity = 'none'
        if has_eczema:
            if confidence > 0.9:
                severity = 'severe'
            elif confidence > 0.7:
                severity = 'moderate'
            else:
                severity = 'mild'

        return jsonify({
            'prediction': 'Eczema' if has_eczema else 'No Eczema',
            'confidence': confidence,
            'severity': severity,
            'requiresDoctorReview': confidence > 0.7
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    if load_model():
        app.run(host='0.0.0.0', port=5000)
    else:
        print("Failed to load model. Exiting...")
