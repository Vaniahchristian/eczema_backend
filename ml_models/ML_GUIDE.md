# ML Model Design and Integration Guide for Eczema Diagnosis System

## Table of Contents
1. [Project Overview](#project-overview)
2. [Development Setup](#development-setup)
3. [Data Management](#data-management)
4. [Model Architecture](#model-architecture)
5. [Training Process](#training-process)
6. [Integration Guide](#integration-guide)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## Project Overview

The eczema diagnosis system uses two main ML models:
1. Image Analysis Model (CNN) - Processes skin images
2. Symptom Analysis Model (Neural Network) - Processes patient symptoms

These models work together to provide comprehensive eczema diagnosis predictions.

## Development Setup

### Environment Setup
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
.\venv\Scripts\activate
# On Unix/MacOS:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

### Directory Structure
```
backend/
├── ml_models/
│   ├── __init__.py
│   ├── model.py         # Main model definitions
│   ├── train.py         # Training pipeline
│   ├── utils.py         # Helper functions
│   └── saved_models/    # Trained model storage
├── data/
│   ├── images/          # Image dataset
│   └── symptoms/        # Symptoms dataset
└── requirements.txt
```

## Data Management

### Image Data
- **Format**: RGB images, JPG/PNG
- **Size**: Standardize to 224x224 pixels
- **Organization**:
  ```
  data/images/
  ├── train/
  │   ├── positive/      # Eczema images
  │   └── negative/      # Non-eczema images
  └── validation/
      ├── positive/
      └── negative/
  ```

### Symptom Data
- **Format**: CSV file with normalized values
- **Required Features**:
  - Itching intensity (0-1)
  - Redness level (0-1)
  - Skin dryness (0-1)
  - Duration of symptoms
  - etc.

## Model Architecture

### Image Model (CNN)
```python
# Current architecture in model.py
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
```

**Customization Tips**:
- Add more Conv2D layers for complex feature detection
- Adjust filter sizes based on your image characteristics
- Consider adding Dropout layers to prevent overfitting
- Experiment with different optimizers (Adam, RMSprop)

### Symptom Model
```python
model = models.Sequential([
    layers.Dense(64, activation='relu', input_shape=(10,)),
    layers.Dropout(0.2),
    layers.Dense(32, activation='relu'),
    layers.Dense(1, activation='sigmoid')
])
```

**Customization Tips**:
- Adjust layer sizes based on your feature count
- Add layers for more complex relationships
- Tune dropout rate based on overfitting

## Training Process

1. **Data Preprocessing**
   ```python
   def preprocess_data(image_path, symptoms_data):
       # Image preprocessing
       img = cv2.imread(image_path)
       img = cv2.resize(img, (224, 224))
       img = img / 255.0  # Normalize
       
       # Symptoms preprocessing
       symptoms = scaler.fit_transform(symptoms_data)
       return img, symptoms
   ```

2. **Training Configuration**
   - Batch size: 32 (adjust based on your GPU/CPU)
   - Epochs: Start with 10, adjust based on validation loss
   - Learning rate: 0.001 (adjust if needed)

3. **Model Evaluation**
   - Use validation set for model tuning
   - Track accuracy, precision, recall, and F1-score
   - Use confusion matrix for detailed analysis

## Integration Guide

### API Integration
1. Create prediction endpoint:
```python
@app.post("/predict")
async def predict(
    image: UploadFile,
    symptoms: SymptomData
):
    # Load models
    model = EczemaModel()
    model.load_models(
        "saved_models/image_model.h5",
        "saved_models/symptom_model.h5"
    )
    
    # Process inputs
    image_data = model.preprocess_image(image)
    symptom_data = model.preprocess_symptoms(symptoms)
    
    # Get prediction
    prediction = model.predict(image_data, symptom_data)
    return {"prediction": float(prediction)}
```

2. Handle model loading efficiently:
   - Load models at application startup
   - Use caching for better performance
   - Implement proper error handling

## Best Practices

1. **Version Control**
   - Use Git for code versioning
   - Tag model versions
   - Document model changes

2. **Model Monitoring**
   - Log predictions and outcomes
   - Monitor model performance
   - Set up alerts for performance degradation

3. **Code Quality**
   - Write unit tests
   - Use type hints
   - Document functions and classes
   - Follow PEP 8 style guide

4. **Performance Optimization**
   - Use batch prediction when possible
   - Implement caching
   - Profile code for bottlenecks

## Troubleshooting

Common Issues and Solutions:

1. **Model Overfitting**
   - Add more training data
   - Increase dropout rate
   - Add data augmentation
   - Reduce model complexity

2. **Poor Predictions**
   - Check data quality
   - Verify preprocessing steps
   - Validate model architecture
   - Ensure balanced dataset

3. **Memory Issues**
   - Reduce batch size
   - Use data generators
   - Implement proper memory cleanup

4. **Slow Predictions**
   - Cache model loading
   - Optimize image preprocessing
   - Use batch predictions
   - Consider model quantization

Remember to regularly update this guide as the system evolves and new challenges are encountered.
