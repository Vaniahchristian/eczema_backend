const { mysqlPool } = require('../config/database');
const Message = require('../models/mongodb/Message');
const Conversation = require('../models/mongodb/Conversation');

const messageController = {
    getConversations: async (req, res) => {
        try {
            const userId = req.user.id;

            // Fetch conversations with aggregation for efficiency
            const conversations = await Conversation.aggregate([
                { $match: { 'participants.userId': userId } },
                { $sort: { updatedAt: -1 } },
                { $lookup: { from: 'messages', localField: 'lastMessage', foreignField: '_id', as: 'lastMessage' } },
                { $unwind: { path: '$lastMessage', preserveNullAndEmptyArrays: true } }
            ]);

            // Batch fetch participant details from MySQL
            const participantIds = conversations.flatMap(conv =>
                conv.participants.map(p => p.userId).filter(id => id !== userId)
            );
            const allUserIds = [...new Set([userId, ...participantIds])];
            const [rows] = await mysqlPool.query(
                'SELECT id, first_name as firstName, last_name as lastName, role, image_url as profileImage FROM users WHERE id IN (?)',
                [allUserIds]
            );
            const userMap = new Map(rows.map(row => [row.id, row]));

            // Format conversations
            const formattedConversations = conversations.map(conv => {
                const otherParticipant = conv.participants.find(p => p.userId !== userId);
                if (!otherParticipant) return null;
                const participantDetail = userMap.get(otherParticipant.userId);

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
                        status: conv.lastMessage.status
                    } : null
                };
            }).filter(Boolean);

            res.json({ success: true, data: formattedConversations });
        } catch (error) {
            console.error('Error in getConversations:', error);
            res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to fetch conversations'
            });
        }
    },

    getMessages: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const userId = req.user.id;
            const { page = 1, limit = 20 } = req.query;

            // Verify user is part of the conversation
            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId
            });
            if (!conversation) {
                return res.status(403).json({ success: false, message: 'Not authorized to view these messages' });
            }

            // Fetch messages with pagination
            const messages = await Message.find({ conversationId })
                .sort('createdAt')
                .skip((page - 1) * limit)
                .limit(parseInt(limit));

            // Batch fetch user details
            const userIds = [...new Set(messages.flatMap(m => [m.patientId, m.doctorId]))];
            const [rows] = await mysqlPool.query(
                'SELECT id, first_name as firstName, last_name as lastName, role, image_url as profileImage FROM users WHERE id IN (?)',
                [userIds]
            );
            const userMap = new Map(rows.map(row => [row.id, row]));

            // Format messages
            const formattedMessages = messages.map(msg => {
                const sender = userMap.get(msg.fromDoctor ? msg.doctorId : msg.patientId) ||
                    { firstName: 'Unknown', lastName: 'User' };

                return {
                    id: msg._id,
                    conversationId: msg.conversationId,
                    content: msg.content,
                    patientId: msg.patientId,
                    doctorId: msg.doctorId,
                    fromDoctor: msg.fromDoctor,
                    senderName: `${sender.firstName} ${sender.lastName}`,
                    senderRole: sender.role,
                    senderImage: sender.profileImage,
                    timestamp: msg.createdAt,
                    status: msg.status,
                    type: msg.type,
                    attachments: msg.attachments
                };
            });

            // Update lastRead for the user
            const participantIdx = conversation.participants.findIndex(p => p.userId === userId);
            conversation.participants[participantIdx].lastRead = new Date();
            await conversation.save();

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

            // Validate conversation
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

            // Determine sender/receiver roles
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

            // Create message
            const message = await Message.create(messageData);

            // Update conversation
            conversation.lastMessage = message._id;
            const otherIdx = conversation.participants.findIndex(p => p.userId !== userId);
            conversation.participants[otherIdx].unreadCount = (conversation.participants[otherIdx].unreadCount || 0) + 1;
            await conversation.save();

            // Fetch sender details
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
            const userId = req.user.id;
            const { participantId } = req.body;

            // Check for existing conversation
            const existingConversation = await Conversation.findOne({
                participants: { $all: [{ userId }, { userId: participantId }] }
            });

            if (existingConversation) {
                return res.json({ success: true, data: { id: existingConversation._id } });
            }

            // Create new conversation
            const conversation = await Conversation.create({
                participants: [{ userId }, { userId: participantId }]
            });

            res.json({ success: true, data: { id: conversation._id } });
        } catch (error) {
            console.error('Error in createConversation:', error);
            res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to create conversation'
            });
        }
    },

    updateMessageStatus: async (req, res) => {
        try {
            const userId = req.user.id;
            const { messageId } = req.params;
            const { status } = req.body;

            // Verify recipient can update status
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

            // Verify recipient can react
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
    }
};

module.exports = messageController;