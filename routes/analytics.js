const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportDiagnosisData, exportAnalyticsReport } = require('../controllers/exportController');
const { sequelize } = require('../config/database');
const { MySQL } = require('../models');
const { Op } = require('sequelize');
const analyticsController = require('../controllers/analyticsController');

// All routes require authentication
router.use(protect);

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

// Engagement analytics routes - accessible to all authenticated users
router.get('/daily-active-users', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getDailyActiveUsers);
router.get('/hourly-diagnoses', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getHourlyDiagnosisDistribution);
router.get('/user-retention', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getUserRetention);
router.get('/user-activity', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getUserActivity);

// Model confidence route - accessible to all authenticated users
router.get('/model-confidence', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getModelConfidence);

// Diagnosis history route - accessible to all authenticated users
router.get('/diagnosis-history', authorize('doctor', 'admin', 'researcher', 'patient'), analyticsController.getDiagnosisHistory);

module.exports = router;
