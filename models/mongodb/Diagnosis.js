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
    prediction: {
      type: String,
      required: true
    },
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
    enum: ['pending_review', 'in_review', 'reviewed'],
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
  },

  needsDoctorReview: {
    type: Boolean,
    default: false
  },
  // Pre-diagnosis survey data
  preDiagnosisSurvey: {
    eczemaHistory: {
      type: String,
      enum: ['new', '<1', '1-5', '5-10', '>10']
    },
    lastFlareup: {
      type: String,
      enum: ['current', '<1w', '1-4w', '1-6m', '>6m']
    },
    flareupTriggers: [String],
    currentSymptoms: String,
    previousTreatments: String,
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe']
    }
  },
  // Post-diagnosis survey data
  postDiagnosisSurvey: {
    diagnosisAccuracy: {
      type: Number,
      min: 1,
      max: 10
    },
    diagnosisHelpfulness: {
      type: Number,
      min: 1,
      max: 10
    },
    treatmentClarity: {
      type: Number,
      min: 1,
      max: 10
    },
    userConfidence: {
      type: Number,
      min: 1,
      max: 10
    },
    feedback: String,
    wouldRecommend: Boolean,
    submittedAt: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Diagnosis', diagnosisSchema);
