const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  scheduleConsultation,
  updateConsultationStatus,
  addDiagnosisAndPrescription,
  getConsultations,
  getAvailableDoctors
} = require('../controllers/consultationController');

router.post('/schedule', protect, scheduleConsultation);
router.put('/:consultationId/status', protect, updateConsultationStatus);
router.put('/:consultationId/diagnosis', protect, authorize('doctor'), addDiagnosisAndPrescription);
router.get('/list', protect, getConsultations);
router.get('/doctors', protect, getAvailableDoctors);

module.exports = router;
