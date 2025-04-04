const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MySQL } = require('../models');
const { User, PatientProfile, DoctorProfile } = MySQL;
const { v4: uuidv4 } = require('uuid');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, dateOfBirth, gender, specialty } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !dateOfBirth || !gender) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    // Additional validation for doctors
    if (role === 'doctor' && !specialty) {
      return res.status(400).json({
        success: false,
        message: 'Specialty is required for doctor registration'
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
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const userId = await User.create({
      email,
      password: hashedPassword,
      role: role || 'patient',
      firstName: firstName,
      lastName: lastName,
      dateOfBirth: dateOfBirth,
      gender: gender
    });

    // If user is a patient, create patient profile
    if (role === 'patient' || !role) {
      await PatientProfile.create({
        userId,
        medicalHistory: '',
        allergies: '',
        medications: ''
      });
    }

    // If user is a doctor, create doctor profile
    if (role === 'doctor') {
      await DoctorProfile.create({
        id: uuidv4(),
        userId,
        specialty: 'Dermatology',
        bio: `Dr. ${lastName} is a specialist in ${specialty}.`,
        rating: 5.0,
        experienceYears: 0,
        available_hours: JSON.stringify({
          monday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
          tuesday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
          wednesday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
          thursday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
          friday: ['09:00', '10:00', '11:00', '14:00', '15:00']
        })
      });
    }

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
          lastName,
          dateOfBirth,
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
    const user = await User.findByEmail(email);
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

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender
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
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender
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
    const { firstName, lastName, dateOfBirth, gender } = req.body;
    const userId = req.user.id;

    // Map API fields to database fields
    await User.update(userId, {
      firstName,
      lastName,
      dateOfBirth,
      gender
    });

    const updatedUser = await User.findById(userId);

    // Map database fields to API response format
    const userProfile = {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      dateOfBirth: updatedUser.dateOfBirth,
      gender: updatedUser.gender
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
