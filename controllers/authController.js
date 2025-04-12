const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MySQL } = require('../models');
const { v4: uuidv4 } = require('uuid');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

exports.register = async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, date_of_birth, gender, specialty } = req.body;

    // Validate required fields
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    // Check if user already exists
    const existingUser = await MySQL.User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user with UUID
    const userId = uuidv4();
    const user = await MySQL.User.create({
      id: userId,
      email,
      password: hashedPassword,
      role: role || 'patient',
      first_name,
      last_name
    });

    // If user is a patient, create patient profile
    if (role === 'patient' || !role) {
      await MySQL.Patient.create({
        id: uuidv4(),
        user_id: userId,
        date_of_birth,
        gender,
        medical_history: '',
        allergies: ''
      });
    }

    // Generate token
    const token = generateToken(userId);

    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: {
          id: userId,
          email,
          role: role || 'patient',
          first_name,
          last_name,
          date_of_birth,
          gender
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during registration',
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
    const user = await MySQL.User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user.id);

    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name
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
    const user = await MySQL.User.findOne({
      where: { id: req.user.id },
      include: [{
        model: MySQL.Patient,
        as: 'patient'
      }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Map database fields to API response format
    const userProfile = {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      ...(user.patient && {
        date_of_birth: user.patient.date_of_birth,
        gender: user.patient.gender,
        medical_history: user.patient.medical_history,
        allergies: user.patient.allergies
      })
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
    const { first_name, last_name, date_of_birth, gender, medical_history, allergies } = req.body;
    const userId = req.user.id;

    // Update user
    await MySQL.User.update({
      first_name,
      last_name
    }, {
      where: { id: userId }
    });

    // Update patient profile if exists
    if (date_of_birth || gender || medical_history || allergies) {
      await MySQL.Patient.update({
        date_of_birth,
        gender,
        medical_history,
        allergies
      }, {
        where: { user_id: userId }
      });
    }

    // Get updated profile
    const user = await MySQL.User.findOne({
      where: { id: userId },
      include: [{
        model: MySQL.Patient,
        as: 'patient'
      }]
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        ...(user.patient && {
          date_of_birth: user.patient.date_of_birth,
          gender: user.patient.gender,
          medical_history: user.patient.medical_history,
          allergies: user.patient.allergies
        })
      }
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

exports.logout = async (req, res) => {
  try {
    // Clear the token cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during logout',
      error: error.message
    });
  }
};
