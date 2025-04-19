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

    getConversations: async (req, res) => {
        try {
            const userId = req.user.id;
            const conversations = await Conversation.aggregate([
                { $match: { 'participants.userId': userId } },
                { $sort: { updatedAt: -1 } },
                { $lookup: { from: 'messages', localField: 'lastMessage', foreignField: '_id', as: 'lastMessage' } },
                { $unwind: { path: '$lastMessage', preserveNullAndEmptyArrays: true } }
            ]);

            // Hydrate aggregation results into Mongoose models
            const hydratedConversations = conversations.map(conv => Conversation.hydrate(conv));

            const participantIds = hydratedConversations.flatMap(conv =>
                conv.participants.map(p => p.userId).filter(id => id !== userId)
            );
            const allUserIds = [...new Set([userId, ...participantIds])];
            if (allUserIds.length === 0) {
                return res.json({ success: true, data: [] });
            }

            const [rows] = await mysqlPool.query(
                'SELECT id, first_name AS firstName, last_name AS lastName, role, image_url AS profileImage FROM users WHERE id IN (?)',
                [allUserIds]
            );
            const userMap = new Map(rows.map(row => [row.id, row]));

            const formattedConversations = await Promise.all(hydratedConversations.map(async conv => {
                const otherParticipant = conv.participants.find(p => p.userId !== userId);
                if (!otherParticipant) return null;
                const participantDetail = userMap.get(otherParticipant.userId);

                const unreadCount = await conv.getUnreadCount(userId);

                return {
                    id: conv._id,
                    participantId: otherParticipant.userId,
                    participantName: participantDetail ? `${participantDetail.firstName} ${participantDetail.lastName}` : 'Unknown User',
                    participantRole: participantDetail?.role || 'unknown',
                    participantImage: participantDetail?.profileImage,
                    unreadCount,
                    status: conv.isActive ? 'active' : 'archived',
                    lastMessage: conv.lastMessage ? {
                        id: conv.lastMessage._id,
                        content: conv.lastMessage.content,
                        timestamp: conv.lastMessage.createdAt,
                        status: conv.lastMessage.status
                    } : null
                };
            }));

            res.json({ success: true, data: formattedConversations.filter(Boolean) });
        } catch (error) {
            console.error('Error in getConversations:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
        }
    },

    getMessages: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const userId = req.user.id;
            const { page = 1, limit = 20 } = req.query;

            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });
            if (!conversation) {
                return res.status(403).json({ success: false, message: 'Not authorized to view these messages' });
            }

            const messages = await Message.find({ conversationId })
                .sort('createdAt')
                .skip((page - 1) * limit)
                .limit(parseInt(limit));

            if (messages.length === 0) {
                return res.json({ success: true, data: [] });
            }

            const userIds = [...new Set(messages.flatMap(m => [m.patientId, m.doctorId]))];
            if (userIds.length === 0) {
                return res.json({ success: true, data: [] });
            }

            const [rows] = await mysqlPool.query(
                'SELECT id, first_name as firstName, last_name as lastName, role, image_url as profileImage FROM users WHERE id IN (?)',
                [userIds]
            );
            const userMap = new Map(rows.map(row => [row.id, row]));

            const formattedMessages = messages.map(message => {
                const sender = userMap.get(message.fromDoctor ? message.doctorId : message.patientId);
                if (!sender) return null;

                return {
                    id: message._id,
                    content: message.content,
                    patientId: message.patientId,
                    doctorId: message.doctorId,
                    fromDoctor: message.fromDoctor,
                    senderName: `${sender.firstName} ${sender.lastName}`,
                    senderRole: sender.role,
                    senderImage: sender.profileImage,
                    timestamp: message.createdAt,
                    status: message.status,
                    type: message.type || 'text',
                    attachments: message.attachments || []
                };
            }).filter(Boolean);

            res.json({ success: true, data: formattedMessages });
        } catch (error) {
            console.error('Error in getMessages:', error);
            res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to fetch messages'
            });
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

            const fromDoctor = userRole === 'doctor';
            const messageData = {
                conversationId,
                patientId: fromDoctor ? otherParticipant.userId : userId,
                doctorId: fromDoctor ? userId : otherParticipant.userId,
                fromDoctor,
                content,
                type,
                attachments,
                status: 'sent'
            };

            const message = await Message.create(messageData);

            conversation.lastMessage = message._id;
            const otherIdx = conversation.participants.findIndex(p => p.userId !== userId);
            conversation.participants[otherIdx].unreadCount = (conversation.participants[otherIdx].unreadCount || 0) + 1;
            await conversation.save();

            const [rows] = await mysqlPool.query(
                'SELECT id, first_name as firstName, last_name as lastName, role, image_url as profileImage FROM users WHERE id = ?',
                [userId]
            );
            const sender = rows[0] || { firstName: 'Unknown', lastName: 'User' };

            const formattedMessage = {
                id: message._id,
                conversationId: message.conversationId,
                content,
                patientId: message.patientId,
                doctorId: message.doctorId,
                fromDoctor: message.fromDoctor,
                senderName: `${sender.firstName} ${sender.lastName}`,
                senderRole: sender.role,
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

    createConversation: async (req, res) => {
        try {
            const { doctorId } = req.body;
            const patientId = req.user.id;

            // Check if doctor exists
            const [doctors] = await mysqlPool.query(
                'SELECT u.id, u.first_name, u.last_name, dp.specialty FROM users u INNER JOIN doctor_profiles dp ON u.id = dp.user_id WHERE u.id = ? AND u.role = "doctor"',
                [doctorId]
            );

            if (doctors.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor not found'
                });
            }

            // Check if conversation already exists
            const [existingConversations] = await mysqlPool.query(
                'SELECT id FROM conversations WHERE (patient_id = ? AND doctor_id = ?) OR (patient_id = ? AND doctor_id = ?)',
                [patientId, doctorId, doctorId, patientId]
            );

            if (existingConversations.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Conversation already exists'
                });
            }

            // Create new conversation
            const [result] = await mysqlPool.query(
                'INSERT INTO conversations (patient_id, doctor_id) VALUES (?, ?)',
                [patientId, doctorId]
            );

            const conversationId = result.insertId;

            // Get conversation details
            const [conversations] = await mysqlPool.query(`
                SELECT 
                    c.id,
                    c.patient_id as patientId,
                    c.doctor_id as doctorId,
                    CONCAT(u.first_name, ' ', u.last_name) as participantName,
                    u.role as participantRole,
                    dp.specialty,
                    dp.rating
                FROM conversations c
                INNER JOIN users u ON u.id = c.doctor_id
                INNER JOIN doctor_profiles dp ON dp.user_id = c.doctor_id
                WHERE c.id = ?
            `, [conversationId]);

            if (conversations.length === 0) {
                throw new Error('Failed to fetch created conversation');
            }

            const conversation = {
                id: conversations[0].id,
                participantId: conversations[0].doctorId,
                participantName: conversations[0].participantName,
                participantRole: conversations[0].participantRole,
                participantImage: '/placeholder.svg',
                specialty: conversations[0].specialty,
                rating: conversations[0].rating,
                unreadCount: 0
            };

            // Notify the doctor about new conversation
            socketService.emitToUser(doctorId, 'conversation:new', conversation);

            res.json({
                success: true,
                data: conversation
            });
        } catch (error) {
            console.error('Create conversation error:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating conversation'
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

            const unreadCount = await conversation.getUnreadCount(userId);

            const formattedConversation = {
                id: conversation._id,
                participantId: otherParticipant.userId,
                participantName: participantDetail ? `${participantDetail.firstName} ${participantDetail.lastName}` : 'Unknown User',
                participantRole: participantDetail?.role || 'unknown',
                participantImage: participantDetail?.profileImage,
                unreadCount,
                status: conversation.isActive ? 'active' : 'archived',
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

            conversation.isActive = isActive;
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

            conversation.isActive = false;
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

    reactToMessage: function(req, res) {
        return this.addReaction(req, res);
    }
};

module.exports = messageController;