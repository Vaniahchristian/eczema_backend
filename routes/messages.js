const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    getConversations,
    getMessages,
    sendMessage,
    createConversation,
    updateMessageStatus,
    markConversationAsRead,
    deleteMessage,
    reactToMessage
} = require('../controllers/messageController');

// Conversation routes
router.get('/conversations', protect, getConversations);
router.post('/conversations', protect, createConversation);

// Message routes
router.get('/conversations/:conversationId/messages', protect, getMessages);
router.post('/conversations/:conversationId/messages', protect, sendMessage);
router.put('/messages/:messageId/status', protect, updateMessageStatus);
router.put('/messages/:messageId/reaction', protect, reactToMessage);
router.delete('/messages/:messageId', protect, deleteMessage);

module.exports = router;