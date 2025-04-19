const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Message = require('../models/mongodb/Message');
const Conversation = require('../models/mongodb/Conversation');
const { mysqlPool } = require('../config/database');

class SocketService {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.CLIENT_URL,
                methods: ['GET', 'POST'],
                credentials: true
            }
        });
        
        this.userSockets = new Map(); // userId -> Set of socket ids
        this.socketUsers = new Map(); // socket id -> userId

        this.setupMiddleware();
        this.setupEventHandlers();
    }

    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) {
                    return next(new Error('Authentication error'));
                }

                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.userId = decoded.id;
                socket.userRole = decoded.role;
                next();
            } catch (error) {
                next(new Error('Authentication error'));
            }
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`User connected: ${socket.userId}`);
            this.handleConnection(socket);

            socket.on('disconnect', () => this.handleDisconnect(socket));
            socket.on('join:conversation', (conversationId) => this.handleJoinConversation(socket, conversationId));
            socket.on('leave:conversation', (conversationId) => this.handleLeaveConversation(socket, conversationId));
            socket.on('message:send', (data) => this.handleSendMessage(socket, data));
            socket.on('message:typing', (data) => this.handleTyping(socket, data));
            socket.on('message:read', (data) => this.handleMessageRead(socket, data));
        });
    }

    handleConnection(socket) {
        // Add socket to user's set of sockets
        if (!this.userSockets.has(socket.userId)) {
            this.userSockets.set(socket.userId, new Set());
        }
        this.userSockets.get(socket.userId).add(socket.id);
        this.socketUsers.set(socket.id, socket.userId);

        // Notify user's contacts that they're online
        this.broadcastUserStatus(socket.userId, true);
    }

    handleDisconnect(socket) {
        console.log(`User disconnected: ${socket.userId}`);
        
        // Remove socket from user's set of sockets
        const userSockets = this.userSockets.get(socket.userId);
        if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
                this.userSockets.delete(socket.userId);
                // Notify user's contacts that they're offline
                this.broadcastUserStatus(socket.userId, false);
            }
        }
        this.socketUsers.delete(socket.id);
    }

    async handleJoinConversation(socket, conversationId) {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const isParticipant = conversation.participants.some(p => p.userId === socket.userId);
        if (!isParticipant) return;

        socket.join(`conversation:${conversationId}`);
    }

    handleLeaveConversation(socket, conversationId) {
        socket.leave(`conversation:${conversationId}`);
    }

    async handleSendMessage(socket, { conversationId, content, type = 'text', attachments = [] }) {
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) return;

            const isParticipant = conversation.participants.some(p => p.userId === socket.userId);
            if (!isParticipant) return;

            // Get the other participant
            const otherParticipant = conversation.participants.find(p => p.userId !== socket.userId);
            
            // Create message
            const message = await Message.create({
                conversationId,
                patientId: socket.userRole === 'patient' ? socket.userId : otherParticipant.userId,
                doctorId: socket.userRole === 'doctor' ? socket.userId : otherParticipant.userId,
                fromDoctor: socket.userRole === 'doctor',
                content,
                type,
                attachments
            });

            // Update conversation's last message
            await Conversation.updateOne(
                { _id: conversationId },
                { 
                    lastMessage: message._id,
                    updatedAt: new Date()
                }
            );

            // Get sender details from MySQL
            const [rows] = await mysqlPool.query(
                'SELECT first_name AS firstName, last_name AS lastName, role, image_url AS profileImage FROM users WHERE id = ?',
                [socket.userId]
            );
            const sender = rows[0];

            const messageData = {
                id: message._id,
                conversationId,
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

            // Emit to all participants in the conversation
            this.io.to(`conversation:${conversationId}`).emit('message:new', messageData);

            // Send notification to offline participants
            const offlineParticipantId = otherParticipant.userId;
            if (!this.userSockets.has(offlineParticipantId)) {
                // Here you would integrate with your push notification service
                console.log(`Should send push notification to user ${offlineParticipantId}`);
            }
        } catch (error) {
            console.error('Error in handleSendMessage:', error);
            socket.emit('message:error', { error: 'Failed to send message' });
        }
    }

    handleTyping(socket, { conversationId, isTyping }) {
        socket.to(`conversation:${conversationId}`).emit('message:typing', {
            userId: socket.userId,
            isTyping
        });
    }

    async handleMessageRead(socket, { messageId }) {
        try {
            const message = await Message.findById(messageId);
            if (!message) return;

            // Verify user is participant
            const isRecipient = (socket.userRole === 'doctor' && !message.fromDoctor) ||
                              (socket.userRole === 'patient' && message.fromDoctor);
            if (!isRecipient) return;

            await Message.updateOne({ _id: messageId }, { status: 'read' });

            // Notify sender that message was read
            const senderId = message.fromDoctor ? message.doctorId : message.patientId;
            const senderSockets = this.userSockets.get(senderId);
            if (senderSockets) {
                senderSockets.forEach(socketId => {
                    this.io.to(socketId).emit('message:status', {
                        messageId,
                        status: 'read'
                    });
                });
            }
        } catch (error) {
            console.error('Error in handleMessageRead:', error);
        }
    }

    broadcastUserStatus(userId, isOnline) {
        this.io.emit('user:status', {
            userId,
            status: isOnline ? 'online' : 'offline'
        });
    }

    // Helper method to emit events to specific users
    emitToUser(userId, event, data) {
        const userSockets = this.userSockets.get(userId);
        if (userSockets) {
            userSockets.forEach(socketId => {
                this.io.to(socketId).emit(event, data);
            });
        }
    }
}

module.exports = SocketService;
