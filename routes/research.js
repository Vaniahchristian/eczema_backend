const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ResearchDataService = require('../services/researchDataService');

// All routes require authentication and researcher/admin role
router.use(protect);
router.use(authorize('researcher', 'admin'));

// Get anonymized diagnosis data
router.get('/diagnosis-data', async (req, res) => {
    try {
        const data = await ResearchDataService.collectDiagnosisData();
        res.json({
            success: true,
            data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve diagnosis data'
        });
    }
});

// Get treatment effectiveness data
router.get('/treatment-data', async (req, res) => {
    try {
        const data = await ResearchDataService.collectTreatmentData();
        res.json({
            success: true,
            data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve treatment data'
        });
    }
});

// Get trigger analysis data
router.get('/trigger-data', async (req, res) => {
    try {
        const data = await ResearchDataService.collectTriggerData();
        res.json({
            success: true,
            data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve trigger data'
        });
    }
});

// Get comprehensive research insights
router.get('/insights', async (req, res) => {
    try {
        const insights = await ResearchDataService.generateResearchInsights();
        res.json({
            success: true,
            data: insights
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate research insights'
        });
    }
});

module.exports = router;
