const { Diagnosis, Analytics, Advisory } = require('../models');
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

    console.log('File received:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Upload image to Google Cloud Storage
    console.log('Starting Google Cloud Storage upload...');
    let imageUrl;
    try {
      console.log('GCS Config:', {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        bucketName: process.env.GOOGLE_CLOUD_BUCKET_NAME,
        hasCredentials: !!process.env.GOOGLE_CLOUD_CREDENTIALS
      });
      
      imageUrl = await uploadFile(req.file);
      console.log('Successfully uploaded to GCS, URL:', imageUrl);
    } catch (error) {
      console.error('GCS Upload error:', error);
      // Continue with ML analysis even if upload fails
      imageUrl = null;
    }

    console.log('Starting ML analysis...');
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

exports.diagnose = async (req, res) => {
  try {
    const imageFile = req.file;
    const { preDiagnosisData } = req.body;

    if (!imageFile) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded'
      });
    }

    // Upload image to storage and get URL
    const imageUrl = await uploadFile(imageFile);
    
    // Get ML diagnosis
    const mlDiagnosis = await analyzeEczemaImage(imageFile.buffer);

    // Create diagnosis record
    const diagnosis = new Diagnosis({
      diagnosisId: require('crypto').randomUUID(), // Generate a unique ID
      patientId: req.user.user_id,
      imageId: imageFile.filename,
      imageUrl,
      imageMetadata: {
        originalFileName: imageFile.originalname,
        uploadDate: new Date(),
        fileSize: imageFile.size,
        format: imageFile.mimetype.includes('png') ? 'PNG' : 'JPEG'
      },
      mlResults: {
        prediction: mlDiagnosis.prediction,
        confidence: mlDiagnosis.confidence,
        severity: mlDiagnosis.severity,
        affectedAreas: mlDiagnosis.areas_affected,
        bodyPartConfidence: mlDiagnosis.bodyPartConfidence,
        modelVersion: process.env.ML_MODEL_VERSION
      },
      recommendations: [],
      // Add pre-diagnosis survey data if provided
      ...(preDiagnosisData && {
        preDiagnosisSurvey: JSON.parse(preDiagnosisData)
      })
    });

    await diagnosis.save();

    res.json({
      success: true,
      data: {
        diagnosisId: diagnosis.diagnosisId,
        isEczema: mlDiagnosis.prediction,
        severity: mlDiagnosis.severity,
        confidence: mlDiagnosis.confidence,
        bodyPart: mlDiagnosis.areas_affected[0],
        recommendations: diagnosis.recommendations,
        needsDoctorReview: diagnosis.mlResults.requiresDoctorReview,
        imageUrl
      }
    });
  } catch (error) {
    console.error('Diagnosis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing diagnosis'
    });
  }
};

exports.getFeedback = async (req, res) => {
  try {
    const { diagnosisId } = req.params;
    const diagnosis = await Diagnosis.findOne({ diagnosisId });

    if (!diagnosis) {
      return res.status(404).json({
        success: false,
        message: 'Diagnosis not found'
      });
    }

    res.json({
      success: true,
      data: {
        preDiagnosisSurvey: diagnosis.preDiagnosisSurvey || null,
        postDiagnosisSurvey: diagnosis.postDiagnosisSurvey || null
      }
    });
  } catch (error) {
    console.error('Error retrieving feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving feedback'
    });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    const { diagnosisId } = req.params;
    const update = {};

    // Handle pre-diagnosis survey
    if (req.body.preDiagnosisSurvey) {
      update.preDiagnosisSurvey = req.body.preDiagnosisSurvey;
    }
    // For legacy support if frontend sends preDiagnosisData instead
    if (req.body.preDiagnosisData) {
      update.preDiagnosisSurvey = req.body.preDiagnosisData;
    }

    // Handle post-diagnosis survey (feedback)
    if (req.body.postDiagnosisSurvey) {
      update.postDiagnosisSurvey = req.body.postDiagnosisSurvey;
    }
    // For legacy support if frontend sends feedback fields directly
    if (
      req.body.diagnosisAccuracy !== undefined ||
      req.body.diagnosisHelpfulness !== undefined ||
      req.body.treatmentClarity !== undefined ||
      req.body.userConfidence !== undefined ||
      req.body.feedback !== undefined ||
      req.body.wouldRecommend !== undefined
    ) {
      update.postDiagnosisSurvey = {
        diagnosisAccuracy: req.body.diagnosisAccuracy,
        diagnosisHelpfulness: req.body.diagnosisHelpfulness,
        treatmentClarity: req.body.treatmentClarity,
        userConfidence: req.body.userConfidence,
        feedback: req.body.feedback,
        wouldRecommend: req.body.wouldRecommend,
        submittedAt: new Date(),
      };
    }
    // Handle doctor review request
    if (req.body.needsDoctorReview === true) {
      update.needsDoctorReview = true;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid feedback or survey data provided.",
      });
    }

    await Diagnosis.findOneAndUpdate(
      { diagnosisId },
      { $set: update },
      { upsert: true }
    );

    res.json({
      success: true,
      data: { success: true }
    });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting feedback'
    });
  }
};

// Get all diagnoses reviewed by a doctor
exports.getReviewedDiagnosesByDoctor = async (req, res) => {
  try {
    const doctorId = req.user.id; // Get the logged-in doctor's ID
 
   if (!doctorId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    console.log('Looking for diagnoses reviewed by doctor:', doctorId);

    // Find all diagnoses reviewed by this doctor
    const diagnoses = await Diagnosis.find({
      'doctorReview.doctorId': doctorId,
      'status': 'reviewed'
    }).sort({ 'doctorReview.reviewedAt': -1 }); // Sort by review date, newest first

    // For each diagnosis, fetch the patient details from MySQL
    const diagnosesWithPatients = await Promise.all(diagnoses.map(async (diagnosis) => {
      try {
        // Get patient details from MySQL
        const [patientRows] = await MySQL.query(
          'SELECT u.id, u.first_name, u.last_name, u.email, u.date_of_birth, u.gender, ' +
          'p.medical_history, p.allergies ' +
          'FROM users u ' +
          'JOIN patient_profiles p ON u.id = p.user_id ' +
          'WHERE u.id = ?',
          [diagnosis.patientId]
        );

        const patientDetails = patientRows[0] || null;

        // Return diagnosis with patient details
        return {
          diagnosisId: diagnosis.diagnosisId,
          imageUrl: diagnosis.imageUrl,
          mlResults: diagnosis.mlResults,
          doctorReview: diagnosis.doctorReview,
          status: diagnosis.status,
          reviewedAt: diagnosis.doctorReview.reviewedAt,
          patient: patientDetails ? {
            id: patientDetails.id,
            firstName: patientDetails.first_name,
            lastName: patientDetails.last_name,
            email: patientDetails.email,
            dateOfBirth: patientDetails.date_of_birth,
            gender: patientDetails.gender,
            medicalHistory: patientDetails.medical_history,
            allergies: patientDetails.allergies
          } : null
        };
      } catch (error) {
        console.error('Error fetching patient details:', error);
        return {
          ...diagnosis.toObject(),
          patient: null
        };
      }
    }));

    res.json({
      success: true,
      data: diagnosesWithPatients
    });
  } catch (error) {
    console.error('Error fetching reviewed diagnoses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reviewed diagnoses'
    });
  }
};
