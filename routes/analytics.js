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
const {
    exportPatientRecords,
    exportDiagnosisData,
    exportAnalyticsReport
} = require('../controllers/exportController');

// All analytics routes require authentication and doctor/admin role
router.use(protect);
router.use(authorize('doctor', 'admin'));

// Analytics endpoints
router.get('/age-distribution', getAgeDistribution);
router.get('/geographical-distribution', getGeographicalDistribution);
router.get('/treatment-effectiveness', getTreatmentEffectiveness);
router.get('/model-confidence', getModelConfidence);
router.get('/diagnosis-history', getDiagnosisHistory);

// Export endpoints
router.get('/export/patients', exportPatientRecords);
router.get('/export/diagnoses', exportDiagnosisData);
router.get('/export/analytics', exportAnalyticsReport);

module.exports = router;
