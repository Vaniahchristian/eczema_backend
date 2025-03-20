const mongoose = require('mongoose');

const consultationSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scheduledTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  type: {
    type: String,
    enum: ['video', 'chat'],
    required: true
  },
  diagnosis: {
    symptoms: [String],
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe']
    },
    notes: String
  },
  prescription: [{
    medication: String,
    dosage: String,
    frequency: String,
    duration: String
  }],
  followUpDate: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Consultation', consultationSchema);
