const EczemaRecord = require('../models/EczemaRecord');
const sharp = require('sharp');

// Dummy function to simulate eczema analysis
const analyzeEczemaImage = async (imagePath) => {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Return random severity and confidence for demo purposes
  const severities = ['mild', 'moderate', 'severe'];
  const randomIndex = Math.floor(Math.random() * 3);
  const confidence = 0.7 + (Math.random() * 0.3); // Random confidence between 0.7 and 1.0
  
  return {
    severity: severities[randomIndex],
    confidence: confidence
  };
};

exports.analyzeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Get analysis from dummy function
    const analysis = await analyzeEczemaImage(req.file.path);
    
    // Create new eczema record
    const record = await EczemaRecord.create({
      patient: req.user.id,
      imagePath: req.file.path,
      severity: analysis.severity,
      confidence: analysis.confidence,
      date: new Date()
    });

    res.status(201).json({
      success: true,
      data: {
        severity: analysis.severity,
        confidence: analysis.confidence,
        recordId: record._id
      }
    });

  } catch (error) {
    console.error('Error in analyzeImage:', error);
    res.status(500).json({
      success: false,
      error: 'Error processing image'
    });
  }
};

exports.updateSymptoms = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { symptoms } = req.body;

    const record = await EczemaRecord.findOne({
      _id: recordId,
      patient: req.user.id
    });

    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    record.symptoms.push(...symptoms);
    await record.save();

    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.addTreatment = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { treatment } = req.body;

    const record = await EczemaRecord.findOne({
      _id: recordId,
      patient: req.user.id
    });

    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    record.treatments.push(treatment);
    await record.save();

    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getPatientHistory = async (req, res) => {
  try {
    const records = await EczemaRecord.find({ patient: req.user.id })
      .sort('-createdAt')
      .populate('patient', 'firstName lastName');

    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
