const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  analyzeImage,
  updateSymptoms,
  addTreatment,
  getPatientHistory
} = require('../controllers/eczemaController');

router.post('/analyze', protect, upload.single('image'), analyzeImage);
router.post('/record/:recordId/symptoms', protect, updateSymptoms);
router.post('/record/:recordId/treatment', protect, addTreatment);
router.get('/history', protect, getPatientHistory);

module.exports = router;
