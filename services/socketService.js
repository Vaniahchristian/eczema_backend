const jwt = require('jsonwebtoken');
const Message = require('../models/mongodb/Message');
const Conversation = require('../models/mongodb/Conversation');
const { mysqlPool } = require('../config/database');

class SocketService {
    constructor(io) {
        console.log('🔧 Initializing SocketService...');
        this.io = io;
        
        // Maps to track user connections
        this.userSockets = new Map(); // userId -> Set of socket ids
        this.socketUsers = new Map(); // socket id -> userId

        // Log initial state
        console.log('📊 SocketService State:', {
            userSockets: this.userSockets.size,
            socketUsers: this.socketUsers.size,
            timestamp: new Date().toISOString()
        });

        // Monitor socket.io events at the server level
        this.io.on('connect_error', (err) => {
            console.error('❌ Socket.IO Connection Error:', {
                error: err.message,
                timestamp: new Date().toISOString()
            });
        });

        this.io.on('connect_timeout', (timeout) => {
            console.log('⏰ Socket.IO Connection Timeout:', {
                timeout,
                timestamp: new Date().toISOString()
            });
        });

        this.io.engine.on('connection_error', (err) => {
            console.error('❌ Socket.IO Engine Error:', {
                error: err.message,
                code: err.code,
                context: err.context,
                timestamp: new Date().toISOString()
            });
        });

        this.setupAuthentication();
        this.setupEventHandlers();
        console.log('✅ SocketService initialized successfully');
        
        // Handle errors at the IO level
        this.io.engine.on('connection_error', (err) => {
            console.error('Socket.IO connection error:', err);
        });
    }

    setupAuthentication() {
        console.log('🔐 Setting up Socket authentication...');
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
                
                if (!token) {
                    console.log('❌ Socket auth failed: No token provided');
                    return next(new Error('Authentication error: No token provided'));
                }

                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                // Log auth attempt
                console.log('🔑 Socket auth attempt:', {
                    socketId: socket.id,
                    token: token ? '***' : undefined,
                    timestamp: new Date().toISOString()
                });

                const [rows] = await mysqlPool.query(
                    'SELECT id, role FROM users WHERE id = ?',
                    [decoded.id]
                );

                if (!rows || rows.length === 0) {
                    console.log('❌ Socket auth failed: User not found', {
                        userId: decoded.id,
                        socketId: socket.id
                    });
                    return next(new Error('Authentication error: User not found'));
                }

                socket.userId = rows[0].id;
                socket.userRole = rows[0].role;

                console.log('✅ Socket authenticated:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    userRole: socket.userRole,
                    timestamp: new Date().toISOString()
                });

