const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const messageController = require('../controllers/messageController');


router.post('/upload', protect, messageController.uploadFile);

// Get all conversations for the authenticated user
router.get('/conversations', protect, messageController.getConversations);

// Get all messages in a conversation
router.get('/conversations/:conversationId/messages', protect, messageController.getMessages);

// Send a new message in a conversation
router.post('/conversations/:conversationId/messages', protect, messageController.sendMessage);

// Create a new conversation
router.post('/conversations', protect, messageController.createConversation);

// Update message status (read/delivered)
router.put('/messages/:messageId/status', protect, messageController.updateMessageStatus);

// Add reaction to a message
router.put('/messages/:messageId/reaction', protect, messageController.addReaction);

module.exports = router;