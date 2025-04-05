const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    patientId: {
        type: String, // MySQL user ID
        required: true
    },
    doctorId: {
        type: String, // MySQL user ID
        required: true
    },
    fromDoctor: {
        type: Boolean,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'file', 'voice', 'ai-suggestion'],
        default: 'text'
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent'
    },
    attachments: [{
        url: String,
        type: String,
        name: String,
        size: Number
    }],
    reaction: String,
    isAiSuggestion: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes for better query performance
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ patientId: 1, doctorId: 1 });
messageSchema.index({ status: 1 });

module.exports = mongoose.model('Message', messageSchema);