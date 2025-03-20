import tensorflow as tf
from tensorflow.keras import layers, models
from sklearn.preprocessing import StandardScaler
import numpy as np
import cv2

class EczemaModel:
    def __init__(self):
        self.image_model = self._build_image_model()
        self.symptom_model = self._build_symptom_model()
        self.scaler = StandardScaler()
        
    def _build_image_model(self):
        """Build CNN model for image analysis"""
        model = models.Sequential([
            layers.Conv2D(32, (3, 3), activation='relu', input_shape=(224, 224, 3)),
            layers.MaxPooling2D((2, 2)),
            layers.Conv2D(64, (3, 3), activation='relu'),
            layers.MaxPooling2D((2, 2)),
            layers.Conv2D(64, (3, 3), activation='relu'),
            layers.Flatten(),
            layers.Dense(64, activation='relu'),
            layers.Dense(1, activation='sigmoid')
        ])
        model.compile(optimizer='adam',
                     loss='binary_crossentropy',
                     metrics=['accuracy'])
        return model
    
    def _build_symptom_model(self):
        """Build neural network for symptom analysis"""
        model = models.Sequential([
            layers.Dense(64, activation='relu', input_shape=(10,)),
            layers.Dropout(0.2),
            layers.Dense(32, activation='relu'),
            layers.Dense(1, activation='sigmoid')
        ])
        model.compile(optimizer='adam',
                     loss='binary_crossentropy',
                     metrics=['accuracy'])
        return model
    
    def preprocess_image(self, image_path):
        """Preprocess image for model input"""
        img = cv2.imread(image_path)
        img = cv2.resize(img, (224, 224))
        img = img / 255.0  # Normalize pixel values
        return np.expand_dims(img, axis=0)
    
    def preprocess_symptoms(self, symptoms_data):
        """Preprocess symptoms data"""
        return self.scaler.fit_transform(symptoms_data)
    
    def predict(self, image_data, symptoms_data):
        """Combined prediction using both image and symptoms"""
        image_pred = self.image_model.predict(image_data)
        symptoms_pred = self.symptom_model.predict(symptoms_data)
        
        # Combine predictions (you can adjust the weights)
        combined_pred = 0.6 * image_pred + 0.4 * symptoms_pred
        return combined_pred
    
    def save_models(self, image_path, symptom_path):
        """Save both models"""
        self.image_model.save(image_path)
        self.symptom_model.save(symptom_path)
    
    def load_models(self, image_path, symptom_path):
        """Load both models"""
        self.image_model = models.load_model(image_path)
        self.symptom_model = models.load_model(symptom_path)
