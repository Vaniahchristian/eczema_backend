const mongoose = require('mongoose');

const diagnosisSchema = new mongoose.Schema({
  diagnosisId: {
    type: String,
    required: true,
    unique: true
  },
  patientId: {
    type: String,
    required: true,
    ref: 'User'
  },
  imageId: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  imageMetadata: {
    originalFileName: String,
    uploadDate: Date,
    fileSize: Number,
    format: {
      type: String,
      enum: ['JPEG', 'PNG']
    }
  },
  mlResults: {
    hasEczema: Boolean,
    confidence: Number,
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe']
    },
    affectedAreas: [String],
    bodyPartConfidence: Number,
    modelVersion: String
  },
  recommendations: {
    treatments: [{
      type: String,
      description: String,
      priority: Number
    }],
    lifestyle: [{
      category: String,
      recommendations: [String]
    }],
    triggers: [String],
    precautions: [String]
  },
  status: {
    type: String,
    enum: ['pending_review', 'completed', 'reviewed'],
    default: 'pending_review'
  },
  doctorReview: {
    doctorId: String,
    review: String,
    reviewedAt: Date,
    updatedSeverity: {
      type: String,
      enum: ['mild', 'moderate', 'severe']
    },
    treatmentPlan: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Diagnosis', diagnosisSchema);
