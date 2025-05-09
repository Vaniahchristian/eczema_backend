const mongoose = require('mongoose');

const apiStatsSchema = new mongoose.Schema({
  endpoint: { type: String, required: true },
  responseTime: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ApiStats', apiStatsSchema);
