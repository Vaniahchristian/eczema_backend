const mongoose = require('mongoose');

const eczemaRecordSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  images: [{
    url: String,
    uploadDate: {
      type: Date,
      default: Date.now
    },
    aiAnalysis: {
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe']
      },
      affectedArea: Number, // percentage
      confidence: Number
    },
    location: String // body part where the eczema is located
  }],
  symptoms: [{
    type: {
      type: String,
      enum: ['itching', 'redness', 'dryness', 'inflammation', 'other']
    },
    severity: {
      type: Number,
      min: 1,
      max: 10
    },
    date: {
      type: Date,
      default: Date.now
    }
  }],
  triggers: [{
    type: String,
    date: Date,
    notes: String
  }],
  treatments: [{
    name: String,
    type: {
      type: String,
      enum: ['medication', 'topical', 'lifestyle', 'other']
    },
    effectiveness: {
      type: Number,
      min: 1,
      max: 5
    },
    startDate: Date,
    endDate: Date,
    notes: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('EczemaRecord', eczemaRecordSchema);
