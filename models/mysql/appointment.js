const { mysqlPool } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

class Appointment {
    static async create(appointmentData) {
        const id = uuidv4();
        const query = `
            INSERT INTO appointments (
                id, doctor_id, patient_id,
                appointment_date, reason, status,
                appointment_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            id,
            appointmentData.doctor_id,
            appointmentData.patient_id,
            appointmentData.appointment_date,
            appointmentData.reason,
            appointmentData.status,
            appointmentData.appointment_type || 'regular'
        ];

        await mysqlPool.execute(query, values);
        return id;
    }

    static async findById(appointmentId) {
        const [rows] = await mysqlPool.execute(
            `SELECT 
                a.*,
                CONCAT(u1.first_name, ' ', u1.last_name) as doctor_name,
                CONCAT(u2.first_name, ' ', u2.last_name) as patient_name
            FROM appointments a
            JOIN users u1 ON a.doctor_id = u1.id
            JOIN users u2 ON a.patient_id = u2.id
            WHERE a.id = ?`,
            [appointmentId]
        );
        return rows[0];
    }

    static async findByDoctorId(doctorId, filters = {}) {
        let query = `
            SELECT 
                a.*,
                CONCAT(u.first_name, ' ', u.last_name) as patient_name
            FROM appointments a
            JOIN users u ON a.patient_id = u.id
            WHERE a.doctor_id = ?
        `;
        const values = [doctorId];

        if (filters.status) {
            query += ' AND a.status = ?';
            values.push(filters.status);
        }

        if (filters.startDate) {
            query += ' AND a.appointment_date >= ?';
            values.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ' AND a.appointment_date <= ?';
            values.push(filters.endDate);
        }

        query += ' ORDER BY a.appointment_date DESC';

        const [rows] = await mysqlPool.execute(query, values);
        return rows;
    }

    static async findByPatientId(patientId, filters = {}) {
        let query = `
            SELECT 
                a.*,
                CONCAT(u.first_name, ' ', u.last_name) as doctor_name
            FROM appointments a
            JOIN users u ON a.doctor_id = u.id
            WHERE a.patient_id = ?
        `;
        const values = [patientId];

        if (filters.status) {
            query += ' AND a.status = ?';
            values.push(filters.status);
        }

        if (filters.startDate) {
            query += ' AND a.appointment_date >= ?';
            values.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ' AND a.appointment_date <= ?';
            values.push(filters.endDate);
        }

        query += ' ORDER BY a.appointment_date DESC';

        const [rows] = await mysqlPool.execute(query, values);
        return rows;
    }

    static async updateStatus(appointmentId, status) {
        await mysqlPool.execute(
            'UPDATE appointments SET status = ? WHERE id = ?',
            [status, appointmentId]
        );
    }

    static async checkAvailability(doctorId, appointmentDate) {
        try {
            // Get doctor's available hours
            const [doctorProfiles] = await mysqlPool.execute(
                'SELECT available_hours FROM doctor_profiles WHERE user_id = ?',
                [doctorId]
            );

            if (doctorProfiles.length === 0 || !doctorProfiles[0].available_hours) {
                return false;
            }

            const availableHours = JSON.parse(doctorProfiles[0].available_hours);
            const requestedDate = new Date(appointmentDate);
            
            // Get day of week in lowercase
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayOfWeek = days[requestedDate.getDay()];
            
            // Get time in HH:mm format
            const hours = requestedDate.getHours().toString().padStart(2, '0');
            const minutes = requestedDate.getMinutes().toString().padStart(2, '0');
            const requestedTime = `${hours}:${minutes}`;

            // Check if the day is available
            if (!availableHours[dayOfWeek] || !availableHours[dayOfWeek].length) {
                return false;
            }

            // Check if the time falls within any of the available slots
            const isTimeAvailable = availableHours[dayOfWeek].some(slot => {
                const [start, end] = slot.split('-');
                return requestedTime >= start && requestedTime <= end;
            });

            if (!isTimeAvailable) {
                return false;
            }

            // Check if there are any existing appointments at the same time
            const [existingAppointments] = await mysqlPool.execute(`
                SELECT COUNT(*) as count 
                FROM appointments 
                WHERE doctor_id = ? 
                AND appointment_date = ? 
                AND status != 'cancelled'
            `, [doctorId, appointmentDate]);

            return existingAppointments[0].count === 0;
        } catch (error) {
            console.error('Error checking availability:', error);
            return false;
        }
    }
}

module.exports = Appointment;
