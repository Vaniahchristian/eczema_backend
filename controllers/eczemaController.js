const { Mongo } = require('../models');
const { Diagnosis, Analytics, Advisory } = Mongo;
const axios = require('axios');
const FormData = require('form-data');
const { uploadFile } = require('../config/storage');

// Analyze eczema image using ML model
const analyzeEczemaImage = async (fileBuffer) => {
  try {
    // Create form data with the image buffer
    const formData = new FormData();
    formData.append('image', fileBuffer, {
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
          $sum: { $cond: ['$mlResults.prediction', 1, 0] }
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

    // Upload image to Google Cloud Storage
    console.log('Uploading image to Google Cloud Storage...');
    let imageUrl;
    try {
      imageUrl = await uploadFile(req.file);
      console.log('Successfully uploaded to GCS, URL:', imageUrl);
    } catch (error) {
      console.error('GCS Upload error:', error);
      throw error;
    }

    // Analyze the image using the buffer from multer
    const analysis = await analyzeEczemaImage(req.file.buffer);

    // Create diagnosis record in MongoDB
    const diagnosis = await Diagnosis.create({
      diagnosisId: require('crypto').randomUUID(), // Generate a unique ID
      patientId: req.user.user_id,
      imageId: req.file.originalname,
      imageUrl: imageUrl,
      imageMetadata: {
        originalFileName: req.file.originalname,
        uploadDate: new Date(),
        fileSize: req.file.size,
        format: req.file.mimetype.includes('png') ? 'PNG' : 'JPEG'
      },
      mlResults: {
        severity: analysis.severity,
        confidence: analysis.confidence,
        areasAffected: analysis.areas_affected,
        prediction: analysis.prediction,
        requiresDoctorReview: analysis.requiresDoctorReview
      },
      symptoms: [],
      analyzedAt: new Date()
    });

    // Update analytics
    await Analytics.create({
      diagnosis_id: diagnosis.diagnosisId,
      patient_id: req.user.user_id,
      severity: analysis.severity,
      model_version: '1.0',
      processing_time_ms: 1000,
      confidence_score: analysis.confidence
    });

    // Get relevant advisory content
    const advisory = await Advisory.findOne({ severity: analysis.severity });

    res.status(200).json({
      success: true,
      data: {
        diagnosis_id: diagnosis.diagnosisId,
        severity: analysis.severity,
        confidence: analysis.confidence,
        areas_affected: analysis.areas_affected,
        symptoms: [],
        recommendations: advisory ? advisory.recommendations : [],
        image_url: imageUrl,
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

    if (diagnosis.patientId !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this record'
      });
    }

    diagnosis.symptoms = symptoms;
    diagnosis.mlResults.severity = severity;
    diagnosis.updatedAt = new Date();
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
      patientId: req.user.user_id 
    }).sort({ analyzedAt: -1 });

    const analytics = await Analytics.find({
      patient_id: req.user.user_id
    }).sort({ created_at: -1 });

    res.json({
      success: true,
      data: {
        diagnoses: diagnoses.map(d => ({
          diagnosis_id: d.diagnosisId,
          severity: d.mlResults.severity,
          confidence: d.mlResults.confidence,
          areas_affected: d.mlResults.areasAffected,
          image_url: d.imageUrl,
          symptoms: d.symptoms,
          analyzed_at: d.analyzedAt,
          requires_doctor_review: d.mlResults.requiresDoctorReview
        })),
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
