const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { protect, authorize } = require('../middleware/auth');
const Diagnosis = require('../models/mongodb/Diagnosis');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/diagnoses');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Ensure upload directory exists
(async () => {
    try {
        await fs.mkdir('uploads/diagnoses', { recursive: true });
    } catch (err) {
        console.error('Failed to create upload directory:', err);
    }
})();

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

        // Get ML API URL from environment or use local fallback
        const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5001';
        console.log('Using ML API URL:', ML_API_URL);

        // Create form data with the image
        const formData = new FormData();
        formData.append('image', await fs.readFile(req.file.path), {
            filename: req.file.filename,
            contentType: 'image/jpeg'
        });

        // Send directly to Flask API with increased timeout
        console.log('Sending request to Flask API');
        const response = await axios.post(`${ML_API_URL}/predict`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Accept': 'application/json'
            },
            maxBodyLength: Infinity,
            timeout: 10000000 // Increased to 60 seconds
        });

        console.log('Received response:', response.data);

        // Generate unique IDs
        const diagnosisId = uuidv4();
        const imageId = uuidv4();
        const imageUrl = `/uploads/diagnoses/${req.file.filename}`;

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
                format: 'JPEG'
            },
            mlResults: {
                prediction: response.data.eczemaPrediction,
                confidence: response.data.eczemaConfidence,
                severity: response.data.eczemaSeverity.toLowerCase(),
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
            status: response.data.eczemaSeverity === 'Severe' || response.data.eczemaConfidence < 0.6 ? 'pending_review' : 'completed'
        });

        res.status(201).json({
            success: true,
            data: {
                diagnosisId: diagnosis.diagnosisId,
                isEczema: diagnosis.mlResults.prediction,
                severity: diagnosis.mlResults.severity,
                confidence: diagnosis.mlResults.confidence,
                bodyPart: response.data.bodyPart,
                bodyPartConfidence: response.data.bodyPartConfidence,
                recommendations: allRecommendations,
                needsDoctorReview: diagnosis.status === 'pending_review',
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
            message: 'Failed to process diagnosis. Please check ML API connectivity.'
        });
    }
});

// Get all diagnoses for a patient
router.get('/diagnoses', async (req, res) => {
    try {
        const diagnoses = await Diagnosis.find({ patientId: req.user.id })
            .sort('-createdAt')
            .select('-metadata');

        const formattedDiagnoses = diagnoses.map(diagnosis => ({
            diagnosisId: diagnosis.diagnosisId,
            isEczema: diagnosis.mlResults.prediction,
            severity: diagnosis.mlResults.severity,
            confidence: diagnosis.mlResults.confidence,
            bodyPart: diagnosis.mlResults.affectedAreas[0],
            bodyPartConfidence: diagnosis.mlResults.bodyPartConfidence,
            recommendations: diagnosis.recommendations.precautions,
            needsDoctorReview: diagnosis.status === 'pending_review',
            imageUrl: diagnosis.imageUrl,
            status: diagnosis.status,
            createdAt: diagnosis.createdAt,
            doctorReview: diagnosis.doctorReview
        }));

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
            needsDoctorReview: diagnosis.status === 'pending_review',
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
        await diagnosis.save();

        const formattedDiagnosis = {
            diagnosisId: diagnosis.diagnosisId,
            isEczema: diagnosis.mlResults.prediction,
            severity: diagnosis.doctorReview.updatedSeverity || diagnosis.mlResults.severity,
            confidence: diagnosis.mlResults.confidence,
            bodyPart: diagnosis.mlResults.affectedAreas[0],
            bodyPartConfidence: diagnosis.mlResults.bodyPartConfidence,
            recommendations: diagnosis.recommendations.precautions,
            needsDoctorReview: false,
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
            message: 'Failed to add review'
        });
    }
});

module.exports = router;
