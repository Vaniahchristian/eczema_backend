const { Mongo } = require('../models');
const { Diagnosis, Analytics, Advisory } = Mongo;
const fs = require('fs').promises;
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

// Analyze eczema image using ML model
const analyzeEczemaImage = async (imagePath) => {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    
    // Create form data with the image
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'image.jpg',
      contentType: 'image/jpeg'
    });

    // Send to hosted ML API
    const ML_API_URL = process.env.ML_API_URL || 'https://eczema-model.onrender.com';
    console.log('Sending request to ML API:', ML_API_URL);
    
    const response = await axios.post(`${ML_API_URL}/predict`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Accept': 'application/json'
      },
      maxBodyLength: Infinity,
      timeout: 60000
    });

    return {
      severity: response.data.eczemaSeverity,
      confidence: response.data.eczemaConfidence,
      areas_affected: [response.data.bodyPart],
      bodyPartConfidence: response.data.bodyPartConfidence,
      prediction: response.data.eczemaPrediction,
      recommendations: response.data.recommendations || [],
      skincareTips: response.data.skincareTips || [],
      requiresDoctorReview: response.data.eczemaSeverity === 'Severe' || response.data.eczemaConfidence < 0.6
    };
  } catch (error) {
    console.error('Error analyzing image:', error);
    if (error.response) {
      console.error('ML API error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    throw new Error('Failed to analyze image');
  }
};

// Get diagnosis statistics for analytics
const getDiagnosisStats = async () => {
  const stats = await Diagnosis.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        eczema: {
          $sum: { $cond: ['$mlResults.hasEczema', 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending_review'] }, 1, 0] }
        },
        reviewed: {
          $sum: { $cond: [{ $eq: ['$status', 'reviewed'] }, 1, 0] }
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    eczema: 0,
    pending: 0,
    reviewed: 0
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
    // await sharp(req.file.path)
    //   .resize(800, 800, { fit: 'inside' })
    //   .jpeg({ quality: 80 })
    //   .toFile(processedImagePath);

    // Analyze the processed image
    const analysis = await analyzeEczemaImage(req.file.path);

    // Create diagnosis record in MongoDB
    const diagnosis = await Diagnosis.create({
      patient_id: req.user.user_id,
      image_path: req.file.path,
      severity: analysis.severity,
      confidence_score: analysis.confidence,
      areas_affected: analysis.areas_affected,
      symptoms: [],
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
        symptoms: [],
        recommendations: advisory ? advisory.recommendations : [],
        image_url: `/uploads/${req.file.filename}`,
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
