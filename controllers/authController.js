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
    if (userData.role === 'doctor' && !specialty) {
      console.log('❌ Specialty required for doctor');
      return res.status(400).json({
        success: false,
        message: 'Specialty is required for doctor registration'
      });
    }

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
    const transaction = await MySQL.sequelize.transaction();
    try {
      // Create user with UUID
      const userId = uuidv4();
      console.log('👤 Creating user with ID:', userId);
      const user = await MySQL.User.create({
        id: userId,
        email: userData.email,
        password: hashedPassword,
        role: userData.role,
        first_name: userData.first_name,
        last_name: userData.last_name,
        date_of_birth: userData.date_of_birth,
        gender: userData.gender
      }, { transaction });

      // If user is a patient, create patient profile
      if (userData.role === 'patient' || !userData.role) {
        console.log('🏥 Creating patient profile');
        await MySQL.Patient.create({
          id: uuidv4(),
          user_id: userId,
          date_of_birth: userData.date_of_birth,
          gender: userData.gender,
          medical_history: '',
          allergies: ''
        }, { transaction });
      }
      // If user is a doctor, create doctor profile
      else if (userData.role === 'doctor') {
        console.log('👩‍⚕️ Creating doctor profile');
        await MySQL.DoctorProfile.create({
          id: uuidv4(),
          user_id: userId,
          specialty: specialty,
          bio: '',
          rating: 5.0,
          experience_years: 0,
          clinic_name: '',
          clinic_address: '',
          consultation_fee: 0,
          available_hours: {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
          }
        }, { transaction });
      }

      // Commit transaction
      await transaction.commit();

      // Generate token
      console.log('🔑 Generating token');
      const token = generateToken(userId);

      // Set token in cookie
      console.log('🍪 Setting cookie');
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      console.log('✅ Registration successful');
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          token,
          user: {
            id: userId,
            email: userData.email,
            role: userData.role,
            first_name: userData.first_name,
            last_name: userData.last_name,
            date_of_birth: userData.date_of_birth,
            gender: userData.gender,
            ...(userData.role === 'doctor' && { specialty })
          }
        }
      });
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during registration',
      error: error.message
    });
  }
};

// Rest of the authController.js remains unchanged
exports.login = async (req, res) => {
  try {
    console.log('📝 Login request:', { email: req.body.email });
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    console.log('🔍 Finding user:', email);
    const user = await MySQL.User.findOne({
      where: { email },
      include: [{
        model: MySQL.Patient,
        as: 'patient'
      }]
    });

    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('🔒 Verifying password');
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('🔑 Generating token');
    const token = generateToken(user.id);

    console.log('🍪 Setting cookie');
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    console.log('✅ Login successful');
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
            gender: user.patient.gender
          })
        }
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
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