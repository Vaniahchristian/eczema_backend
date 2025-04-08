const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { protect, authorize } = require('../middleware/auth');
const Diagnosis = require('../models/mongodb/Diagnosis');
const axios = require('axios');
const FormData = require('form-data');

// Configure multer for image upload
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

        // Create form data with the image
        const formData = new FormData();
        formData.append('image', req.file.buffer, {
            filename: 'image.jpg',
            contentType: 'image/jpeg'
        });

        // Send directly to Flask API
        console.log('Sending request to Flask API');
        const response = await axios.post('http://172.50.1.37:5001/predict', formData, {
            headers: {
                ...formData.getHeaders(),
                'Accept': 'application/json'
            },
            maxBodyLength: Infinity,
            timeout: 30000
        });

        console.log('Received response:', response.data);

        // Generate unique IDs
        const diagnosisId = uuidv4();
        const imageId = uuidv4();

        // Create diagnosis record
        const diagnosis = await Diagnosis.create({
            diagnosisId,
            imageId,
            patientId: req.user.id,
            imageMetadata: {
                originalFileName: req.file.originalname,
                uploadDate: new Date(),
                fileSize: req.file.size,
                format: 'JPEG'
            },
            mlResults: {
                hasEczema: response.data.eczemaPrediction === 'Eczema',
                confidence: response.data.eczemaConfidence,
                severity: response.data.eczemaSeverity.toLowerCase(),
                affectedAreas: [response.data.bodyPart],
                differentialDiagnosis: [],
                modelVersion: '1.0'
            },
            recommendations: {
                treatments: [],
                lifestyle: [],
                triggers: [],
                precautions: response.data.recommendations || response.data.skincareTips || []
            },
            status: response.data.eczemaSeverity === 'Severe' || response.data.eczemaConfidence < 0.6 ? 'pending_review' : 'completed'
        });

        res.status(201).json({
            success: true,
            data: {
                diagnosisId: diagnosis.diagnosisId,
                isEczema: diagnosis.mlResults.hasEczema,
                severity: diagnosis.mlResults.severity,
                confidence: diagnosis.mlResults.confidence,
                bodyPart: response.data.bodyPart,
                bodyPartConfidence: response.data.bodyPartConfidence,
                recommendations: diagnosis.recommendations.precautions,
                needsDoctorReview: diagnosis.status === 'pending_review'
            }
        });
    } catch (error) {
        console.error('Diagnosis error:', error);
        if (error.response) {
            console.error('Flask API error:', {
                status: error.response.status,
                data: error.response.data
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to process diagnosis'
        });
    }
});

// Get all diagnoses for a patient
router.get('/diagnoses', async (req, res) => {
    try {
        const diagnoses = await Diagnosis.find({ patientId: req.user.id })
            .sort('-createdAt')
            .select('-metadata');

        res.json({
            success: true,
            data: diagnoses
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

        res.json({
            success: true,
            data: diagnosis
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

        res.json({
            success: true,
            data: diagnosis
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to add review'
        });
    }
});

module.exports = router;
