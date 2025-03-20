const Consultation = require('../models/Consultation');
const User = require('../models/User');

exports.scheduleConsultation = async (req, res) => {
  try {
    const { doctorId, scheduledTime, type } = req.body;

    const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const consultation = await Consultation.create({
      patient: req.user.id,
      doctor: doctorId,
      scheduledTime,
      type
    });

    res.status(201).json({
      success: true,
      data: consultation
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateConsultationStatus = async (req, res) => {
  try {
    const { consultationId } = req.params;
    const { status } = req.body;

    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    // Verify that the user is either the doctor or patient
    if (consultation.doctor.toString() !== req.user.id && 
        consultation.patient.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    consultation.status = status;
    await consultation.save();

    res.json({
      success: true,
      data: consultation
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.addDiagnosisAndPrescription = async (req, res) => {
  try {
    const { consultationId } = req.params;
    const { diagnosis, prescription, followUpDate } = req.body;

    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    // Verify that the user is the doctor
    if (consultation.doctor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    consultation.diagnosis = diagnosis;
    consultation.prescription = prescription;
    consultation.followUpDate = followUpDate;
    consultation.status = 'completed';
    
    await consultation.save();

    res.json({
      success: true,
      data: consultation
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getConsultations = async (req, res) => {
  try {
    const { role } = req.user;
    const query = role === 'doctor' 
      ? { doctor: req.user.id }
      : { patient: req.user.id };

    const consultations = await Consultation.find(query)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName specialization')
      .sort('-scheduledTime');

    res.json({
      success: true,
      data: consultations
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAvailableDoctors = async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' })
      .select('firstName lastName specialization');

    res.json({
      success: true,
      data: doctors
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
