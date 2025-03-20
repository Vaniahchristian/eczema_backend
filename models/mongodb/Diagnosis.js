const mongoose = require('mongoose');

const treatmentSchema = new mongoose.Schema({
  type: String,
  description: String,
  priority: Number
}, { _id: false });

const lifestyleRecommendationSchema = new mongoose.Schema({
  category: String,
  recommendations: [String]
}, { _id: false });

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
    treatments: [treatmentSchema],
    lifestyle: [lifestyleRecommendationSchema],
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
