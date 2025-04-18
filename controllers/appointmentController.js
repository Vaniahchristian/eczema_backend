const { v4: uuidv4 } = require('uuid');
const { MySQL } = require('../models');
const { sequelize } = require('../config/database');

// Create a new appointment
const createAppointment = async (req, res) => {
  try {
    console.log('Creating appointment with data:', req.body);

    const {
      doctor_id,
      patient_id,
      appointment_date,
      reason,
      mode,
      duration,
      appointment_type = 'general' // Default to 'general' if not specified
    } = req.body;

    // Validate required fields
    if (!doctor_id || !patient_id || !appointment_date) {
      console.error('Missing required fields:', { doctor_id, patient_id, appointment_date });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate appointment_type
    const validTypes = ['general', 'follow_up', 'emergency'];
    if (appointment_type && !validTypes.includes(appointment_type)) {
      console.error('Invalid appointment type:', appointment_type);
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment type. Must be one of: general, follow_up, emergency'
      });
    }

    console.log('Checking doctor availability for:', {
      doctorId: doctor_id,
      appointmentDate: appointment_date
    });

    // Create appointment using Sequelize
    const appointment = await MySQL.Appointment.create({
      id: uuidv4(),
      doctor_id,
      patient_id,
      appointment_date,
      reason: reason || '',
      mode: mode || 'video',
      duration: duration || 30,
      appointment_type: appointment_type || 'general',
      status: 'pending'
    });

    console.log('Appointment created successfully:', {
      appointmentId: appointment.id,
      status: 'pending'
    });

    console.log('New appointment details:', appointment);

    res.status(201).json({
      success: true,
      data: appointment,
      message: 'Appointment created successfully'
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating appointment',
      error: error.message
    });
  }
};

// Get appointment by ID
const getAppointmentById = async (req, res) => {
  try {
    const appointment = await MySQL.Appointment.findByPk(req.params.id, {
      include: [
        {
          model: MySQL.User,
          as: 'patient',
          attributes: ['id', 'first_name', 'last_name', 'image_url']
        },
        {
          model: MySQL.User,
          as: 'doctor',
          attributes: ['id', 'first_name', 'last_name', 'image_url'],
          include: [{
            model: MySQL.DoctorProfile,
            as: 'doctor_profile',
            attributes: ['specialty', 'rating']
          }]
        }
      ]
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    res.json({
      success: true,
      data: appointment
    });
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get doctor's appointments
const getDoctorAppointments = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const where = { doctor_id: req.params.doctorId };

    if (status) {
      where.status = status;
    }

    if (startDate) {
      where.appointment_date = {
        [sequelize.Op.gte]: new Date(startDate)
      };
    }

    if (endDate) {
      where.appointment_date = {
        ...where.appointment_date,
        [sequelize.Op.lte]: new Date(endDate)
      };
    }

    const appointments = await MySQL.Appointment.findAll({
      where,
      include: [
        {
          model: MySQL.User,
          as: 'patient',
          attributes: ['id', 'first_name', 'last_name', 'image_url']
        }
      ],
      order: [['appointment_date', 'ASC']]
    });

    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('Get doctor appointments error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get patient's appointments
const getPatientAppointments = async (req, res) => {
  try {
    const { status } = req.query;
    const where = { patient_id: req.params.patientId };

    if (status) {
      where.status = status;
    }

    const appointments = await MySQL.Appointment.findAll({
      where,
      include: [
        {
          model: MySQL.User,
          as: 'doctor',
          attributes: ['id', 'first_name', 'last_name', 'image_url'],
          include: [{
            model: MySQL.DoctorProfile,
            as: 'doctor_profile',
            attributes: ['specialty', 'rating']
          }]
        }
      ],
      order: [['appointment_date', 'DESC']]
    });

    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('Get patient appointments error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update appointment status
const updateAppointmentStatus = async (req, res) => {
  try {
    const [updated] = await MySQL.Appointment.update({
      status: req.body.status
    }, {
      where: { id: req.params.id }
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    res.json({
      success: true,
      message: 'Appointment status updated successfully'
    });
  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update appointment
const updateAppointment = async (req, res) => {
  try {
    const [updated] = await MySQL.Appointment.update(req.body, {
      where: { id: req.params.id }
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    res.json({
      success: true,
      message: 'Appointment updated successfully'
    });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Check doctor's availability
const checkAvailability = async (req, res) => {
  try {
    const { doctorId, appointmentDate } = req.query;
    const date = new Date(appointmentDate);
    
    const appointmentsCount = await MySQL.Appointment.count({
      where: {
        doctor_id: doctorId,
        appointment_date: {
          [sequelize.Op.between]: [
            new Date(date.setHours(0, 0, 0, 0)),
            new Date(date.setHours(23, 59, 59, 999))
          ]
        },
        status: {
          [sequelize.Op.notIn]: ['cancelled', 'completed']
        }
      }
    });

    res.json({
      success: true,
      data: {
        isAvailable: appointmentsCount < 8
      }
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  createAppointment,
  getAppointmentById,
  getDoctorAppointments,
  getPatientAppointments,
  updateAppointmentStatus,
  updateAppointment,
  checkAvailability
};
