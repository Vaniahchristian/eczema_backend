const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportDiagnosisData, exportAnalyticsReport } = require('../controllers/exportController');
const { sequelize } = require('../config/database');
const { MySQL } = require('../models');
const { Op } = require('sequelize');
const analyticsController = require('../controllers/analyticsController');
// Analytics routes are handled by analyticsController

// All routes require authentication
router.use(protect);

// Analytics data routes - accessible to all authenticated users
const { listAllDiagnoses } = require('../controllers/analyticsController');
router.get('/all-diagnoses', listAllDiagnoses);

// Export routes - accessible to all authenticated users
router.get('/export/diagnoses', authorize('doctor', 'admin', 'researcher', 'patient'), exportDiagnosisData);
router.get('/export/analytics', authorize('doctor', 'admin', 'researcher', 'patient'), exportAnalyticsReport);

// Analytics data routes - accessible to all authenticated users
router.get('/age-distribution', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getAgeDistribution);
router.get('/geographical-distribution', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getGeographicalDistribution);
router.get('/severity-distribution', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getSeverityDistribution);
router.get('/treatment-effectiveness', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getTreatmentEffectiveness);
router.get('/diagnosis-trends', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getDiagnosisTrends);
router.get('/survey-analytics', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getSurveyAnalytics);
router.get('/correlation-analytics', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getCorrelationAnalytics);

// Combined analytics - accessible to all authenticated users
router.get('/combined-analytics', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getCombinedAnalytics);

// Engagement analytics routes - accessible to all authenticated users
router.get('/daily-active-users', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getDailyActiveUsers);
router.get('/hourly-diagnoses', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getHourlyDiagnosisDistribution);
router.get('/user-retention', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getUserRetention);
router.get('/user-activity', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getUserActivity);

// Model confidence route - accessible to all authenticated users
router.get('/model-confidence', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getModelConfidence);

// Diagnosis history route - accessible to all authenticated users
router.get('/diagnosis-history', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getDiagnosisHistory);

// Doctor analytics routes - accessible to doctors, admins, and researchers
router.get('/doctor-performance', authorize('doctor', 'admin', 'researcher'), analyticsController.getDoctorPerformance);
router.get('/appointment-analytics', authorize('doctor', 'admin', 'researcher'), analyticsController.getAppointmentAnalytics);
router.get('/surveys', authorize('doctor', 'admin', 'researcher'), analyticsController.getSurveyAnalyticsNew);

// Admin dashboard endpoints
router.get('/total-users', authorize('admin'), analyticsController.getTotalUsers);
router.get('/system-uptime', authorize('admin'), analyticsController.getSystemUptime);
router.get('/active-sessions', authorize('admin'), analyticsController.getActiveSessions);
router.get('/error-rate', authorize('admin'), analyticsController.getErrorRate);
router.get('/recent-activity', authorize('admin'), analyticsController.getRecentActivity);
router.get('/alerts', authorize('admin'), analyticsController.getAlerts);

// System monitoring endpoints
router.get('/memory-usage', authorize('admin'), analyticsController.getMemoryUsage);
router.get('/cpu-load', authorize('admin'), analyticsController.getCpuLoad);
router.get('/api-response-times', authorize('admin'), analyticsController.getApiResponseTimes);
router.get('/system-logs', authorize('admin'), analyticsController.getSystemLogs);
router.get('/database-stats', authorize('admin'), analyticsController.getDatabaseStats);

// Patient-specific analytics endpoints (token-based)
router.get('/me/summary', authorize('patient'), analyticsController.getMySummary);
router.get('/me/severity-distribution', authorize('patient'), analyticsController.getMySeverityDistribution);
router.get('/me/body-part-frequency', authorize('patient'), analyticsController.getMyBodyPartFrequency);
router.get('/me/model-confidence-trend', authorize('patient'), analyticsController.getMyModelConfidenceTrend);
router.get('/me/diagnosis-count-trend', authorize('patient'), analyticsController.getMyDiagnosisTrends);
router.get('/me/doctor-review-impact', authorize('patient'), analyticsController.getMyDoctorReviewImpact);
router.get('/me/avg-confidence-by-severity', authorize('patient'), analyticsController.getMyAvgConfidenceBySeverity);
router.get('/me/recent-diagnoses', authorize('patient'), analyticsController.getMyRecentDiagnoses);

// Patient-specific analytics endpoints (admin/doctor access)
router.get('/patient/:patientId/summary', authorize('doctor', 'admin', 'researcher'), analyticsController.getPatientSummary);
router.get('/patient/:patientId/severity-distribution', authorize('doctor', 'admin', 'researcher'), analyticsController.getPatientSeverityDistribution);
router.get('/patient/:patientId/body-part-frequency', authorize('doctor', 'admin', 'researcher'), analyticsController.getPatientBodyPartFrequency);
router.get('/patient/:patientId/model-confidence-trend', authorize('doctor', 'admin', 'researcher'), analyticsController.getPatientModelConfidenceTrend);
router.get('/patient/:patientId/diagnosis-count-trend', authorize('doctor', 'admin', 'researcher'), analyticsController.getPatientDiagnosisTrends);
router.get('/patient/:patientId/doctor-review-impact', authorize('doctor', 'admin', 'researcher'), analyticsController.getPatientDoctorReviewImpact);
router.get('/patient/:patientId/avg-confidence-by-severity', authorize('doctor', 'admin', 'researcher'), analyticsController.getPatientAvgConfidenceBySeverity);
router.get('/patient/:patientId/recent-diagnoses', authorize('doctor', 'admin', 'researcher'), analyticsController.getPatientRecentDiagnoses);

// Analytics data routes - accessible to admins, doctors, and researchers
router.get('/diagnoses-count', authorize('admin', 'doctor', 'researcher'), analyticsController.getDiagnosesCount);

module.exports = router;
