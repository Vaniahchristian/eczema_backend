const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { protect, authorize } = require('../middleware/auth');
const eczemaController = require('../controllers/eczemaController');
const Diagnosis = require('../models/mongodb/Diagnosis');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs').promises;
const { uploadFile } = require('../config/storage');
const { MySQL } = require('../models'); // Import MySQL models from index.js

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Protect all routes
router.use(protect);

// Upload image and get diagnosis
router.post('/diagnose', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
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
            return res.status(500).json({
                success: false,
                message: 'Failed to upload image to cloud storage'
            });
        }

        // Get ML API URL from environment or use local fallback
        const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5001';
        console.log('Using ML API URL:', ML_API_URL);

        // Create form data with the image buffer
        const formData = new FormData();
        formData.append('image', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // Send directly to Flask API with increased timeout
        console.log('Sending request to Flask API');
        const response = await axios.post(`${ML_API_URL}/predict`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Accept': 'application/json'
            },
            maxBodyLength: Infinity,
            timeout: 60000 // 60 seconds
        });

        console.log('Received response:', response.data);

        // Generate unique IDs
        const diagnosisId = uuidv4();
        const imageId = uuidv4();

        // Combine recommendations and skincare tips
        const allRecommendations = [
            ...(response.data.recommendations || []),
            ...(response.data.skincareTips || [])
        ];

        // Create diagnosis record
        const diagnosis = await Diagnosis.create({
            diagnosisId,
            imageId,
            patientId: req.user.id,
            imageUrl,
            imageMetadata: {
                originalFileName: req.file.originalname,
                uploadDate: new Date(),
                fileSize: req.file.size,
                format: req.file.mimetype === 'image/jpeg' ? 'JPEG' : 'PNG'
            },
            mlResults: {
                prediction: response.data.eczemaPrediction,
                confidence: response.data.eczemaConfidence,
                severity: response.data.eczemaSeverity ? response.data.eczemaSeverity.toLowerCase() : null,
                affectedAreas: [response.data.bodyPart],
                bodyPartConfidence: response.data.bodyPartConfidence,
                modelVersion: '1.0'
            },
            recommendations: {
                treatments: [],
                lifestyle: [],
                triggers: [],
                precautions: allRecommendations
            },
            status: 'not_reviewed'
        });

        res.status(201).json({
            success: true,
            data: {
                diagnosisId: diagnosis.diagnosisId,
                isEczema: diagnosis.mlResults.prediction,
                severity: diagnosis.mlResults.severity,
                confidence: diagnosis.mlResults.confidence,
                bodyPart: diagnosis.mlResults.affectedAreas[0],
                bodyPartConfidence: diagnosis.mlResults.bodyPartConfidence,
                recommendations: diagnosis.recommendations.precautions,
                needsDoctorReview: false,
                imageUrl: diagnosis.imageUrl,
                status: diagnosis.status,
                createdAt: diagnosis.createdAt
            }
        });
    } catch (error) {
        console.error('Diagnosis error:', error);
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                success: false,
                message: 'ML API request timed out. Please ensure the ML API is accessible.'
            });
        }
        if (error.response) {
            console.error('Flask API error:', {
                status: error.response.status,
                data: error.response.data
            });
        }
        res.status(500).json({
            success: false,
            message: 'Diagnosis failed'
        });
    }
});

// Get all diagnoses for a patient
router.get('/diagnoses', async (req, res) => {
    try {
        console.log('GET /diagnoses - Fetching diagnoses for user:', req.user.id);
        
        const diagnoses = await Diagnosis.find({ patientId: req.user.id })
            .sort('-createdAt')
            .select('-metadata');

        console.log('Found diagnoses count:', diagnoses.length);
        
        if (diagnoses.length === 0) {
            console.log('No diagnoses found for user');
            return res.json({
                success: true,
                data: []
            });
        }

        console.log('Sample diagnosis data:', JSON.stringify(diagnoses[0], null, 2));

        const formattedDiagnoses = diagnoses.map(diagnosis => {
            try {
                // Determine severity with fallbacks
                let severity = 'unknown';
                if (diagnosis.doctorReview?.updatedSeverity) {
                    severity = diagnosis.doctorReview.updatedSeverity;
                } else if (diagnosis.mlResults?.severity) {
                    severity = diagnosis.mlResults.severity;
                } else if (diagnosis.mlResults?.confidence) {
                    // Determine severity based on confidence if no explicit severity
                    const confidence = diagnosis.mlResults.confidence;
                    if (confidence >= 0.8) severity = 'mild';
                    else if (confidence >= 0.6) severity = 'moderate';
                    else severity = 'severe';
                }

                const formatted = {
                    diagnosisId: diagnosis.diagnosisId,
                    isEczema: diagnosis.mlResults?.prediction || 'unknown',
                    severity: severity,
                    confidence: diagnosis.mlResults?.confidence || 0,
                    bodyPart: diagnosis.mlResults?.affectedAreas?.[0] || 'unknown',
                    recommendations: diagnosis.recommendations?.precautions || [],
                    needsDoctorReview: diagnosis.needsDoctorReview || false,
                    imageUrl: diagnosis.imageUrl,
                    status: diagnosis.status || 'unknown',
                    createdAt: diagnosis.createdAt,
                    doctorReview: diagnosis.doctorReview
                };
                return formatted;
            } catch (err) {
                console.error('Error formatting diagnosis:', diagnosis.diagnosisId, err);
                return null;
            }
        }).filter(Boolean);

        console.log('Formatted diagnoses count:', formattedDiagnoses.length);

        res.json({
            success: true,
            data: formattedDiagnoses
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve diagnoses'
        });
    }
});

