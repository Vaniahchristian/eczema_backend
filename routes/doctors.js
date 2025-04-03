const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { MySQL } = require('../models');

const { mysqlPool } = require('../config/database');

// Get all available doctors
router.get('/', protect, async (req, res) => {
    try {
        const [doctors] = await mysqlPool.execute(`
            SELECT 
                u.id, 
                u.first_name, 
                u.last_name, 
                u.email,
                dp.specialization,
                dp.available_hours,
                dp.avatar,
                dp.rating,
                dp.experience_years,
                dp.bio
            FROM users u
            INNER JOIN doctor_profiles dp ON u.id = dp.user_id
            WHERE u.role = 'doctor'
        `);

        // Format available_hours from JSON string to object and transform data
        const formattedDoctors = doctors.map(doctor => ({
            id: doctor.id,
            name: `${doctor.first_name} ${doctor.last_name}`,
            specialty: doctor.specialization,
            image: doctor.avatar || '/placeholder.svg?height=200&width=200',
            rating: parseFloat(doctor.rating) || 4.5,
            experience: parseInt(doctor.experience_years) || 0,
            bio: doctor.bio || `Dr. ${doctor.last_name} is a specialist in treating various skin conditions including eczema.`,
            availability: doctor.available_hours ? JSON.parse(doctor.available_hours) : []
        }));

        res.json({
            success: true,
            data: formattedDoctors
        });
    } catch (error) {
        console.error('Get doctors error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching doctors',
            error: error.message
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

        // Get doctor's available hours
        const [doctorProfiles] = await mysqlPool.execute(
            'SELECT available_hours FROM doctor_profiles WHERE user_id = ?',
            [doctorId]
        );

        if (doctorProfiles.length === 0 || !doctorProfiles[0].available_hours) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found or no available hours set'
            });
        }

        const availableHours = JSON.parse(doctorProfiles[0].available_hours);
        const requestedDate = new Date(date);
        
        // Get day of week in lowercase
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayOfWeek = days[requestedDate.getDay()];

        // If no hours available for this day
        if (!availableHours[dayOfWeek] || !availableHours[dayOfWeek].length) {
            return res.json({
                success: true,
                data: {
                    date: date,
                    availableSlots: []
                }
            });
        }

        // Get existing appointments for this date
        const [existingAppointments] = await mysqlPool.execute(`
            SELECT TIME_FORMAT(TIME(appointment_date), '%H:%i') as time
            FROM appointments 
            WHERE doctor_id = ? 
            AND DATE(appointment_date) = DATE(?)
            AND status != 'cancelled'
        `, [doctorId, date]);

        const bookedTimes = new Set(existingAppointments.map(apt => apt.time));

        // Generate available time slots based on working hours
        const availableSlots = [];
        availableHours[dayOfWeek].forEach(slot => {
            const [start, end] = slot.split('-');
            const startTime = new Date(`${date}T${start}`);
            const endTime = new Date(`${date}T${end}`);

            // Generate 30-minute slots
            while (startTime < endTime) {
                const timeSlot = startTime.toTimeString().slice(0, 5);
                if (!bookedTimes.has(timeSlot)) {
                    availableSlots.push(timeSlot);
                }
                startTime.setMinutes(startTime.getMinutes() + 30);
            }
        });

        res.json({
            success: true,
            data: {
                date: date,
                availableSlots: availableSlots.sort()
            }
        });

    } catch (error) {
        console.error('Error getting available slots:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting available slots',
            error: error.message
        });
    }
});

module.exports = router;
