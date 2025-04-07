const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');
const imageProcessor = require('../middleware/imageProcessor');
const mlService = require('../services/mlService');
const notificationService = require('../services/notificationService');
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

        // Analyze image with ML model
        const analysisResult = await mlService.analyzeSkin(req.file.buffer);

        // Create diagnosis record
        const diagnosis = await Diagnosis.create({
            patientId: req.user.id,
            imageUrl: processedImage.filename,
            severity: analysisResult.severity,
            confidenceScore: analysisResult.confidence,
            bodyPart: analysisResult.bodyPart,
            isEczema: analysisResult.isEczema,
            recommendations: analysisResult.isEczema ? analysisResult.recommendations : analysisResult.skincareTips,
            needsDoctorReview: analysisResult.severity === 'Severe' || analysisResult.confidence < 0.6,
            status: analysisResult.severity === 'Severe' || analysisResult.confidence < 0.6 ? 'pending_review' : 'completed',
            metadata: {
                ...processedImage.metadata,
                mlAnalysis: {
                    isEczema: analysisResult.isEczema,
                    confidence: analysisResult.confidence,
                    bodyPart: analysisResult.bodyPart,
                    bodyPartConfidence: analysisResult.bodyPartConfidence
                }
            }
        });

        // Send notification
        await notificationService.sendDiagnosisResult(req.user.id, diagnosis._id, {
            isEczema: analysisResult.isEczema,
            severity: analysisResult.severity,
            confidence: analysisResult.confidence,
            bodyPart: analysisResult.bodyPart,
            needsDoctorReview: diagnosis.needsDoctorReview
        });

        res.status(201).json({
            success: true,
            data: {
                diagnosisId: diagnosis._id,
                isEczema: analysisResult.isEczema,
                severity: analysisResult.severity,
                confidence: analysisResult.confidence,
                bodyPart: analysisResult.bodyPart,
                recommendations: diagnosis.recommendations,
                needsDoctorReview: diagnosis.needsDoctorReview,
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
            _id: req.params.diagnosisId,
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

        const diagnosis = await Diagnosis.findById(req.params.diagnosisId);
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
            updatedSeverity: updatedSeverity || diagnosis.severity,
            treatmentPlan
        };
        diagnosis.status = 'reviewed';
        await diagnosis.save();

        // Notify patient
        await notificationService.sendToUser(diagnosis.patientId, {
            type: 'diagnosis_reviewed',
            title: 'Doctor Review Available',
            message: 'A doctor has reviewed your diagnosis',
            data: {
                diagnosisId: diagnosis._id,
                severity: updatedSeverity || diagnosis.severity
            }
        });

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
