const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { protect, authorize } = require('../middleware/auth');
const imageProcessor = require('../middleware/imageProcessor');
const mlService = require('../services/mlService');
const Diagnosis = require('../models/mongodb/Diagnosis');

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

        // Process and validate image
        const processedImage = await imageProcessor.processImage(req.file);

        // Analyze image with ML model using processed buffer
        const analysisResult = await mlService.analyzeSkin(processedImage.buffer);

        // Generate unique IDs
        const diagnosisId = uuidv4();
        const imageId = uuidv4();

        // Create diagnosis record
        const diagnosis = await Diagnosis.create({
            diagnosisId,
            imageId,
            patientId: req.user.id,
            imageUrl: processedImage.filename,
            imageMetadata: {
                originalFileName: req.file.originalname,
                uploadDate: new Date(),
                fileSize: req.file.size,
                dimensions: {
                    width: processedImage.metadata.width,
                    height: processedImage.metadata.height
                },
                imageQuality: processedImage.metadata.qualityScore,
                format: req.file.mimetype.split('/')[1].toUpperCase()
            },
            mlResults: {
                hasEczema: analysisResult.isEczema,
                confidence: analysisResult.confidence,
                severity: analysisResult.severity.toLowerCase(),
                affectedAreas: [analysisResult.bodyPart],
                differentialDiagnosis: [],
                modelVersion: '1.0'
            },
            recommendations: {
                treatments: [],
                lifestyle: [],
                triggers: [],
                precautions: analysisResult.isEczema ? analysisResult.recommendations : [analysisResult.skincareTips]
            },
            status: analysisResult.severity === 'Severe' || analysisResult.confidence < 0.6 ? 'pending_review' : 'completed'
        });

        res.status(201).json({
            success: true,
            data: {
                diagnosisId: diagnosis.diagnosisId,
                isEczema: analysisResult.isEczema,
                severity: analysisResult.severity,
                confidence: analysisResult.confidence,
                bodyPart: analysisResult.bodyPart,
                recommendations: diagnosis.recommendations.precautions,
                needsDoctorReview: diagnosis.status === 'pending_review',
                imageUrl: `/uploads/${processedImage.filename}`
            }
        });
    } catch (error) {
        console.error('Diagnosis error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process diagnosis'
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
