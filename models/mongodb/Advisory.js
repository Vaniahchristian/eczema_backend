const mongoose = require('mongoose');

const advisorySchema = new mongoose.Schema({
  advisoryId: {
    type: String,
    required: true,
    unique: true
  },
  category: {
    type: String,
    enum: ['lifestyle', 'treatment', 'prevention'],
    required: true
  },
  content: {
    title: {
      type: String,
      required: true
    },
    description: String,
    recommendations: [{
      title: String,
      description: String,
      priority: Number
    }],
    references: [{
      title: String,
      url: String,
      publishDate: Date
    }]
  },
  targetAudience: [{
    type: String,
    enum: ['patients', 'doctors']
  }],
  severity: [{
    type: String,
    enum: ['mild', 'moderate', 'severe']
  }],
  metadata: {
    author: String,
    reviewedBy: String,
    version: Number
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Advisory', advisorySchema);
