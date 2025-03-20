const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  analysisId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['demographic', 'geographic', 'treatment'],
    required: true
  },
  period: {
    start: Date,
    end: Date
  },
  data: {
    ageDistribution: [{
      range: String,
      count: Number,
      percentage: Number
    }],
    geographicalData: [{
      region: String,
      count: Number,
      severity: {
        mild: Number,
        moderate: Number,
        severe: Number
      }
    }],
    treatmentEffectiveness: [{
      treatment: String,
      successRate: Number,
      totalCases: Number,
      averageRecoveryTime: Number
    }],
    modelConfidence: {
      averageConfidence: Number,
      confidenceDistribution: [{
        range: String,
        count: Number
      }]
    }
  },
  metadata: {
    generatedBy: String,
    generatedAt: Date,
    dataPoints: Number
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Analytics', analyticsSchema);
