const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
    getAgeDistribution,
    getGeographicalDistribution,
    getTreatmentEffectiveness,
    getModelConfidence,
    getDiagnosisHistory
} = require('../controllers/analyticsController');

// All analytics routes require authentication and doctor/admin role
router.use(protect);
router.use(authorize('doctor', 'admin'));

// Get age distribution of eczema cases
router.get('/age-distribution', getAgeDistribution);

// Get geographical distribution of cases
router.get('/geographical-distribution', getGeographicalDistribution);

// Get treatment effectiveness statistics
router.get('/treatment-effectiveness', getTreatmentEffectiveness);

// Get ML model confidence distribution
router.get('/model-confidence', getModelConfidence);

// Get diagnosis history with trends
router.get('/diagnosis-history', getDiagnosisHistory);

module.exports = router;
