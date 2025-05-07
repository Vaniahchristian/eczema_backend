// routes/users.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

// All routes require admin role
router.use(protect, authorize('admin'));

router.get('/', authController.listUsers);
router.put('/:id', authController.adminUpdateUser);
router.delete('/:id', authController.adminDeleteUser);

module.exports = router;
