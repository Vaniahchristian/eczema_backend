const mongoose = require('mongoose');
const { mysqlPool } = require('../../config/database');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },
    senderId: {
        type: String,  // MySQL user ID
        required: true,
        index: true
    },
    senderRole: {
        type: String,
        enum: ['patient', 'doctor'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'file'],
        default: 'text',
        index: true
    },
    attachments: [{
        url: String,
        name: String,
        type: String,
        size: Number
    }],
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent',
        index: true
    },
    readBy: [{
        userId: String,  // MySQL user ID
        timestamp: Date
    }],
    reactions: [{
        userId: String,  // MySQL user ID
        type: String,
        timestamp: Date
    }],
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Compound indexes for common queries
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, status: 1 });
messageSchema.index({ 'readBy.userId': 1 });

// Static method to find messages with user details
messageSchema.statics.findWithUserDetails = async function(query) {
    const messages = await this.find(query).sort({ createdAt: -1 });

    // Get all unique sender IDs
    const senderIds = [...new Set(messages.map(msg => msg.senderId))];

    // Get user details from MySQL in a single query
    const [userRows] = await mysqlPool.query(
        'SELECT id, first_name, last_name, role, image_url FROM users WHERE id IN (?)',
        [senderIds]
    );

    // Create a map of user details
    const userMap = new Map(userRows.map(user => [
        user.id,
        {
            name: `${user.first_name} ${user.last_name}`,
            role: user.role,
            imageUrl: user.image_url
        }
    ]));

    // Enhance messages with sender details
    return messages.map(msg => {
        const sender = userMap.get(msg.senderId) || {
            name: 'Unknown User',
            role: msg.senderRole,
            imageUrl: null
        };

        return {
            id: msg._id,
            conversationId: msg.conversationId,
            content: msg.content,
            senderId: msg.senderId,
            senderName: sender.name,
            senderRole: sender.role,
            senderImage: sender.imageUrl,
            type: msg.type,
            attachments: msg.attachments,
            status: msg.status,
            readBy: msg.readBy,
            reactions: msg.reactions,
            createdAt: msg.createdAt,
            updatedAt: msg.updatedAt
        };
    });
};

module.exports = mongoose.model('Message', messageSchema);