                next();
            } catch (error) {
                console.error('❌ Socket authentication error:', {
                    error: error.message,
                    stack: error.stack,
                    socketId: socket.id,
                    timestamp: new Date().toISOString()
                });
                next(new Error('Authentication error'));
            }
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            // Log detailed connection info
            console.log('🔌 WebSocket Connected:', {
                socketId: socket.id,
                userId: socket.userId,
                userRole: socket.userRole,
                query: socket.handshake.query,
                headers: {
                    ...socket.handshake.headers,
                    authorization: socket.handshake.headers.authorization ? '***' : undefined
                },
                transport: socket.conn.transport.name,
                timestamp: new Date().toISOString()
            });

            // Add socket to user's set of connections
            if (!this.userSockets.has(socket.userId)) {
                this.userSockets.set(socket.userId, new Set());
            }
            this.userSockets.get(socket.userId).add(socket.id);
            this.socketUsers.set(socket.id, socket.userId);

            // Log connection state
            console.log('👥 Connection State:', {
                totalUsers: this.userSockets.size,
                totalSockets: this.socketUsers.size,
                userConnections: Array.from(this.userSockets.entries()).map(([userId, sockets]) => ({
                    userId,
                    socketCount: sockets.size,
                    sockets: Array.from(sockets)
                })),
                timestamp: new Date().toISOString()
            });

            // Join conversation
            socket.on('join:conversation', (conversationId) => {
                console.log('🚪 Join Conversation:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    conversationId,
                    timestamp: new Date().toISOString()
                });
                socket.join(`conversation:${conversationId}`);
                
                // Log rooms after join
                console.log('🏠 Socket Rooms:', {
                    socketId: socket.id,
                    rooms: Array.from(socket.rooms),
                    timestamp: new Date().toISOString()
                });
            });

            // Leave conversation
            socket.on('leave:conversation', (conversationId) => {
                console.log('🚶 Leave Conversation:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    conversationId,
                    timestamp: new Date().toISOString()
                });
                socket.leave(`conversation:${conversationId}`);
            });

            // Handle new message
            socket.on('message:send', (data) => {
                console.log('📨 New Message Event:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    conversationId: data.conversationId,
                    type: data.type,
                    hasAttachments: data.attachments?.length > 0,
                    timestamp: new Date().toISOString()
                });
                this.handleSendMessage(socket, data);
            });

            // Handle message read status
            socket.on('message:read', (data) => {
                console.log('👁️ Message Read Event:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    messageId: data.messageId,
                    timestamp: new Date().toISOString()
                });
                this.handleMessageRead(socket, data);
            });

            // Handle message reactions
            socket.on('message:react', (data) => {
                console.log('💫 Message Reaction Event:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    messageId: data.messageId,
                    reactionType: data.type,
                    timestamp: new Date().toISOString()
                });
                this.handleMessageReaction(socket, data);
            });

            // Handle typing status
            socket.on('user:typing', ({ conversationId, isTyping }) => {
                console.log('✍️ Typing Status Event:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    conversationId,
                    isTyping,
                    timestamp: new Date().toISOString()
                });
                socket.to(`conversation:${conversationId}`).emit('user:typing', {
                    userId: socket.userId,
                    isTyping
                });
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log('❌ WebSocket Disconnected:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    timestamp: new Date().toISOString()
                });
                
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
                    this.broadcastUserStatus(userId, false);

                    // Log remaining connections
                    console.log('👥 Remaining Connections:', {
                        totalUsers: this.userSockets.size,
                        totalSockets: this.socketUsers.size,
                        userConnections: Array.from(this.userSockets.entries()).map(([uid, sockets]) => ({
                            userId: uid,
                            socketCount: sockets.size
                        }))
                    });
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

    async handleMessageReaction(socket, { messageId, type }) {
        try {
            console.log(`Adding reaction to message ${messageId} by ${socket.userId}: ${type}`);
            
            const message = await Message.findById(messageId);
            if (!message) {
                console.log('Message not found:', messageId);
                socket.emit('message:error', { error: 'Message not found' });
                return;
            }

            const conversation = await Conversation.findById(message.conversationId);
            if (!conversation) {
                console.log('Conversation not found for message:', messageId);
                socket.emit('message:error', { error: 'Conversation not found' });
                return;
            }

            // Verify user is participant
            const isParticipant = conversation.participants.some(p => p.userId === socket.userId);
            if (!isParticipant) {
                console.log('User not authorized to react to message:', socket.userId);
                socket.emit('message:error', { error: 'Not authorized' });
                return;
            }

            // Check if user has already reacted
            const existingReactionIndex = message.reactions.findIndex(r => r.userId === socket.userId);

            if (existingReactionIndex !== -1) {
                // If same reaction type, remove it (toggle off)
                if (message.reactions[existingReactionIndex].type === type) {
                    message.reactions.splice(existingReactionIndex, 1);
                } else {
                    // Update existing reaction type
                    message.reactions[existingReactionIndex] = {
                        userId: socket.userId,
                        type,
                        timestamp: new Date()
                    };
                }
            } else {
                // Add new reaction
                message.reactions.push({
                    userId: socket.userId,
                    type,
                    timestamp: new Date()
                });
            }

            await message.save();

            // Get user details for the reaction
            const [userRows] = await mysqlPool.query(
                'SELECT first_name, last_name, image_url FROM users WHERE id = ?',
                [socket.userId]
            );
            const user = userRows[0];

            // Emit reaction update to all participants
            this.io.to(`conversation:${message.conversationId}`).emit('message:reaction', {
                messageId: message._id,
                reactions: message.reactions,
                latestReaction: {
                    userId: socket.userId,
                    userName: `${user.first_name} ${user.last_name}`,
                    userImage: user.image_url,
                    type,
                    timestamp: new Date()
                }
            });

            console.log('Reaction processed successfully');
        } catch (error) {
            console.error('Error in handleMessageReaction:', error);
            socket.emit('message:error', { error: 'Failed to process reaction' });
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
