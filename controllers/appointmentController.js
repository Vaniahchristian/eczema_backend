const { MySQL } = require('../models');
const { Appointment } = MySQL;

// Create a new appointment
exports.createAppointment = async (req, res) => {
    try {
        const { doctorId, appointmentDate, reason } = req.body;
        const patientId = req.user.id;

        // Validate required fields
        if (!doctorId || !appointmentDate || !reason) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Check if the time slot is available
        const isAvailable = await Appointment.checkAvailability(doctorId, appointmentDate);
        if (!isAvailable) {
            return res.status(400).json({
                success: false,
                message: 'Selected time slot is not available'
            });
        }

        // Create appointment
        const appointmentId = await Appointment.create({
            doctor_id: doctorId,
            patient_id: patientId,
            appointment_date: appointmentDate,
            reason,
            status: 'pending'
        });

        res.status(201).json({
            success: true,
            message: 'Appointment created successfully',
            data: {
                appointmentId,
                doctorId,
                patientId,
                appointmentDate,
                reason,
                status: 'pending'
            }
        });
    } catch (error) {
        console.error('Create appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating appointment',
            error: error.message
        });
    }
};

// Get appointments (filtered by user role)
exports.getAppointments = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { status, startDate, endDate } = req.query;

        let appointments;
        if (userRole === 'doctor') {
            appointments = await Appointment.findByDoctorId(userId, { status, startDate, endDate });
        } else {
            appointments = await Appointment.findByPatientId(userId, { status, startDate, endDate });
        }

        res.json({
            success: true,
            data: appointments
        });
    } catch (error) {
        console.error('Get appointments error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointments',
            error: error.message
        });
    }
};

// Get upcoming appointments
exports.getUpcomingAppointments = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        const appointments = await Appointment.findUpcoming(userId, userRole);

        res.json({
            success: true,
            data: appointments
        });
    } catch (error) {
        console.error('Get upcoming appointments error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching upcoming appointments',
            error: error.message
        });
    }
};

// Get doctor's available time slots
exports.getDoctorAvailability = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;

        if (!doctorId || !date) {
            return res.status(400).json({
                success: false,
                message: 'Please provide doctor ID and date'
            });
        }

        const availableSlots = await Appointment.getDoctorAvailability(doctorId, date);

        res.json({
            success: true,
            data: availableSlots
        });
    } catch (error) {
        console.error('Get doctor availability error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching doctor availability',
            error: error.message
        });
    }
};

// Update appointment status
exports.updateAppointmentStatus = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { status } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Validate status
        const validStatuses = ['confirmed', 'cancelled', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid appointment status'
            });
        }

        // Check if user has permission to update this appointment
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        if (userRole === 'patient' && appointment.patient_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this appointment'
            });
        }

        if (userRole === 'doctor' && appointment.doctor_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this appointment'
            });
        }

        // Update appointment status
        await Appointment.updateStatus(appointmentId, status);

        res.json({
            success: true,
            message: 'Appointment status updated successfully',
            data: {
                appointmentId,
                status
            }
        });
    } catch (error) {
        console.error('Update appointment status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating appointment status',
            error: error.message
        });
    }
};
