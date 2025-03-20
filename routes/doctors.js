const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { MySQL } = require('../models');
const { mysqlPool } = require('../config/database');

// Get all available doctors
router.get('/', protect, async (req, res) => {
    try {
        const [doctors] = await mysqlPool.execute(`
            SELECT u.user_id, u.first_name, u.last_name, u.email, 
                   dp.specialization, dp.available_hours
            FROM users u
            INNER JOIN doctor_profiles dp ON u.user_id = dp.user_id
            WHERE u.role = 'doctor'
        `);

        // Format available_hours from JSON string to object
        const formattedDoctors = doctors.map(doctor => ({
            ...doctor,
            available_hours: JSON.parse(doctor.available_hours)
        }));

        res.json({
            success: true,
            data: formattedDoctors
        });
    } catch (error) {
        console.error('Error fetching doctors:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching doctors'
        });
    }
});

// Get doctor's available slots for a specific date
router.get('/:doctorId/available-slots', protect, async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date parameter is required'
            });
        }

        // Get doctor's general availability
        const [doctorProfiles] = await mysqlPool.execute(
            'SELECT available_hours FROM doctor_profiles WHERE user_id = ?',
            [doctorId]
        );

        if (doctorProfiles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }

        const availableHours = JSON.parse(doctorProfiles[0].available_hours);
        const requestedDate = new Date(date);
        const dayOfWeek = requestedDate.toLocaleLowerCase().slice(0, 3);

        // Get booked appointments for the requested date
        const [bookedSlots] = await mysqlPool.execute(
            'SELECT appointment_date FROM appointments WHERE doctor_id = ? AND DATE(appointment_date) = DATE(?)',
            [doctorId, date]
        );

        // Convert booked slots to time strings for easy comparison
        const bookedTimes = bookedSlots.map(slot => 
            new Date(slot.appointment_date).toTimeString().slice(0, 5)
        );

        // Filter out booked slots from available hours
        const availableSlotsForDay = availableHours[dayOfWeek]?.filter(
            time => !bookedTimes.includes(time)
        ) || [];

        res.json({
            success: true,
            data: {
                date,
                availableSlots: availableSlotsForDay
            }
        });
    } catch (error) {
        console.error('Error fetching available slots:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching available slots'
        });
    }
});

module.exports = router;
