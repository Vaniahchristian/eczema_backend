const { mysqlPool } = require('../config/database');
const Message = require('../models/mongodb/Message');
const Conversation = require('../models/mongodb/Conversation');
const multer = require('multer');
const path = require('path');
const { socketService } = require('../services/socketService');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Ensure this directory exists
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

const uploadFile = [
    upload.single('file'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }
            const url = `/uploads/${req.file.filename}`; // Adjust based on your server setup
            res.json({ success: true, url });
        } catch (error) {
            console.error('Error in uploadFile:', error);
            res.status(500).json({ success: false, message: 'Failed to upload file' });
        }
    }
];

const messageController = {
    uploadFile,

    createConversation: async (req, res) => {
        try {
            const { doctorId } = req.body;
            const patientId = req.user.id;

            // Validate doctor exists
            const [doctorRows] = await mysqlPool.query(
                'SELECT id, first_name, last_name, role FROM users WHERE id = ? AND role = ?',
                [doctorId, 'doctor']
            );

            if (!doctorRows || doctorRows.length === 0) {
                return res.status(404).json({ error: 'Doctor not found' });
            }

            // Check if conversation already exists
            const existingConversation = await Conversation.findOne({
                'participants': {
                    $all: [
                        { $elemMatch: { userId: patientId, role: 'patient' } },
                        { $elemMatch: { userId: doctorId, role: 'doctor' } }
                    ]
                }
            });

            if (existingConversation) {
                return res.json(existingConversation);
            }

            // Create new conversation
            const conversation = await Conversation.create({
                participants: [
                    { userId: patientId, role: 'patient' },
                    { userId: doctorId, role: 'doctor' }
                ],
                status: 'active',
                unreadCounts: new Map([[patientId, 0], [doctorId, 0]])
            });

            res.json(conversation);
        } catch (error) {
            console.error('Create conversation error:', error);
            res.status(500).json({ error: 'Failed to create conversation' });
        }
    },

    getConversations: async (req, res) => {
        try {
            const userId = req.user.id;
            const userRole = req.user.role;

            // Find all conversations where user is a participant
            const conversations = await Conversation.find({
                'participants.userId': userId,
                status: 'active'
            })
            .sort({ updatedAt: -1 })
            .populate('lastMessage');

            // Get other participants' details from MySQL
            const conversationData = await Promise.all(conversations.map(async (conv) => {
                const otherParticipant = conv.participants.find(p => p.userId !== userId);
                
                const [userRows] = await mysqlPool.query(
                    'SELECT first_name, last_name, role, image_url FROM users WHERE id = ?',
                    [otherParticipant.userId]
                );

                const user = userRows[0];
                
                return {
                    id: conv._id,
                    participantId: otherParticipant.userId,
                    participantName: `${user.first_name} ${user.last_name}`,
                    participantRole: user.role,
                    participantImage: user.image_url,
                    lastMessage: conv.lastMessage,
                    unreadCount: conv.unreadCounts.get(userId) || 0,
                    status: conv.status,
                    updatedAt: conv.updatedAt
                };
            }));

            res.json(conversationData);
        } catch (error) {
            console.error('Get conversations error:', error);
            res.status(500).json({ error: 'Failed to fetch conversations' });
        }
    },

    getMessages: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const userId = req.user.id;

            // Verify user is participant
            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });

            if (!conversation) {
                return res.status(403).json({ error: 'Not authorized to view this conversation' });
            }

            // Get messages
            const messages = await Message.find({ conversationId })
                .sort({ createdAt: -1 })
                .limit(50);

            // Mark messages as read
            await Message.updateMany(
                {
                    conversationId,
                    senderId: { $ne: userId },
                    'readBy.userId': { $ne: userId }
                },
                {
                    $push: {
                        readBy: {
                            userId,
                            timestamp: new Date()
                        }
                    }
                }
            );

            // Update unread count
            conversation.unreadCounts.set(userId, 0);
            await conversation.save();

            res.json(messages);
        } catch (error) {
            console.error('Get messages error:', error);
            res.status(500).json({ error: 'Failed to fetch messages' });
        }
    },

    sendMessage: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const { content, type = 'text', attachments = [] } = req.body;
            const userId = req.user.id;
            const userRole = req.user.role;

            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found' });
            }

            const participant = conversation.participants.find(p => p.userId === userId);
            if (!participant) {
                return res.status(403).json({ success: false, message: 'Not authorized to send messages' });
            }

            const otherParticipant = conversation.participants.find(p => p.userId !== userId);
            if (!otherParticipant) {
                return res.status(400).json({ success: false, message: 'No other participant found' });
            }

            // Create message with new schema format
            const messageData = {
                conversationId,
                senderId: userId,
                senderRole: userRole,
                content,
                type,
                attachments,
                status: 'sent'
            };

            const message = await Message.create(messageData);

            // Update conversation
            conversation.lastMessage = message._id;
            const otherIdx = conversation.participants.findIndex(p => p.userId !== userId);
            conversation.participants[otherIdx].unreadCount = (conversation.participants[otherIdx].unreadCount || 0) + 1;
            await conversation.save();

            // Get sender details
            const [rows] = await mysqlPool.query(
                'SELECT id, first_name as firstName, last_name as lastName, role, image_url as profileImage FROM users WHERE id = ?',
                [userId]
            );
            const sender = rows[0] || { firstName: 'Unknown', lastName: 'User' };

            // Format response
            const formattedMessage = {
                id: message._id,
                conversationId: message.conversationId,
                content,
                senderId: message.senderId,
                senderRole: message.senderRole,
                senderName: `${sender.firstName} ${sender.lastName}`,
                senderImage: sender.profileImage,
                timestamp: message.createdAt,
                status: message.status,
                type,
                attachments
            };

            res.json({ success: true, data: formattedMessage });
        } catch (error) {
            console.error('Error in sendMessage:', error);
            res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to send message'
            });
        }
    },

    updateMessageStatus: async (req, res) => {
        try {
            const userId = req.user.id;
            const { messageId } = req.params;
            const { status } = req.body;

            const message = await Message.findOne({
                _id: messageId,
                $or: [
                    { fromDoctor: true, doctorId: { $ne: userId } },
                    { fromDoctor: false, patientId: { $ne: userId } }
                ]
            });

            if (!message) {
                return res.status(403).json({ success: false, message: 'Not authorized to update this message status' });
            }

            await Message.updateOne({ _id: messageId }, { status });

            res.json({ success: true, data: { status } });
        } catch (error) {
            console.error('Error in updateMessageStatus:', error);
            res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to update message status'
            });
        }
    },

    addReaction: async (req, res) => {
        try {
            const userId = req.user.id;
            const { messageId } = req.params;
            const { reaction } = req.body;

            const message = await Message.findOne({
                _id: messageId,
                $or: [
                    { fromDoctor: true, doctorId: { $ne: userId } },
                    { fromDoctor: false, patientId: { $ne: userId } }
                ]
            });

            if (!message) {
                return res.status(403).json({ success: false, message: 'Not authorized to react to this message' });
            }

            await Message.updateOne({ _id: messageId }, { reaction });

            res.json({ success: true, data: { reaction } });
        } catch (error) {
            console.error('Error in addReaction:', error);
            res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to add reaction'
            });
        }
    },

    getConversation: async (req, res) => {
        try {
            const userId = req.user.id;
            const { conversationId } = req.params;

            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            }).populate('lastMessage');

            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found' });
            }

            const otherParticipant = conversation.participants.find(p => p.userId !== userId);
            const [userRows] = await mysqlPool.query(
                'SELECT id, first_name AS firstName, last_name AS lastName, role, image_url AS profileImage FROM users WHERE id = ?',
                [otherParticipant.userId]
            );
            const participantDetail = userRows[0];

            const unreadCount = conversation.unreadCounts.get(userId) || 0;

            const formattedConversation = {
                id: conversation._id,
                participantId: otherParticipant.userId,
                participantName: participantDetail ? `${participantDetail.firstName} ${participantDetail.lastName}` : 'Unknown User',
                participantRole: participantDetail?.role || 'unknown',
                participantImage: participantDetail?.profileImage,
                unreadCount,
                status: conversation.status,
                lastMessage: conversation.lastMessage ? {
                    id: conversation.lastMessage._id,
                    content: conversation.lastMessage.content,
                    timestamp: conversation.lastMessage.createdAt,
                    status: conversation.lastMessage.status
                } : null
            };

            res.json({ success: true, data: formattedConversation });
        } catch (error) {
            console.error('Error in getConversation:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
        }
    },

    updateConversation: async (req, res) => {
        try {
            const userId = req.user.id;
            const { conversationId } = req.params;
            const { isActive } = req.body;

            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });

            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found' });
            }

            conversation.status = isActive ? 'active' : 'archived';
            await conversation.save();

            res.json({ success: true, data: { isActive } });
        } catch (error) {
            console.error('Error in updateConversation:', error);
            res.status(500).json({ success: false, message: 'Failed to update conversation' });
        }
    },

    archiveConversation: async (req, res) => {
        try {
            const userId = req.user.id;
            const { conversationId } = req.params;

            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });

            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found' });
            }

            conversation.status = 'archived';
            await conversation.save();

            res.json({ success: true, message: 'Conversation archived successfully' });
        } catch (error) {
            console.error('Error in archiveConversation:', error);
            res.status(500).json({ success: false, message: 'Failed to archive conversation' });
        }
    },

    deleteMessage: async (req, res) => {
        try {
            const userId = req.user.id;
            const { messageId } = req.params;

            const message = await Message.findOne({
                _id: messageId,
                $or: [
                    { patientId: userId },
                    { doctorId: userId }
                ]
            });

            if (!message) {
                return res.status(404).json({ success: false, message: 'Message not found' });
            }

            // Only allow deletion if user is the sender
            const isSender = (message.fromDoctor && message.doctorId === userId) ||
                           (!message.fromDoctor && message.patientId === userId);

            if (!isSender) {
                return res.status(403).json({ success: false, message: 'Not authorized to delete this message' });
            }

            // Soft delete by marking content as deleted
            await Message.updateOne(
                { _id: messageId },
                { 
                    content: '[Message deleted]',
                    isDeleted: true,
                    deletedAt: new Date()
                }
            );

            res.json({ success: true, message: 'Message deleted successfully' });
        } catch (error) {
            console.error('Error in deleteMessage:', error);
            res.status(500).json({ success: false, message: 'Failed to delete message' });
        }
    },

    removeReaction: async (req, res) => {
        try {
            const userId = req.user.id;
            const { messageId } = req.params;

            const message = await Message.findOne({
                _id: messageId,
                $or: [
                    { fromDoctor: true, doctorId: { $ne: userId } },
                    { fromDoctor: false, patientId: { $ne: userId } }
                ]
            });

            if (!message) {
                return res.status(403).json({ success: false, message: 'Not authorized to remove reaction from this message' });
            }

            await Message.updateOne({ _id: messageId }, { $unset: { reaction: 1 } });

            res.json({ success: true, message: 'Reaction removed successfully' });
        } catch (error) {
            console.error('Error in removeReaction:', error);
            res.status(500).json({ success: false, message: 'Failed to remove reaction' });
        }
    },

    setTypingStatus: async (req, res) => {
        try {
            const userId = req.user.id;
            const { conversationId } = req.params;
            const { isTyping } = req.body;

            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });

            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found' });
            }

            // This will be handled by WebSocket, just return success
            res.json({ success: true });
        } catch (error) {
            console.error('Error in setTypingStatus:', error);
            res.status(500).json({ success: false, message: 'Failed to set typing status' });
        }
    },

    reactToMessage: async (req, res) => {
        try {
            const { messageId } = req.params;
            const { type } = req.body;
            const userId = req.user.id;

            // Validate reaction type
            if (!type || typeof type !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid reaction type'
                });
            }

            const message = await Message.findById(messageId);
            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            const conversation = await Conversation.findById(message.conversationId);
            if (!conversation) {
                return res.status(404).json({
                    success: false,
                    message: 'Conversation not found'
                });
            }

            // Verify user is participant
            const isParticipant = conversation.participants.some(p => p.userId === userId);
            if (!isParticipant) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to react to this message'
                });
            }

            // Check if user has already reacted
            const existingReactionIndex = message.reactions.findIndex(r => r.userId === userId);

            if (existingReactionIndex !== -1) {
                // If same reaction type, remove it (toggle off)
                if (message.reactions[existingReactionIndex].type === type) {
                    message.reactions.splice(existingReactionIndex, 1);
                } else {
                    // Update existing reaction type
                    message.reactions.set(existingReactionIndex, {
                        userId,
                        type,
                        timestamp: new Date()
                    });
                }
            } else {
                // Add new reaction
                message.reactions.push({
                    userId,
                    type,
                    timestamp: new Date()
                });
            }

            const updatedMessage = await message.save();

            // Get user details for the reaction
            const [userRows] = await mysqlPool.query(
                'SELECT first_name, last_name, image_url FROM users WHERE id = ?',
                [userId]
            );
            const user = userRows[0];

            // Emit WebSocket event for real-time updates
            req.app.get('io').to(`conversation:${message.conversationId}`).emit('message:reaction', {
                messageId: updatedMessage._id,
                reactions: updatedMessage.reactions,
                latestReaction: {
                    userId,
                    userName: `${user.first_name} ${user.last_name}`,
                    userImage: user.image_url,
                    type,
                    timestamp: new Date()
                }
            });

            res.json({
                success: true,
                data: {
                    messageId: updatedMessage._id,
                    reactions: updatedMessage.reactions
                }
            });
        } catch (error) {
            console.error('Error in reactToMessage:', error);
            res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to add reaction'
            });
        }
    },
};

module.exports = messageController;