const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const messageController = require('../controllers/messageController');

console.log('Initial messageController:', messageController);

// Get all conversations for the authenticated user
console.log('Before getConversations:', messageController.getConversations);
router.get('/conversations', protect, messageController.getConversations);

// Get all messages in a conversation
console.log('Before getMessages:', messageController.getMessages);
router.get('/conversations/:conversationId/messages', protect, messageController.getMessages);

// Send a new message in a conversation
console.log('Before sendMessage:', messageController.sendMessage);
router.post('/conversations/:conversationId/messages', protect, messageController.sendMessage);

// Create a new conversation
console.log('Before createConversation:', messageController.createConversation);
router.post('/conversations', protect, messageController.createConversation);

// Update message status (read/delivered)
console.log('Before updateMessageStatus:', messageController.updateMessageStatus);
router.put('/messages/:messageId/status', protect, messageController.updateMessageStatus);

// Add reaction to a message
console.log('Before addReaction:', messageController.addReaction);
router.put('/messages/:messageId/reaction', protect, messageController.addReaction);

module.exports = router;