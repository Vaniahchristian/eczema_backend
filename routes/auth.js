const express = require('express');
const router = express.Router();
const { register, login, getProfile, updateProfile, logout } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter, profileLimiter } = require('../middleware/rateLimiter');

// Auth endpoints with strict rate limiting
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', authLimiter, logout);

// Forgot/reset password endpoints
router.post('/forgot-password', authLimiter, require('../controllers/authController').forgotPassword);
router.post('/reset-password', authLimiter, require('../controllers/authController').resetPassword);

// Profile endpoints with more lenient rate limiting
router.get('/profile', profileLimiter, protect, getProfile);
router.put('/profile', profileLimiter, protect, updateProfile);

module.exports = router;
