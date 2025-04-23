const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { mysqlPool } = require('../config/database');

// Get all available doctors (with optional search)
router.get('/', protect, async (req, res) => {
    try {
        const { search } = req.query;
        let query = `
            SELECT 
                u.id, 
                u.first_name, 
                u.last_name, 
                u.email,
                dp.specialty,
                dp.bio,
                dp.rating,
                dp.experience_years,
                dp.clinic_name,
                dp.clinic_address,
                dp.consultation_fee
            FROM users u
            INNER JOIN doctor_profiles dp ON u.id = dp.user_id
            WHERE u.role = 'doctor'
        `;
        const params = [];
        if (search) {
            query += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`;
            const like = `%${search}%`;
            params.push(like, like, like);
        }
        query += ' ORDER BY u.first_name ASC LIMIT 20';

        const [rows] = await mysqlPool.query(query, params);
        const doctors = Array.isArray(rows) ? rows : [];
        const formattedDoctors = doctors.map(doctor => ({
            id: doctor.id,
            name: `${doctor.first_name} ${doctor.last_name}`.trim(),
            email: doctor.email,
            imageUrl: doctor.image_url || '/placeholder.svg?height=40&width=40',
            specialty: doctor.specialty || 'General Practice',
            bio: doctor.bio || '',
            rating: parseFloat(doctor.rating) || 5.0,
            experienceYears: doctor.experience_years || 0,
            clinicName: doctor.clinic_name || '',
            clinicAddress: doctor.clinic_address || '',
            consultationFee: parseFloat(doctor.consultation_fee) || 0
        }));
        res.json({
            success: true,
            data: formattedDoctors
        });
    } catch (error) {
        console.error('Get doctors error:', error);
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

        const [doctorProfiles] = await mysqlPool.query(
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
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayOfWeek = days[requestedDate.getDay()];

        const [appointments] = await mysqlPool.query(
            'SELECT appointment_date FROM appointments WHERE doctor_id = ? AND DATE(appointment_date) = DATE(?)',
            [doctorId, date]
        );

        const bookedSlots = new Set(appointments.map(app => {
            const appDate = new Date(app.appointment_date);
            return appDate.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        }));

        if (!availableHours[dayOfWeek] || !availableHours[dayOfWeek].length) {
            return res.json({
                success: true,
                data: {
                    date: date,
                    availableSlots: []
                }
            });
        }

        const availableSlots = availableHours[dayOfWeek].filter(time => !bookedSlots.has(time));

        res.json({
            success: true,
            data: {
                date: date,
                availableSlots: availableSlots
            }
        });
    } catch (error) {
        console.error('Error getting available slots:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting available slots'
        });
    }
});

module.exports = router;