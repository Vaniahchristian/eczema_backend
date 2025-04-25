const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createAppointment,
  getAppointmentById,
  getDoctorAppointments,
  getPatientAppointments,
  updateAppointmentStatus,
  updateAppointment,
  checkAvailability,
  deleteAppointment
} = require('../controllers/appointments');

// Create a new appointment
router.post('/', protect, createAppointment);

// Get appointment by ID
router.get('/:id', protect, getAppointmentById);

// Get doctor's appointments
router.get('/doctor/:doctorId', protect, getDoctorAppointments);

// Get patient's appointments
router.get('/patient/:patientId', protect, getPatientAppointments);

// Update appointment status
router.patch('/:id/status', protect, updateAppointmentStatus);

// Update appointment details
router.put('/:id', protect, updateAppointment);

// Delete appointment
router.delete('/:id', protect, deleteAppointment);

// Check doctor's availability
router.get('/availability', protect, checkAvailability);

module.exports = router;
