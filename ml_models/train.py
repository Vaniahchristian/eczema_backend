from model import EczemaModel
import os
import numpy as np
from sklearn.model_selection import train_test_split

def train_models(image_data_path, symptoms_data_path):
    """
    Train both the image and symptoms models
    
    Args:
        image_data_path: Path to the directory containing image data
        symptoms_data_path: Path to the symptoms dataset
    """
    model = EczemaModel()
    
    # Load and preprocess your data here
    # This is a placeholder - you'll need to implement the actual data loading
    # based on your dataset structure
    
    # Example training code:
    """
    # Image training
    X_img_train, X_img_test, y_img_train, y_img_test = train_test_split(
        image_data, image_labels, test_size=0.2, random_state=42
    )
    
    model.image_model.fit(
        X_img_train, y_img_train,
        epochs=10,
        validation_data=(X_img_test, y_img_test)
    )
    
    # Symptoms training
    X_sym_train, X_sym_test, y_sym_train, y_sym_test = train_test_split(
        symptoms_data, symptoms_labels, test_size=0.2, random_state=42
    )
    
    model.symptom_model.fit(
        X_sym_train, y_sym_train,
        epochs=10,
        validation_data=(X_sym_test, y_sym_test)
    )
    """
    
    # Save the trained models
    os.makedirs('saved_models', exist_ok=True)
    model.save_models(
        'saved_models/image_model.h5',
        'saved_models/symptom_model.h5'
    )

if __name__ == "__main__":
    # Replace with your actual data paths
    train_models(
        image_data_path="path/to/image/data",
        symptoms_data_path="path/to/symptoms/data"
    )
