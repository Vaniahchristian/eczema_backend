const { v4: uuidv4 } = require('uuid');
const { MySQL } = require('../models');

const Sequelize = require('sequelize');
const { sequelize } = require('../config/database');

// Create a new appointment
const createAppointment = async (req, res) => {
  const { doctor_id, patient_id, appointment_date, reason, appointment_type, mode, duration } = req.body;

  try {
    // Create appointment using Sequelize
    const appointment = await MySQL.Appointment.create({
      id: uuidv4(),
      doctor_id,
      patient_id,
      appointment_date,
      reason,
      appointment_type,
      mode,
      duration,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      data: appointment
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({
      success: false,
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

    if (startDate && endDate) {
      // Cover the whole day: 00:00:00 to 23:59:59.999
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.appointment_date = {
        [Sequelize.Op.between]: [start, end]
      };
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      where.appointment_date = {
        [Sequelize.Op.gte]: start
      };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.appointment_date = {
        [Sequelize.Op.lte]: end
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
  console.log('--- Update Appointment Status ---');
  console.log('Appointment ID:', req.params.id);
  console.log('Requested Status:', req.body.status);
  try {
    const [updated] = await MySQL.Appointment.update({
      status: req.body.status
    }, {
      where: { id: req.params.id }
    });

    console.log('Update Result:', updated);

    // Check if appointment exists
    const appointment = await MySQL.Appointment.findByPk(req.params.id);

    if (!appointment) {
      console.error('Appointment not found for update:', req.params.id);
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    if (updated === 0) {
      // No rows updated: status was already set
      return res.json({
        success: true,
        message: 'No update needed. Status was already set.',
        data: appointment
      });
    }

    res.json({
      success: true,
      message: 'Appointment status updated successfully',
      data: appointment
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
          [Sequelize.Op.between]: [
            new Date(date.setHours(0, 0, 0, 0)),
            new Date(date.setHours(23, 59, 59, 999))
          ]
        },
        status: {
          [Sequelize.Op.notIn]: ['cancelled', 'completed']
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
