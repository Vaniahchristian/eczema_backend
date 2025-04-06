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

# Class mapping
class_names = {
    0: 'Acne and Rosacea',
    1: 'Normal',
    2: 'Vitiligo',
    3: 'Fungal Infections',
    4: 'Melanoma',
    5: 'Eczema'
}

# Load models
vgg_model = VGG19(weights='imagenet', include_top=False, input_shape=(180, 180, 3))
for layer in vgg_model.layers:
    layer.trainable = False

model = load_model('6claass.h5')
print("Model loaded successfully!")

def preprocess_image_for_vgg(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = img.resize((180, 180))
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = preprocess_input(img_array)  # VGG19 preprocessing
    return img_array

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    try:
        image_file = request.files['image']
        image_bytes = image_file.read()

        # Preprocess and extract VGG19 features
        img_array = preprocess_image_for_vgg(image_bytes)
        features = vgg_model.predict(img_array)
        features_flat = features.reshape(1, -1)  # (1, 12800)

        # Predict
        predictions = model.predict(features_flat)
        predicted_class = int(np.argmax(predictions[0]))
        predicted_label = class_names[predicted_class]
        confidence = float(predictions[0][predicted_class])

        # Optionally return all class probabilities
        all_probs = {class_names[i]: float(predictions[0][i]) for i in range(6)}

        return jsonify({
            'prediction': predicted_label,
            'confidence': confidence,
            'allClassProbabilities': all_probs
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
