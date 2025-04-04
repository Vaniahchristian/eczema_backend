const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        userId: {
            type: String,  // MySQL user ID
            required: true
        },
        lastRead: {
            type: Date,
            default: Date.now
        }
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes for better query performance
conversationSchema.index({ 'participants.userId': 1 });
conversationSchema.index({ updatedAt: -1 });

// Method to get unread count for a user
conversationSchema.methods.getUnreadCount = async function(userId) {
    const Message = mongoose.model('Message');
    const participant = this.participants.find(p => p.userId === userId);
    
    if (!participant) return 0;

    return await Message.countDocuments({
        conversationId: this._id,
        receiverId: userId,
        status: { $ne: 'read' },
        createdAt: { $gt: participant.lastRead }
    });
};

module.exports = mongoose.model('Conversation', conversationSchema);
