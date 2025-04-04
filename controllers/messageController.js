const { v4: uuidv4 } = require('uuid');
const { MySQL } = require('../models');
const Message = require('../models/mongodb/Message');
const Conversation = require('../models/mongodb/Conversation');

const messageController = {
    getConversations: async (req, res) => {
        try {
            const userId = req.user.id;

            // Get conversations where user is a participant
            const conversations = await Conversation.find({
                'participants.userId': userId
            })
                .sort('-updatedAt')
                .populate('lastMessage');

            // Get user details from MySQL for all participants
            const participantIds = conversations.flatMap(conv =>
                conv.participants.map(p => p.userId).filter(id => id !== userId)
            );

            const [participantDetails] = await MySQL.query(
                'SELECT id, firstName, lastName, role, profileImage FROM users WHERE id IN (?)',
                [participantIds]
            );

            // Format conversations
            const formattedConversations = conversations.map(conv => {
                const otherParticipant = conv.participants.find(p => p.userId !== userId);
                const participantDetail = participantDetails.find(p => p.id === otherParticipant.userId);

                return {
                    id: conv._id,
                    participantId: otherParticipant.userId,
                    participantName: participantDetail ? `${participantDetail.firstName} ${participantDetail.lastName}` : 'Unknown User',
                    participantRole: participantDetail?.role || 'Unknown',
                    participantImage: participantDetail?.profileImage,
                    unreadCount: otherParticipant.unreadCount || 0,
                    lastMessage: conv.lastMessage ? {
                        id: conv.lastMessage._id,
                        content: conv.lastMessage.content,
                        timestamp: conv.lastMessage.createdAt,
                        senderId: conv.lastMessage.senderId,
                        status: conv.lastMessage.status,
                        type: conv.lastMessage.type,
                        attachments: conv.lastMessage.attachments
                    } : null,
                    updatedAt: conv.updatedAt
                };
            });

            res.json({
                success: true,
                data: formattedConversations
            });
        } catch (error) {
            console.error('Error in getConversations:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch conversations'
            });
        }
    },

    getMessages: async (req, res) => {
        try {
            const userId = req.user.id;
            const { conversationId } = req.params;
            const { page = 1, limit = 50 } = req.query;

            // Verify user is part of the conversation
            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });

            if (!conversation) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to view this conversation'
                });
            }

            // Get messages with pagination
            const messages = await Message.find({ conversationId })
                .sort('-createdAt')
                .skip((page - 1) * limit)
                .limit(limit);

            // Get sender details from MySQL
            const senderIds = [...new Set(messages.map(m => m.senderId))];
            const [senderDetails] = await MySQL.query(
                'SELECT id, firstName, lastName, profileImage FROM users WHERE id IN (?)',
                [senderIds]
            );

            // Format messages
            const formattedMessages = messages.map(msg => {
                const sender = senderDetails.find(s => s.id === msg.senderId);
                return {
                    id: msg._id,
                    conversationId: msg.conversationId,
                    content: msg.content,
                    senderId: msg.senderId,
                    senderName: sender ? `${sender.firstName} ${sender.lastName}` : 'Unknown User',
                    senderImage: sender?.profileImage,
                    timestamp: msg.createdAt,
                    status: msg.status,
                    type: msg.type,
                    attachments: msg.attachments,
                    reaction: msg.reaction
                };
            });

            // Mark messages as read
            await Message.updateMany(
                {
                    conversationId,
                    senderId: { $ne: userId },
                    status: { $ne: 'read' }
                },
                { status: 'read' }
            );

            // Update conversation unread count
            await Conversation.updateOne(
                { _id: conversationId, 'participants.userId': userId },
                { $set: { 'participants.$.unreadCount': 0 } }
            );

            res.json({
                success: true,
                data: formattedMessages,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: await Message.countDocuments({ conversationId })
                }
            });
        } catch (error) {
            console.error('Error in getMessages:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch messages'
            });
        }
    },

    sendMessage: async (req, res) => {
        try {
            const userId = req.user.id;
            const { conversationId } = req.params;
            const { content, type = 'text', attachments = [] } = req.body;

            // Verify user is part of the conversation
            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });

            if (!conversation) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to send messages in this conversation'
                });
            }

            // Create new message
            const message = await Message.create({
                conversationId,
                senderId: userId,
                content,
                type,
                attachments,
                status: 'sent'
            });

            // Update conversation
            await Conversation.updateOne(
                { _id: conversationId },
                {
                    lastMessage: message._id,
                    updatedAt: new Date(),
                    $inc: {
                        'participants.$[other].unreadCount': 1
                    }
                },
                {
                    arrayFilters: [{ 'other.userId': { $ne: userId } }]
                }
            );

            // Get sender details
            const [sender] = await MySQL.query(
                'SELECT firstName, lastName, profileImage FROM users WHERE id = ?',
                [userId]
            );

            const formattedMessage = {
                id: message._id,
                conversationId,
                content,
                senderId: userId,
                senderName: sender[0] ? `${sender[0].firstName} ${sender[0].lastName}` : 'Unknown User',
                senderImage: sender[0]?.profileImage,
                timestamp: message.createdAt,
                status: message.status,
                type,
                attachments
            };

            res.json({
                success: true,
                data: formattedMessage
            });
        } catch (error) {
            console.error('Error in sendMessage:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send message'
            });
        }
    },

    createConversation: async (req, res) => {
        try {
            const userId = req.user.id;
            const { participantId } = req.body;

            // Check if conversation already exists
            const existingConversation = await Conversation.findOne({
                'participants': {
                    $all: [
                        { $elemMatch: { userId } },
                        { $elemMatch: { userId: participantId } }
                    ]
                }
            });

            if (existingConversation) {
                return res.json({
                    success: true,
                    data: { id: existingConversation._id }
                });
            }

            // Create new conversation
            const conversation = await Conversation.create({
                participants: [
                    { userId },
                    { userId: participantId }
                ]
            });

            res.json({
                success: true,
                data: { id: conversation._id }
            });
        } catch (error) {
            console.error('Error in createConversation:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create conversation'
            });
        }
    },

    updateMessageStatus: async (req, res) => {
        try {
            const userId = req.user.id;
            const { messageId } = req.params;
            const { status } = req.body;

            // Verify user can update this message's status
            const message = await Message.findOne({
                _id: messageId,
                senderId: { $ne: userId } // Only recipient can update status
            });

            if (!message) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to update this message status'
                });
            }

            await Message.updateOne(
                { _id: messageId },
                { status }
            );

            res.json({
                success: true,
                data: { status }
            });
        } catch (error) {
            console.error('Error in updateMessageStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update message status'
            });
        }
    },

    addReaction: async (req, res) => {
        try {
            const userId = req.user.id;
            const { messageId } = req.params;
            const { reaction } = req.body;

            // Verify user can react to this message
            const message = await Message.findOne({
                _id: messageId,
                senderId: { $ne: userId } // Only recipient can react
            });

            if (!message) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to react to this message'
                });
            }

            await Message.updateOne(
                { _id: messageId },
                { reaction }
            );

            res.json({
                success: true,
                data: { reaction }
            });
        } catch (error) {
            console.error('Error in addReaction:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add reaction'
            });
        }
    }
};

module.exports = messageController;
