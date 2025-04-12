const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
    getAgeDistribution,
    getGeographicalDistribution,
    getTreatmentEffectiveness,
    getModelConfidence,
    getDiagnosisHistory,
    getDoctorPerformance,
    getDoctorAppointments,
    getDoctorClinicalInsights
} = require('../controllers/analyticsController');
const {
    exportPatientRecords,
    exportDiagnosisData,
    exportAnalyticsReport
} = require('../controllers/exportController');

// All analytics routes require authentication
router.use(protect);

// General analytics endpoints - accessible to all authenticated users
router.get('/age-distribution', authorize('doctor', 'admin', 'researcher', 'patient'), getAgeDistribution);
router.get('/geographical-distribution', authorize('doctor', 'admin', 'researcher', 'patient'), getGeographicalDistribution);
router.get('/treatment-effectiveness', authorize('doctor', 'admin', 'researcher', 'patient'), getTreatmentEffectiveness);
router.get('/model-confidence', authorize('doctor', 'admin', 'researcher', 'patient'), getModelConfidence);
router.get('/diagnosis-history', authorize('doctor', 'admin', 'researcher', 'patient'), getDiagnosisHistory);

// Doctor-specific analytics endpoints - only accessible to doctors and admins
router.get('/doctor/:doctorId/performance', authorize('doctor', 'admin'), getDoctorPerformance);
router.get('/doctor/:doctorId/appointments', authorize('doctor', 'admin'), getDoctorAppointments);
router.get('/doctor/:doctorId/clinical-insights', authorize('doctor', 'admin'), getDoctorClinicalInsights);

// Export endpoints - accessible to all authenticated users
router.get('/export/patients', authorize('doctor', 'admin', 'researcher', 'patient'), exportPatientRecords);
router.get('/export/diagnoses', authorize('doctor', 'admin', 'researcher', 'patient'), exportDiagnosisData);
router.get('/export/analytics', authorize('doctor', 'admin', 'researcher', 'patient'), exportAnalyticsReport);

module.exports = router;
