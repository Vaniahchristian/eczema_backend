const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const {
  analyzeImage,
  updateSymptoms,
  getPatientHistory
} = require('../controllers/eczemaController');

// Image analysis and diagnosis
router.post('/analyze', protect, upload.single('image'), handleUploadError, analyzeImage);

// Update symptoms and severity for an existing diagnosis
router.post('/diagnosis/:recordId/symptoms', protect, updateSymptoms);

// Get patient's diagnosis history
router.get('/history', protect, getPatientHistory);

module.exports = router;
