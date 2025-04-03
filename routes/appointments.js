const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const {
    createAppointment,
    getAppointments,
    updateAppointmentStatus,
    getDoctorAvailability,
    getUpcomingAppointments,
    rescheduleAppointment
} = require('../controllers/appointmentController');

// Create new appointment
router.post('/', protect, createAppointment);

// Get all appointments (with filters for patient/doctor)
router.get('/', protect, getAppointments);

// Get upcoming appointments
router.get('/upcoming', protect, getUpcomingAppointments);

// Get doctor's available time slots
router.get('/availability/:doctorId', protect, getDoctorAvailability);

// Update appointment status (confirm/cancel/complete)
router.put('/:appointmentId/status', protect, updateAppointmentStatus);

// Reschedule appointment
router.put('/:appointmentId/reschedule', protect, rescheduleAppointment);

module.exports = router;
