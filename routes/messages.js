const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const messageController = require('../controllers/messageController');

// File upload
router.post('/upload', protect, messageController.uploadFile);

// Conversations
router.get('/conversations', protect, messageController.getConversations);
router.post('/conversations', protect, messageController.createConversation);
router.get('/conversations/:conversationId', protect, messageController.getConversation);
router.put('/conversations/:conversationId', protect, messageController.updateConversation);
router.delete('/conversations/:conversationId', protect, messageController.archiveConversation);

// Messages
router.get('/conversations/:conversationId/messages', protect, messageController.getMessages);
router.post('/conversations/:conversationId/messages', protect, messageController.sendMessage);
router.delete('/conversations/:conversationId/messages/:messageId', protect, messageController.deleteMessage);

// Message status and reactions
router.put('/messages/:messageId/status', protect, messageController.updateMessageStatus);
router.put('/messages/:messageId/reaction', protect, messageController.addReaction);
router.delete('/messages/:messageId/reaction', protect, messageController.removeReaction);

// Typing indicators
router.post('/conversations/:conversationId/typing', protect, messageController.setTypingStatus);

module.exports = router;