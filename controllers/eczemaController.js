const { Mongo } = require('../models');
const { Diagnosis, Analytics, Advisory } = Mongo;
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const mlService = require('../services/mlService');

// Initialize ML service when the module loads
(async () => {
  try {
    await mlService.initialize();
    console.log('ML Service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize ML Service:', error);
  }
})();

// Analyze eczema image using ML model
const analyzeEczemaImage = async (imagePath) => {
  const imageBuffer = await fs.readFile(imagePath);
  const analysis = await mlService.analyzeSkin(imageBuffer);
  
  return {
    severity: analysis.severity,
    confidence: analysis.confidence,
    areas_affected: ['elbow', 'knee'],
    symptoms: ['redness', 'itching', 'dryness'],
    prediction: analysis.prediction,
    requiresDoctorReview: analysis.requiresDoctorReview
  };
};

exports.analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image'
      });
    }

    // Process image with sharp
    const processedImagePath = path.join('uploads', `processed_${req.file.filename}`);
    await sharp(req.file.path)
      .resize(800, 800, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toFile(processedImagePath);

    // Analyze the processed image
    const analysis = await analyzeEczemaImage(processedImagePath);

    // Create diagnosis record in MongoDB
    const diagnosis = await Diagnosis.create({
      patient_id: req.user.user_id,
      image_path: processedImagePath,
      original_image_path: req.file.path,
      severity: analysis.severity,
      confidence_score: analysis.confidence,
      areas_affected: analysis.areas_affected,
      symptoms: analysis.symptoms,
      analyzed_at: new Date()
    });

    // Update analytics
    await Analytics.create({
      diagnosis_id: diagnosis._id,
      patient_id: req.user.user_id,
      severity: analysis.severity,
      model_version: '1.0',
      processing_time_ms: 1000, // Simulated processing time
      confidence_score: analysis.confidence
    });

    // Get relevant advisory content
    const advisory = await Advisory.findOne({ severity: analysis.severity });

    res.status(200).json({
      success: true,
      data: {
        diagnosis_id: diagnosis._id,
        severity: analysis.severity,
        confidence: analysis.confidence,
        areas_affected: analysis.areas_affected,
        symptoms: analysis.symptoms,
        recommendations: advisory ? advisory.recommendations : [],
        image_url: `/uploads/processed_${req.file.filename}`,
        prediction: analysis.prediction,
        requiresDoctorReview: analysis.requiresDoctorReview
      }
    });
  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing image',
      error: error.message
    });
  }
};

exports.updateSymptoms = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { symptoms, severity } = req.body;

    const diagnosis = await Diagnosis.findById(recordId);
    
    if (!diagnosis) {
      return res.status(404).json({
        success: false,
        message: 'Diagnosis record not found'
      });
    }

    if (diagnosis.patient_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this record'
      });
    }

    diagnosis.symptoms = symptoms;
    diagnosis.severity = severity;
    diagnosis.updated_at = new Date();
    await diagnosis.save();

    res.json({
      success: true,
      data: diagnosis
    });
  } catch (error) {
    console.error('Update symptoms error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating symptoms',
      error: error.message
    });
  }
};

exports.getPatientHistory = async (req, res) => {
  try {
    const diagnoses = await Diagnosis.find({ 
      patient_id: req.user.user_id 
    }).sort({ analyzed_at: -1 });

    const analytics = await Analytics.find({
      patient_id: req.user.user_id
    }).sort({ created_at: -1 });

    res.json({
      success: true,
      data: {
        diagnoses,
        analytics: analytics.map(a => ({
          diagnosis_id: a.diagnosis_id,
          severity: a.severity,
          confidence_score: a.confidence_score,
          analyzed_at: a.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching patient history',
      error: error.message
    });
  }
};
