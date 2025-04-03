const Appointment = require('../models/mysql/appointment');

// Create a new appointment
exports.createAppointment = async (req, res) => {
    try {
        const { doctorId, appointmentDate, reason, appointmentType } = req.body;
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
            appointment_type: appointmentType,
            status: 'pending'
        });

        res.status(201).json({
            success: true,
            message: 'Appointment created successfully',
            data: {
                id: appointmentId,
                doctorId,
                patientId,
                appointmentDate,
                reason,
                appointmentType,
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

// Reschedule appointment
exports.rescheduleAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { newDate } = req.body;
        const userId = req.user.id;

        // Verify appointment exists and belongs to user
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check if user has permission to reschedule
        if (appointment.patient_id !== userId && appointment.doctor_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to reschedule this appointment'
            });
        }

        // Check if new time slot is available
        const isAvailable = await Appointment.checkAvailability(appointment.doctor_id, newDate);
        if (!isAvailable) {
            return res.status(400).json({
                success: false,
                message: 'Selected time slot is not available'
            });
        }

        // Update appointment
        await Appointment.update(appointmentId, {
            appointment_date: newDate,
            status: 'rescheduled'
        });

        res.json({
            success: true,
            message: 'Appointment rescheduled successfully'
        });
    } catch (error) {
        console.error('Reschedule appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error rescheduling appointment',
            error: error.message
        });
    }
};

// Get available doctors
exports.getDoctors = async (req, res) => {
    try {
        const doctors = await Appointment.getDoctors();
        
        // Transform data to match frontend expectations
        const transformedDoctors = doctors.map(doctor => ({
            id: doctor.id,
            name: `${doctor.first_name} ${doctor.last_name}`,
            specialty: doctor.specialty,
            image: doctor.avatar || '/placeholder.svg?height=200&width=200',
            rating: parseFloat(doctor.rating) || 4.5,
            experience: parseInt(doctor.experience_years) || 0,
            bio: doctor.bio || `Dr. ${doctor.last_name} is a specialist in treating various skin conditions including eczema.`,
            availability: doctor.availability || []
        }));

        res.json({
            success: true,
            data: transformedDoctors
        });
    } catch (error) {
        console.error('Get doctors error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching doctors',
            error: error.message
        });
    }
};
