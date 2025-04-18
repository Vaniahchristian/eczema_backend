const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const appointmentController = require('../controllers/appointmentController');

// Create a new appointment
router.post('/', auth, appointmentController.createAppointment);

// Get appointment by ID
router.get('/:id', auth, appointmentController.getAppointmentById);

// Get doctor's appointments
router.get('/doctor/:doctorId', auth, appointmentController.getDoctorAppointments);

// Get patient's appointments
router.get('/patient/:patientId', auth, appointmentController.getPatientAppointments);

// Update appointment status
router.patch('/:id/status', auth, appointmentController.updateAppointmentStatus);

// Update appointment details
router.put('/:id', auth, appointmentController.updateAppointment);

// Check doctor's availability
router.get('/availability', auth, appointmentController.checkAvailability);

module.exports = router;
