const mongoose = require('mongoose');
const { mysqlPool } = require('../../config/database');

const conversationSchema = new mongoose.Schema({
    participants: [{
        userId: {
            type: String,  // MySQL user ID
            required: true,
            index: true
        },
        role: {
            type: String,
            enum: ['patient', 'doctor'],
            required: true
        }
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    status: {
        type: String,
        enum: ['active', 'archived'],
        default: 'active'
    },
    unreadCounts: {
        type: Map,
        of: Number,
        default: new Map()
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    }
}, {
    timestamps: true
});

// Compound index for faster participant queries
conversationSchema.index({ 'participants.userId': 1, status: 1 });
conversationSchema.index({ updatedAt: -1 });

// Static method to find conversations with user details
conversationSchema.statics.findWithUserDetails = async function(userId) {
    const conversations = await this.find({
        'participants.userId': userId,
        status: 'active'
    }).sort({ updatedAt: -1 });

    // Get all unique participant IDs except the current user
    const participantIds = [...new Set(
        conversations.flatMap(conv => 
            conv.participants
                .filter(p => p.userId !== userId)
                .map(p => p.userId)
        )
    )];

    // Get user details from MySQL in a single query
    const [userRows] = await mysqlPool.query(
        'SELECT id, first_name, last_name, role, image_url FROM users WHERE id IN (?)',
        [participantIds]
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

    // Enhance conversations with user details
    return conversations.map(conv => {
        const otherParticipant = conv.participants.find(p => p.userId !== userId);
        const userDetails = userMap.get(otherParticipant.userId) || {
            name: 'Unknown User',
            role: otherParticipant.role,
            imageUrl: null
        };

        return {
            id: conv._id,
            participantId: otherParticipant.userId,
            participantName: userDetails.name,
            participantRole: userDetails.role,
            participantImage: userDetails.imageUrl,
            unreadCount: conv.unreadCounts.get(userId) || 0,
            status: conv.status,
            lastMessage: conv.lastMessage,
            updatedAt: conv.updatedAt
        };
    });
};

// Method to update unread counts
conversationSchema.methods.updateUnreadCount = async function(userId, increment = true) {
    const count = this.unreadCounts.get(userId) || 0;
    this.unreadCounts.set(userId, increment ? count + 1 : 0);
    return this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);