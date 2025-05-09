const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MySQL, sequelize } = require('../models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configure nodemailer transporter using env variables
// Required in .env:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, FRONTEND_URL
console.log('[SMTP DEBUG] SMTP_HOST:', process.env.SMTP_HOST);
console.log('[SMTP DEBUG] SMTP_PORT:', process.env.SMTP_PORT);
console.log('[SMTP DEBUG] SMTP_USER:', process.env.SMTP_USER);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
console.log('[SMTP DEBUG] Nodemailer transporter config:', transporter.options);


const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set in environment variables');
  }
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

exports.register = async (req, res) => {
  try {
    console.log('📝 Registration request:', req.body);
    const {
      email,
      password,
      first_name,
      firstName,
      last_name,
      lastName,
      date_of_birth,
      dateOfBirth,
      gender,
      role,
      specialty
    } = req.body;

    // Map fields to snake_case
    const userData = {
      email,
      password,
      first_name: first_name || firstName,
      last_name: last_name || lastName,
      date_of_birth: date_of_birth || dateOfBirth,
      gender,
      role: role || 'patient'
    };

    // Validate required fields
    if (!userData.email || !userData.password || !userData.first_name || !userData.last_name) {
      console.log('❌ Missing required fields:', {
        email: !userData.email,
        password: !userData.password,
        first_name: !userData.first_name,
        last_name: !userData.last_name
      });
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Validate doctor-specific fields
    // if (userData.role === 'doctor' && !specialty) {
    //   console.log('❌ Specialty required for doctor');
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Specialty is required for doctor registration'
    //   });
    // }

    // Check if user already exists
    console.log('🔍 Checking if user exists:', userData.email);
    const existingUser = await MySQL.User.findOne({ where: { email: userData.email } });
    if (existingUser) {
      console.log('❌ User already exists');
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    console.log('🔒 Hashing password...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);

    // Start a transaction for atomicity
    const transaction = await sequelize.transaction();
    try {
      // Create user
      console.log('👤 Creating user...');
      const user = await MySQL.User.create({
        id: uuidv4(),
        email: userData.email,
        password: hashedPassword,
        role: userData.role,
        first_name: userData.first_name,
        last_name: userData.last_name,
        date_of_birth: userData.date_of_birth,
        gender: userData.gender
      }, { transaction });

      // Create role-specific profile
      if (userData.role === 'patient') {
        console.log('🏥 Creating patient profile...');
        await MySQL.Patient.create({
          id: uuidv4(),
          user_id: user.id,
          date_of_birth: userData.date_of_birth,
          gender: userData.gender,
          medical_history: '',
          allergies: ''
        }, { transaction });
      } else if (userData.role === 'doctor') {
        console.log('👨‍⚕️ Creating doctor profile...');
        const defaultAvailableHours = {
          monday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
          tuesday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
          wednesday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
          thursday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
          friday: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
          saturday: [],
          sunday: []
        };

        await MySQL.DoctorProfile.create({
          id: uuidv4(),
          user_id: user.id,
          specialty: userData.specialty || 'Dermatologist',
          bio: userData.bio || '',
          experience_years: userData.experience_years || 0,
          clinic_name: userData.clinic_name || '',
          clinic_address: userData.clinic_address || '',
          consultation_fee: userData.consultation_fee || 0,
          available_hours: JSON.stringify(userData.available_hours || defaultAvailableHours)
        }, { transaction });
      }

      // Commit transaction
      await transaction.commit();
      console.log('✅ User registered successfully');

      // Generate token
      const token = generateToken(user.id);

      // Set cookie
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
          id: user.id,
          email: userData.email,
          role: userData.role,
          first_name: userData.first_name,
          last_name: userData.last_name,
          token
        }
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('📝 Login attempt:', { email: req.body.email });
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user and include related profile
    const user = await MySQL.User.findOne({
      where: { email },
      include: [{
        model: MySQL.Patient,
        as: 'patient'
      }, {
        model: MySQL.DoctorProfile,
        as: 'doctor_profile'
      }]
    });

    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Invalid password for user:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    console.log('✅ Login successful for user:', email);
    const token = generateToken(user.id);

    // Set cookie in production
    if (process.env.NODE_ENV === 'production') {
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    // Send response
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
          last_name: user.last_name,
          ...(user.patient && {
            date_of_birth: user.patient.date_of_birth,
            gender: user.patient.gender,
            medical_history: user.patient.medical_history,
            allergies: user.patient.allergies
          }),
          ...(user.doctor_profile && {
            specialty: user.doctor_profile.specialty,
            bio: user.doctor_profile.bio,
            rating: user.doctor_profile.rating,
            experience_years: user.doctor_profile.experience_years,
            clinic_name: user.doctor_profile.clinic_name,
            clinic_address: user.doctor_profile.clinic_address,
            consultation_fee: user.doctor_profile.consultation_fee
          })
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
      }, {
        model: MySQL.DoctorProfile,
        as: 'doctor_profile'
      }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

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
      }),
      ...(user.doctor_profile && {
        specialty: user.doctor_profile.specialty,
        bio: user.doctor_profile.bio,
        rating: user.doctor_profile.rating,
        experience_years: user.doctor_profile.experience_years,
        clinic_name: user.doctor_profile.clinic_name,
        clinic_address: user.doctor_profile.clinic_address,
        consultation_fee: user.doctor_profile.consultation_fee
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
    const { first_name, last_name, date_of_birth, gender, medical_history, allergies, specialty, bio, clinic_name, clinic_address, consultation_fee, experience_years } = req.body;
    const userId = req.user.id;

    const transaction = await MySQL.sequelize.transaction();
    try {
      await MySQL.User.update({
        first_name,
        last_name
      }, {
        where: { id: userId },
        transaction
      });

      if (date_of_birth || gender || medical_history || allergies) {
        await MySQL.Patient.update({
          date_of_birth,
          gender,
          medical_history,
          allergies
        }, {
          where: { user_id: userId },
          transaction
        });
      }

      if (specialty || bio || clinic_name || clinic_address || consultation_fee || experience_years) {
        await MySQL.DoctorProfile.update({
          specialty,
          bio,
          clinic_name,
          clinic_address,
          consultation_fee,
          experience_years
        }, {
          where: { user_id: userId },
          transaction
        });
      }

      await transaction.commit();

      const user = await MySQL.User.findOne({
        where: { id: userId },
        include: [{
          model: MySQL.Patient,
          as: 'patient'
        }, {
          model: MySQL.DoctorProfile,
          as: 'doctor_profile'
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
          }),
          ...(user.doctor_profile && {
            specialty: user.doctor_profile.specialty,
            bio: user.doctor_profile.bio,
            rating: user.doctor_profile.rating,
            experience_years: user.doctor_profile.experience_years,
            clinic_name: user.doctor_profile.clinic_name,
            clinic_address: user.doctor_profile.clinic_address,
            consultation_fee: user.doctor_profile.consultation_fee
          })
        }
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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

// Forgot Password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const user = await MySQL.User.findOne({ where: { email } });
    if (!user) {
      // For security, don't reveal if user exists
      return res.json({ success: true, message: 'If the email is registered, a reset link has been sent.' });
    }
    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.update({
      reset_password_token: token,
      reset_password_expires: expires
    });
    // Send email
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: user.email,
      subject: 'Password Reset Request',
      html: `<p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, please ignore this email.</p>`
    });
    return res.json({ success: true, message: 'If the email is registered, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Error processing request' });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }
    const user = await MySQL.User.findOne({
      where: {
        reset_password_token: token,
        reset_password_expires: { [MySQL.Sequelize.Op.gt]: new Date() }
      }
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await user.update({
      password: hashedPassword,
      reset_password_token: null,
      reset_password_expires: null
    });
    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Error processing request' });
  }
};

// List all users (admin)
exports.listUsers = async (req, res) => {
  try {
    const users = await MySQL.User.findAll({
      attributes: { exclude: ['password'] },
      include: [
        { model: MySQL.Patient, as: 'patient' },
        { model: MySQL.DoctorProfile, as: 'doctor_profile' }
      ]
    });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

// Update user (admin)
exports.adminUpdateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const [updated] = await MySQL.User.update(updates, { where: { id } });
    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });
    const updatedUser = await MySQL.User.findByPk(id, { attributes: { exclude: ['password'] } });
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
};

// Delete user (admin)
exports.adminDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await MySQL.User.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
};