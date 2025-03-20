const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MySQL } = require('../models');
const { User } = MySQL;

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, dateOfBirth, gender, phoneNumber, address } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !dateOfBirth || !gender) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user with properly mapped fields
    const userId = await User.create({
      email,
      password_hash,
      role: role || 'patient',
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth,
      gender,
      phone_number: phoneNumber || null,
      address: address || null
    });

    // Generate token
    const token = generateToken(userId);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: {
          id: userId,
          email,
          role: role || 'patient',
          firstName,
          lastName
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user.user_id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.user_id,
          email: user.email,
          role: user.role,
          firstName: user.first_name,
          lastName: user.last_name
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Map database fields to API response format
    const userProfile = {
      id: user.user_id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      dateOfBirth: user.date_of_birth,
      gender: user.gender,
      phoneNumber: user.phone_number,
      address: user.address
    };

    res.json({
      success: true,
      data: userProfile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, address } = req.body;
    const userId = req.user.id;

    // Map API fields to database fields
    await User.update(userId, {
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      address
    });

    const updatedUser = await User.findById(userId);
    
    // Map database fields to API response format
    const userProfile = {
      id: updatedUser.user_id,
      email: updatedUser.email,
      role: updatedUser.role,
      firstName: updatedUser.first_name,
      lastName: updatedUser.last_name,
      dateOfBirth: updatedUser.date_of_birth,
      gender: updatedUser.gender,
      phoneNumber: updatedUser.phone_number,
      address: updatedUser.address
    };

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userProfile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};
