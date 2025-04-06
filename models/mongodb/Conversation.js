const mongoose = require('mongoose');
const { mysqlPool } = require('../config/database');

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
conversationSchema.methods.getUnreadCount = async function (userId) {
    const Message = mongoose.model('Message');
    const participant = this.participants.find(p => p.userId === String(userId));
    if (!participant) return 0;

    const otherParticipant = this.participants.find(p => p.userId !== String(userId));
    if (!otherParticipant) return 0;

    // Fetch the role of the other participant from MySQL
    const [rows] = await mysqlPool.query(
        'SELECT role FROM users WHERE id = ?',
        [otherParticipant.userId]
    );
    const otherUserRole = rows[0]?.role;

    if (!otherUserRole) {
        console.warn(`No role found for user ${otherParticipant.userId}`);
        return 0; // Fallback to 0 if user not found
    }

    const fromDoctor = otherUserRole === 'doctor';

    return await Message.countDocuments({
        conversationId: this._id,
        fromDoctor, // True if the other participant is a doctor
        status: { $ne: 'read' },
        createdAt: { $gt: participant.lastRead }
    });
};

module.exports = mongoose.model('Conversation', conversationSchema);