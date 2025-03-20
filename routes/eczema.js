const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { Mongo } = require('../models');
const { v4: uuidv4 } = require('uuid');

// Upload image for diagnosis
router.post('/diagnose', protect, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        // Create new diagnosis record
        const diagnosis = new Mongo.Diagnosis({
            diagnosisId: uuidv4(),
            patientId: req.user.id,
            imageId: uuidv4(),
            imageMetadata: {
                originalFileName: req.file.originalname,
                uploadDate: new Date(),
                fileSize: req.file.size,
                dimensions: {
                    width: 1920, // You would get this from image processing
                    height: 1080
                },
                imageQuality: 0.9, // You would calculate this
                format: req.file.mimetype.includes('png') ? 'PNG' : 'JPEG'
            },
            mlResults: {
                hasEczema: true, // This would come from ML model
                confidence: 0.85,
                severity: 'moderate',
                affectedAreas: ['face'],
                differentialDiagnosis: [
                    {
                        condition: 'Contact Dermatitis',
                        probability: 0.15
                    }
                ],
                modelVersion: '1.0.0'
            },
            recommendations: {
                treatments: [
                    {
                        type: 'Topical Corticosteroid',
                        description: 'Apply twice daily to affected areas',
                        priority: 1
                    }
                ],
                lifestyle: [
                    {
                        category: 'Skincare',
                        recommendations: [
                            'Use gentle, fragrance-free soap',
                            'Take short, lukewarm showers'
                        ]
                    }
                ],
                triggers: ['Stress', 'Hot weather'],
                precautions: ['Avoid scratching affected areas']
            }
        });

        await diagnosis.save();

        res.status(201).json({
            success: true,
            message: 'Image uploaded and analyzed successfully',
            data: diagnosis
        });
    } catch (error) {
        console.error('Error in diagnosis:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing diagnosis'
        });
    }
});

// Get all diagnoses for a patient
router.get('/diagnoses', protect, async (req, res) => {
    try {
        const diagnoses = await Mongo.Diagnosis
            .find({ patientId: req.user.id })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: diagnoses
        });
    } catch (error) {
        console.error('Error fetching diagnoses:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching diagnoses'
        });
    }
});

// Get specific diagnosis by ID
router.get('/diagnoses/:diagnosisId', protect, async (req, res) => {
    try {
        const diagnosis = await Mongo.Diagnosis.findOne({
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
        console.error('Error fetching diagnosis:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching diagnosis'
        });
    }
});

// Add doctor review to diagnosis
router.post('/diagnoses/:diagnosisId/review', protect, authorize('doctor'), async (req, res) => {
    try {
        const { comments, adjustments } = req.body;
        const diagnosis = await Mongo.Diagnosis.findOne({
            diagnosisId: req.params.diagnosisId
        });

        if (!diagnosis) {
            return res.status(404).json({
                success: false,
                message: 'Diagnosis not found'
            });
        }

        diagnosis.doctorReview = {
            reviewedBy: req.user.id,
            reviewDate: new Date(),
            comments,
            adjustments: adjustments || []
        };

        await diagnosis.save();

        res.json({
            success: true,
            message: 'Doctor review added successfully',
            data: diagnosis
        });
    } catch (error) {
        console.error('Error adding doctor review:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding doctor review'
        });
    }
});

module.exports = router;
