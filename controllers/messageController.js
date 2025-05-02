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
            // Accept both doctorId and participantId for compatibility
            const doctorId = req.body.doctorId || req.body.participantId;
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

            // --- Notification Trigger ---
            try {
                const { notificationService } = require('../server');
                await notificationService.sendDoctorMessage(doctorId, 'New Patient', 'A new conversation has been started.');
            } catch (notifErr) {
                console.error('Notification error (createConversation):', notifErr);
            }
            // --- End Notification Trigger ---

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
            .sort({ updatedAt: -1 });

            // For each conversation, fetch the latest message
            const conversationData = await Promise.all(conversations.map(async (conv) => {
                const otherParticipant = conv.participants.find(p => p.userId !== userId);
                const [userRows] = await mysqlPool.query(
                    'SELECT first_name, last_name, role, image_url FROM users WHERE id = ?',
                    [otherParticipant.userId]
                );
                const user = userRows[0] || { first_name: 'Unknown', last_name: '', role: otherParticipant.role, image_url: null };
                // Fetch the latest message for this conversation
                const lastMessage = await Message.findOne({ conversationId: conv._id }).sort({ createdAt: -1 });
                return {
                    id: conv._id,
                    participantId: otherParticipant.userId,
                    participantName: `${user.first_name} ${user.last_name}`.trim(),
                    participantRole: user.role,
                    participantImage: user.image_url,
                    lastMessage: lastMessage,
                    unreadCount: conv.unreadCounts.get ? conv.unreadCounts.get(userId) || 0 : (conv.unreadCounts[userId] || 0),
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
            const userId = req.user.id;
            const conversationId = req.body.conversationId || req.params.conversationId;
            const content = req.body.content;

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

            // Update unread count for all other participants
            const conversation = await Conversation.findById(conversationId);
            if (conversation && conversation.unreadCounts) {
                for (const participant of conversation.participants) {
                    if (participant.userId !== userId) {
                        if (conversation.unreadCounts instanceof Map) {
                            conversation.unreadCounts.set(participant.userId, (conversation.unreadCounts.get(participant.userId) || 0) + 1);
                        } else {
                            conversation.unreadCounts[participant.userId] = (conversation.unreadCounts[participant.userId] || 0) + 1;
                        }
                    }
                }
                await conversation.save();
            }

            // Emit to socket if available
            if (req.io) {
                // For each recipient, emit with their unread count
                if (conversation) {
                    const updatedUnreadCounts = conversation.unreadCounts instanceof Map ? Object.fromEntries(conversation.unreadCounts) : conversation.unreadCounts;
                    for (const participant of conversation.participants) {
                        if (participant.userId !== userId) {
                            const unreadCount = updatedUnreadCounts[participant.userId] || 0;
                            // Emit the message:new event
                            console.log('[Backend] Emitting message:new to user:', participant.userId, 'with unreadCount:', unreadCount, 'and messageData:', messageData);
                            req.io.to(`user:${participant.userId}`).emit('message:new', {
                                conversationId,
                                message: messageData,
                                unreadCount
                            });
                        }
                    }
                } else {
                    console.warn('[Backend] req.io is undefined, cannot emit message:new');
                }
                // Still emit to the conversation room for real-time updates
                req.io.to(conversationId).emit('new_message', messageData);
            }

            // --- Notification Trigger ---
            const notificationService = require('../server').notificationService;
            if (notificationService && notificationService.sendDoctorMessage) {
                try {
                    // Find conversation participants
                    const conversation = await Conversation.findById(conversationId);
                    // Get sender details
                    const sender = await User.findByPk(userId);
                    const senderName = sender ? `${sender.first_name} ${sender.last_name}` : 'Someone';
                    const senderRole = sender ? sender.role : 'user';
                    let title, message;
                    if (senderRole === 'doctor') {
                        title = 'New Message from Doctor';
                        message = `Dr. ${senderName} has sent you a message`;
                    } else if (senderRole === 'patient') {
                        title = 'New Message from Patient';
                        message = `${senderName} has sent you a message`;
                    } else {
                        title = 'New Message';
                        message = `${senderName} has sent you a message`;
                    }
                    if (conversation) {
                        for (const participant of conversation.participants) {
                            if (participant.userId !== userId) {
                                await notificationService.sendDoctorMessage(
                                    participant.userId,
                                    senderName,
                                    content,
                                    title,
                                    message
                                );
                            }
                        }
                    }
                } catch (notifErr) {
                    console.error('Notification error (sendMessage):', notifErr);
                }
            } else {
                console.error('NotificationService is not available in sendMessage');
            }
            // --- End Notification Trigger ---

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

            // For REST fallback, emit a WebSocket event for typing status
            if (req.app && req.app.get('io')) {
                req.app.get('io').to(`conversation:${conversationId}`).emit('conversation:typing', {
                    conversationId,
                    userId,
                    isTyping: !!isTyping,
                    timestamp: new Date()
                });
            }

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

    markConversationAsRead: async (req, res) => {
        try {
            const userId = req.user.id;
            const { conversationId } = req.params;

            // Ensure user is a participant
            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });
            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found' });
            }

            // Update all messages in this conversation where user hasn't read yet
            const now = new Date();
            const updateResult = await Message.updateMany(
                {
                    conversationId,
                    'readBy.userId': { $ne: userId }
                },
                {
                    $push: { readBy: { userId, timestamp: now } },
                    $set: { status: 'read' }
                }
            );

            // Optionally, update conversation unreadCounts map for this user
            if (conversation.unreadCounts && conversation.unreadCounts instanceof Map) {
                conversation.unreadCounts.set(userId, 0);
                await conversation.save();
            } else if (conversation.unreadCounts) {
                // If it's a plain object
                conversation.unreadCounts[userId] = 0;
                await conversation.save();
            }

            // Emit WebSocket event for real-time update (if needed)
            if (req.app && req.app.get('io')) {
                req.app.get('io').to(`conversation:${conversationId}`).emit('conversation:read', {
                    conversationId,
                    userId,
                    timestamp: now
                });
            }

            res.json({ success: true, updated: updateResult.modifiedCount });
        } catch (error) {
            console.error('Error in markConversationAsRead:', error);
            res.status(500).json({ success: false, message: 'Failed to mark conversation as read' });
        }
    },
};

module.exports = messageController;