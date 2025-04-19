const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Message = require('../models/mongodb/Message');
const Conversation = require('../models/mongodb/Conversation');
const { mysqlPool } = require('../config/database');

class SocketService {
    constructor(server) {
        console.log('Initializing SocketService...');
        this.io = new Server(server, {
            path: '/socket.io',
            cors: {
                origin: process.env.CLIENT_URL || 'https://eczema-dashboard-final.vercel.app',
                methods: ['GET', 'POST'],
                credentials: true
            },
            allowEIO3: true,
            transports: ['websocket', 'polling'],
            maxHttpBufferSize: 1e6,
            pingTimeout: 30000,
            pingInterval: 25000,
            upgradeTimeout: 10000,
            allowUpgrades: true,
            cookie: false
        });
        
        console.log('Socket.IO server created with config:', {
            cors: this.io.opts.cors,
            transports: this.io.opts.transports,
            path: this.io.opts.path
        });
        
        this.userSockets = new Map(); // userId -> Set of socket ids
        this.socketUsers = new Map(); // socket id -> userId

        this.setupMiddleware();
        this.setupEventHandlers();
        
        // Handle errors at the IO level
        this.io.engine.on('connection_error', (err) => {
            console.error('Socket.IO connection error:', err);
        });
    }

    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) {
                    console.log('Socket connection rejected: No token provided');
                    return next(new Error('Authentication error: No token provided'));
                }

                console.log('Authenticating socket connection...');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.userId = decoded.id;
                socket.userRole = decoded.role;
                
                // Validate user exists in database
                const [rows] = await mysqlPool.query(
                    'SELECT id, role FROM users WHERE id = ?',
                    [decoded.id]
                );
                
                if (!rows || rows.length === 0) {
                    console.log('Socket connection rejected: User not found');
                    return next(new Error('Authentication error: User not found'));
                }
                
                console.log(`Socket authenticated for user ${socket.userId} (${socket.userRole})`);
                next();
            } catch (error) {
                console.error('Socket authentication error:', error);
                next(new Error('Authentication error: Invalid token'));
            }
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`Socket connected - ID: ${socket.id}, User: ${socket.userId}, Role: ${socket.userRole}`);
            this.handleConnection(socket);

            socket.on('disconnect', () => {
                console.log(`Socket disconnected - ID: ${socket.id}, User: ${socket.userId}`);
                this.handleDisconnect(socket);
            });

            socket.on('join:conversation', (conversationId) => {
                console.log(`User ${socket.userId} joining conversation: ${conversationId}`);
                this.handleJoinConversation(socket, conversationId);
            });

            socket.on('leave:conversation', (conversationId) => {
                console.log(`User ${socket.userId} leaving conversation: ${conversationId}`);
                this.handleLeaveConversation(socket, conversationId);
            });

            socket.on('message:send', (data) => {
                console.log(`New message from user ${socket.userId} in conversation ${data.conversationId}:`, {
                    type: data.type,
                    hasAttachments: data.attachments?.length > 0
                });
                this.handleSendMessage(socket, data);
            });

            socket.on('message:typing', (data) => {
                console.log(`Typing status from user ${socket.userId} in conversation ${data.conversationId}: ${data.isTyping}`);
                this.handleTyping(socket, data);
            });

            socket.on('message:read', (data) => {
                console.log(`Message ${data.messageId} marked as read by user ${socket.userId}`);
                this.handleMessageRead(socket, data);
            });

            // Log any errors
            socket.on('error', (error) => {
                console.error(`Socket error for user ${socket.userId}:`, error);
            });
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
            console.log(`Processing message from ${socket.userId} in conversation ${conversationId}`);
            
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                console.log('Conversation not found:', conversationId);
                socket.emit('message:error', { error: 'Conversation not found' });
                return;
            }

            const isParticipant = conversation.participants.some(p => p.userId === socket.userId);
            if (!isParticipant) {
                console.log('User not authorized for conversation:', socket.userId);
                socket.emit('message:error', { error: 'Not authorized' });
                return;
            }

            // Create new message
            const message = await Message.create({
                conversationId,
                senderId: socket.userId,
                senderRole: socket.userRole,
                content,
                type,
                attachments,
                status: 'sent'
            });

            // Update conversation
            conversation.lastMessage = message._id;
            conversation.updatedAt = new Date();

            // Update unread counts for other participants
            conversation.participants.forEach(participant => {
                if (participant.userId !== socket.userId) {
                    const currentCount = conversation.unreadCounts.get(participant.userId) || 0;
                    conversation.unreadCounts.set(participant.userId, currentCount + 1);
                }
            });
            await conversation.save();

            // Get sender details
            const [senderRows] = await mysqlPool.query(
                'SELECT first_name, last_name, role, image_url FROM users WHERE id = ?',
                [socket.userId]
            );
            const sender = senderRows[0];

            const messageData = {
                id: message._id,
                conversationId,
                content,
                senderId: socket.userId,
                senderRole: socket.userRole,
                senderName: `${sender.first_name} ${sender.last_name}`,
                senderImage: sender.image_url,
                timestamp: message.createdAt,
                status: message.status,
                type,
                attachments
            };

            // Emit to all participants in the conversation
            this.io.to(`conversation:${conversationId}`).emit('message:new', messageData);

            // Send notifications to offline participants
            conversation.participants.forEach(participant => {
                if (participant.userId !== socket.userId && !this.userSockets.has(participant.userId)) {
                    console.log(`Should send push notification to user ${participant.userId}`);
                    // Implement push notification here
                }
            });

            console.log('Message sent successfully:', message._id);
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
            console.log(`Marking message ${messageId} as read by ${socket.userId}`);
            
            const message = await Message.findById(messageId);
            if (!message) {
                console.log('Message not found:', messageId);
                return;
            }

            const conversation = await Conversation.findById(message.conversationId);
            if (!conversation) {
                console.log('Conversation not found for message:', messageId);
                return;
            }

            // Verify user is participant
            const isParticipant = conversation.participants.some(p => p.userId === socket.userId);
            if (!isParticipant) {
                console.log('User not authorized to mark message as read:', socket.userId);
                return;
            }

            // Add user to readBy if not already present
            if (!message.readBy.some(read => read.userId === socket.userId)) {
                message.readBy.push({
                    userId: socket.userId,
                    timestamp: new Date()
                });
                message.status = 'read';
                await message.save();
            }

            // Update conversation unread count
            conversation.unreadCounts.set(socket.userId, 0);
            await conversation.save();

            // Notify sender
            this.io.to(`conversation:${message.conversationId}`).emit('message:status', {
                messageId: message._id,
                status: 'read',
                readBy: message.readBy
            });

            console.log('Message marked as read:', messageId);
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