// Get specific diagnosis
router.get('/diagnoses/:diagnosisId', async (req, res) => {
    try {
        const diagnosis = await Diagnosis.findOne({
            diagnosisId: req.params.diagnosisId,
            patientId: req.user.id
        });

        if (!diagnosis) {
            return res.status(404).json({
                success: false,
                message: 'Diagnosis not found'
            });
        }

        const formattedDiagnosis = {
            diagnosisId: diagnosis.diagnosisId,
            isEczema: diagnosis.mlResults.prediction,
            severity: diagnosis.mlResults.severity,
            confidence: diagnosis.mlResults.confidence,
            bodyPart: diagnosis.mlResults.affectedAreas[0],
            bodyPartConfidence: diagnosis.mlResults.bodyPartConfidence,
            recommendations: diagnosis.recommendations.precautions,
            needsDoctorReview: diagnosis.needsDoctorReview,
            imageUrl: diagnosis.imageUrl,
            status: diagnosis.status,
            createdAt: diagnosis.createdAt,
            doctorReview: diagnosis.doctorReview
        };

        res.json({
            success: true,
            data: formattedDiagnosis
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve diagnosis'
        });
    }
});
    
   // Example: eczema.js
   router.post('/diagnoses/:diagnosisId/feedback', protect, eczemaController.submitFeedback);
  
   router.get('/diagnoses/:diagnosisId/feedback', protect, eczemaController.getFeedback);
  
// Claim a diagnosis for review
router.post('/diagnoses/:diagnosisId/claim', authorize('doctor'), async (req, res) => {
  try {
    const diagnosis = await Diagnosis.findOneAndUpdate(
      {
        diagnosisId: req.params.diagnosisId,
        'doctorReview.doctorId': { $in: [null, undefined] },
        status: 'pending_review',
        needsDoctorReview: true
      },
      {
        $set: {
          'doctorReview.doctorId': req.user.id,
          status: 'in_review'
        }
      },
      { new: true }
    );
    if (!diagnosis) {
      return res.status(400).json({ success: false, message: 'Case already claimed or not available.' });
    }
    res.json({ success: true, data: diagnosis });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to claim case' });
  }
});


router.get('/doctor-reviews', authorize('doctor'), async (req, res) => {
  try {
    const diagnoses = await Diagnosis.find({
      needsDoctorReview: true,
      $or: [
        { 'doctorReview.doctorId': { $exists: false } },
        { 'doctorReview.doctorId': null }
      ]
    }).sort('-createdAt').lean();

    // For each diagnosis, fetch patient info from MySQL using Sequelize
    const diagnosesWithPatients = await Promise.all(diagnoses.map(async (diagnosis) => {
      try {
        const patient = await MySQL.User.findOne({
          where: { id: diagnosis.patientId },
          attributes: ['id', 'first_name', 'last_name', 'email', 'date_of_birth', 'gender'],
          raw: true
        });
        // Include postDiagnosisSurvey in the response
        return {
          ...diagnosis,
          patient: patient
            ? {
                id: patient.id,
                firstName: patient.first_name,
                lastName: patient.last_name,
                email: patient.email,
                dateOfBirth: patient.date_of_birth,
                gender: patient.gender,
              }
            : null,
          preDiagnosisSurvey: diagnosis.preDiagnosisSurvey || null,
          postDiagnosisSurvey: diagnosis.postDiagnosisSurvey || null
        };
      } catch (error) {
        return { ...diagnosis, patient: null, preDiagnosisSurvey: diagnosis.preDiagnosisSurvey || null, postDiagnosisSurvey: diagnosis.postDiagnosisSurvey || null };
      }
    }));

    res.json({ success: true, data: diagnosesWithPatients });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch doctor review requests' });
  }
});


   
// Add doctor's review to diagnosis
router.post('/diagnoses/:diagnosisId/review', authorize('doctor'), async (req, res) => {
    try {
        const { review, updatedSeverity, treatmentPlan } = req.body;

        const diagnosis = await Diagnosis.findOne({ diagnosisId: req.params.diagnosisId });
        if (!diagnosis) {
            return res.status(404).json({
                success: false,
                message: 'Diagnosis not found'
            });
        }

        // Update diagnosis with doctor's review
        diagnosis.doctorReview = {
            doctorId: req.user.id,
            review,
            reviewedAt: new Date(),
            updatedSeverity: updatedSeverity || diagnosis.mlResults.severity,
            treatmentPlan
        };
        diagnosis.status = 'reviewed';
        if (!diagnosis.mlResults?.prediction || !diagnosis.imageUrl) {
            return res.status(400).json({
              success: false,
              message: 'Diagnosis is missing required fields (mlResults.prediction or imageUrl)'
            });
          }
          diagnosis.needsDoctorReview = false;

        await diagnosis.save();

        const formattedDiagnosis = {
            diagnosisId: diagnosis.diagnosisId,
            isEczema: diagnosis.mlResults.prediction,
            severity: diagnosis.doctorReview.updatedSeverity || diagnosis.mlResults.severity,
            confidence: diagnosis.mlResults.confidence,
            bodyPart: diagnosis.mlResults.affectedAreas[0],
            bodyPartConfidence: diagnosis.mlResults.bodyPartConfidence,
            recommendations: diagnosis.recommendations.precautions,
            needsDoctorReview: diagnosis.needsDoctorReview,
            imageUrl: diagnosis.imageUrl,
            status: diagnosis.status,
            createdAt: diagnosis.createdAt,
            doctorReview: diagnosis.doctorReview
        };

        res.json({
            success: true,
            data: formattedDiagnosis
        });
    } catch (error) {
        console.error('Error adding doctor review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add review'
        });
    }
});


// Get all reviewed diagnoses for a doctor
router.get('/doctor/reviewed-diagnoses', authorize('doctor'), eczemaController.getReviewedDiagnosesByDoctor);

module.exports = router;
