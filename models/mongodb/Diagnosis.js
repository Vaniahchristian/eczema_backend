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
  imageMetadata: {
    originalFileName: String,
    uploadDate: Date,
    fileSize: Number,
    dimensions: {
      width: Number,
      height: Number
    },
    imageQuality: Number,
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
    differentialDiagnosis: [{
      condition: String,
      probability: Number
    }],
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
  doctorReview: {
    reviewedBy: String,
    reviewDate: Date,
    comments: String,
    adjustments: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      reason: String
    }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Diagnosis', diagnosisSchema);
