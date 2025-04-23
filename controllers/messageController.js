const { mysqlPool } = require('../config/database');
const Message = require('../models/mongodb/Message');
const Conversation = require('../models/mongodb/Conversation');
const { MySQL } = require('../models');
const User = MySQL.User;
const multer = require('multer');
const path = require('path');
const { logger } = require('../middleware/logger');

// Cache for user data to avoid repeated DB queries
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getUserFromCache = async (userId) => {
  const cached = userCache.get(userId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.user;
  }
  
  const user = await User.findByPk(userId, {
    attributes: ['id', 'email', 'role', 'first_name', 'last_name', 'image_url']
  });
  
  if (user) {
    userCache.set(userId, {
      user,
      timestamp: Date.now()
    });
  }
  
  return user;
};

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
            res.json({ success: true, data: { url } });
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
                return res.status(404).json({ success: false, message: 'Doctor not found' });
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
                return res.json({ success: true, data: existingConversation });
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

            res.json({ success: true, data: conversation });
        } catch (error) {
            console.error('Create conversation error:', error);
            res.status(500).json({ success: false, message: 'Failed to create conversation' });
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
                const user = userRows[0] || { first_name: 'Unknown', last_name: '', role: otherParticipant.role, image_url: null };
                return {
                    id: conv._id,
                    participantId: otherParticipant.userId,
                    participantName: `${user.first_name} ${user.last_name}`.trim(),
                    participantRole: user.role,
                    participantImage: user.image_url,
                    lastMessage: conv.lastMessage,
                    unreadCount: conv.unreadCounts.get(userId) || 0,
                    status: conv.status,
                    updatedAt: conv.updatedAt
                };
            }));

            res.json({ success: true, data: conversationData });
        } catch (error) {
            console.error('Get conversations error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
        }
    },

    getMessages: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const startTime = Date.now();

            // Get messages with lean() for better performance
            const messages = await Message.find({ 
              conversationId,
              isDeleted: false 
            })
            .select('-__v')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

            // Format messages
            const formattedMessages = await Promise.all(messages.map(async (msg) => {
              const sender = await getUserFromCache(msg.senderId);
              return {
                id: msg._id,
                conversationId: msg.conversationId,
                content: msg.content,
                senderId: msg.senderId,
                senderRole: msg.senderRole,
                senderName: sender ? `${sender.first_name} ${sender.last_name}` : 'Unknown User',
                senderImage: sender?.image_url || null,
                timestamp: msg.createdAt,
                status: msg.status,
                type: msg.type,
                attachments: msg.attachments || []
              };
            }));

            logger.info(`GET messages completed in ${Date.now() - startTime}ms`);
            res.json({ success: true, data: formattedMessages.reverse() });
        } catch (error) {
            logger.error('Error getting messages:', error);
            res.status(500).json({ success: false, error: 'Failed to get messages' });
        }
    },

    sendMessage: async (req, res) => {
        try {
            const startTime = Date.now();
            const { conversationId } = req.params;
            const { content } = req.body;
            const userId = req.user.id;

            const sender = await getUserFromCache(userId);
            
            const message = await Message.create({
              conversationId,
              senderId: userId,
              senderRole: req.user.role,
              content,
              type: 'text',
              status: 'sent'
            });

            const messageData = {
              id: message._id,
              conversationId,
              content,
              senderId: userId,
              senderRole: req.user.role,
              senderName: sender ? `${sender.first_name} ${sender.last_name}` : 'Unknown User',
              senderImage: sender?.image_url || null,
              timestamp: message.createdAt,
              status: 'sent',
              type: 'text',
              attachments: []
            };

            // Emit to socket if available
            if (req.io) {
              req.io.to(conversationId).emit('new_message', messageData);
            }

            logger.info(`POST message completed in ${Date.now() - startTime}ms`);
            res.json({ success: true, data: messageData });
        } catch (error) {
            logger.error('Error sending message:', error);
            res.status(500).json({ success: false, error: 'Failed to send message' });
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
            res.status(500).json({ success: false, message: 'Failed to update message status' });
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
            res.status(500).json({ success: false, message: 'Failed to add reaction' });
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
                senderId: userId
            });

            if (!message) {
                return res.status(404).json({ success: false, message: 'Message not found' });
            }

            // Only allow deletion if user is the sender
            // Soft delete by marking content as deleted
            message.content = '[Message deleted]';
            message.isDeleted = true;
            message.deletedAt = new Date();
            await message.save();

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
                message: 'Failed to add reaction'
            });
        }
    },
};

module.exports = messageController;