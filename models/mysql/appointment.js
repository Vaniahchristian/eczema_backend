const { mysqlPool } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

class Appointment {
    static async create(appointmentData) {
        const appointmentId = uuidv4();
        const query = `
            INSERT INTO appointments (
                appointment_id, doctor_id, patient_id,
                appointment_date, reason, status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;
        const values = [
            appointmentId,
            appointmentData.doctor_id,
            appointmentData.patient_id,
            appointmentData.appointment_date,
            appointmentData.reason,
            appointmentData.status
        ];

        await mysqlPool.execute(query, values);
        return appointmentId;
    }

    static async findById(appointmentId) {
        const [rows] = await mysqlPool.execute(
            `SELECT 
                a.*,
                CONCAT(u1.first_name, ' ', u1.last_name) as doctor_name,
                CONCAT(u2.first_name, ' ', u2.last_name) as patient_name
            FROM appointments a
            JOIN users u1 ON a.doctor_id = u1.user_id
            JOIN users u2 ON a.patient_id = u2.user_id
            WHERE a.appointment_id = ?`,
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
            JOIN users u ON a.patient_id = u.user_id
            WHERE a.doctor_id = ?
        `;
        const values = [doctorId];

        if (filters.status) {
            query += ' AND a.status = ?';
            values.push(filters.status);
        }

        if (filters.startDate && filters.endDate) {
            query += ' AND a.appointment_date BETWEEN ? AND ?';
            values.push(filters.startDate, filters.endDate);
        }

        query += ' ORDER BY a.appointment_date ASC';

        const [rows] = await mysqlPool.execute(query, values);
        return rows;
    }

    static async findByPatientId(patientId, filters = {}) {
        let query = `
            SELECT 
                a.*,
                CONCAT(u.first_name, ' ', u.last_name) as doctor_name
            FROM appointments a
            JOIN users u ON a.doctor_id = u.user_id
            WHERE a.patient_id = ?
        `;
        const values = [patientId];

        if (filters.status) {
            query += ' AND a.status = ?';
            values.push(filters.status);
        }

        if (filters.startDate && filters.endDate) {
            query += ' AND a.appointment_date BETWEEN ? AND ?';
            values.push(filters.startDate, filters.endDate);
        }

        query += ' ORDER BY a.appointment_date ASC';

        const [rows] = await mysqlPool.execute(query, values);
        return rows;
    }

    static async findUpcoming(userId, userRole) {
        const field = userRole === 'doctor' ? 'doctor_id' : 'patient_id';
        const joinField = userRole === 'doctor' ? 'patient_id' : 'doctor_id';
        
        const query = `
            SELECT 
                a.*,
                CONCAT(u.first_name, ' ', u.last_name) as ${userRole === 'doctor' ? 'patient_name' : 'doctor_name'}
            FROM appointments a
            JOIN users u ON a.${joinField} = u.user_id
            WHERE a.${field} = ?
            AND a.appointment_date >= CURDATE()
            AND a.status IN ('pending', 'confirmed')
            ORDER BY a.appointment_date ASC
            LIMIT 10
        `;

        const [rows] = await mysqlPool.execute(query, [userId]);
        return rows;
    }

    static async checkAvailability(doctorId, appointmentDate) {
        // Check if the time slot is available for the doctor
        const [rows] = await mysqlPool.execute(
            `SELECT COUNT(*) as count
            FROM appointments
            WHERE doctor_id = ?
            AND appointment_date = ?
            AND status != 'cancelled'`,
            [doctorId, appointmentDate]
        );

        return rows[0].count === 0;
    }

    static async getDoctorAvailability(doctorId, date) {
        // Get doctor's working hours and booked slots
        const [workingHours] = await mysqlPool.execute(
            `SELECT available_hours
            FROM doctor_profiles
            WHERE user_id = ?`,
            [doctorId]
        );

        const [bookedSlots] = await mysqlPool.execute(
            `SELECT appointment_date
            FROM appointments
            WHERE doctor_id = ?
            AND DATE(appointment_date) = DATE(?)
            AND status != 'cancelled'`,
            [doctorId, date]
        );

        // Parse working hours and remove booked slots
        const availableHours = JSON.parse(workingHours[0]?.available_hours || '[]');
        const bookedTimes = bookedSlots.map(slot => 
            new Date(slot.appointment_date).toLocaleTimeString('en-US', { hour12: false })
        );

        return availableHours.filter(hour => !bookedTimes.includes(hour));
    }

    static async updateStatus(appointmentId, status) {
        await mysqlPool.execute(
            `UPDATE appointments
            SET status = ?, updated_at = NOW()
            WHERE appointment_id = ?`,
            [status, appointmentId]
        );
    }
}

module.exports = Appointment;
