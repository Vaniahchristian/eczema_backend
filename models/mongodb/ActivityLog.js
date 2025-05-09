const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['system', 'error', 'security', 'user', 'diagnosis']
    },
    message: {
        type: String,
        required: true
    },
    level: {
        type: String,
        required: true,
        enum: ['info', 'warning', 'error', 'critical']
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
});

// Index on timestamp for efficient queries
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ type: 1, level: 1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;
