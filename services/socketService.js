const jwt = require('jsonwebtoken');
const Message = require('../models/mongodb/Message');
const Conversation = require('../models/mongodb/Conversation');
const { mysqlPool } = require('../config/database');

class SocketService {
    constructor(io) {
        console.log('Initializing SocketService...');
        this.io = io;
        
        // Maps to track user connections
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
                    return next(new Error('Authentication error: No token provided'));
                }

                // Verify JWT token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                // Get user from MySQL
                const [rows] = await mysqlPool.query(
                    'SELECT id, role FROM users WHERE id = ?',
                    [decoded.id]
                );

                if (!rows.length) {
                    return next(new Error('Authentication error: User not found'));
                }

                socket.userId = rows[0].id;
                socket.userRole = rows[0].role;
                next();
            } catch (error) {
                console.error('Socket authentication error:', error);
                next(new Error('Authentication error'));
            }
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`Socket connected: ${socket.id} (User: ${socket.userId})`);

            // Add socket to user's set of connections
            if (!this.userSockets.has(socket.userId)) {
                this.userSockets.set(socket.userId, new Set());
            }
            this.userSockets.get(socket.userId).add(socket.id);
            this.socketUsers.set(socket.id, socket.userId);

            // Join conversation
            socket.on('join:conversation', (conversationId) => {
                console.log(`User ${socket.userId} joining conversation ${conversationId}`);
                socket.join(`conversation:${conversationId}`);
            });

            // Leave conversation
            socket.on('leave:conversation', (conversationId) => {
                console.log(`User ${socket.userId} leaving conversation ${conversationId}`);
                socket.leave(`conversation:${conversationId}`);
            });

            // Handle new message
            socket.on('message:send', this.handleSendMessage.bind(this, socket));

            // Handle message read status
            socket.on('message:read', this.handleMessageRead.bind(this, socket));

            // Handle typing status
            socket.on('user:typing', ({ conversationId, isTyping }) => {
                socket.to(`conversation:${conversationId}`).emit('user:typing', {
                    userId: socket.userId,
                    isTyping
                });
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log(`Socket disconnected: ${socket.id} (User: ${socket.userId})`);
                
                // Remove socket from user's connections
                const userId = this.socketUsers.get(socket.id);
                if (userId) {
                    const userSockets = this.userSockets.get(userId);
                    if (userSockets) {
                        userSockets.delete(socket.id);
                        if (userSockets.size === 0) {
                            this.userSockets.delete(userId);
                        }
                    }
                    this.socketUsers.delete(socket.id);
                }
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
