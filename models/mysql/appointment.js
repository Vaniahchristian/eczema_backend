const { mysqlPool } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

class Appointment {
    static async create(appointmentData) {
        const id = uuidv4();
        const query = `
            INSERT INTO appointments (
                id, doctor_id, patient_id,
                appointment_date, reason, status,
                appointment_type, mode, duration
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            id,
            appointmentData.doctor_id,
            appointmentData.patient_id,
            appointmentData.appointment_date,
            appointmentData.reason,
            appointmentData.status || 'pending',
            appointmentData.appointment_type || 'regular',
            appointmentData.mode || 'In-person',
            appointmentData.duration || 30
        ];

        await mysqlPool.execute(query, values);
        return id;
    }

    static async findById(appointmentId) {
        const [rows] = await mysqlPool.execute(
            `SELECT 
                a.*,
                u.id as patient_id,
                CONCAT(u.first_name, ' ', u.last_name) as patient_name,
                COALESCE(u.image_url, '/placeholder.svg?height=40&width=40') as patient_avatar,
                TIME_FORMAT(a.appointment_date, '%h:%i %p') as appointment_time
            FROM appointments a
            JOIN users u ON a.patient_id = u.id
            WHERE a.id = ?`,
            [appointmentId]
        );
        return rows[0];
    }

    static async findByDoctorId(doctorId, filters = {}) {
        let query = `
            SELECT 
                a.*,
                u.id as patient_id,
                CONCAT(u.first_name, ' ', u.last_name) as patient_name,
                COALESCE(u.image_url, '/placeholder.svg?height=40&width=40') as patient_avatar,
                TIME_FORMAT(a.appointment_date, '%h:%i %p') as appointment_time
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
            query += ' AND DATE(a.appointment_date) >= DATE(?)';
            values.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ' AND DATE(a.appointment_date) <= DATE(?)';
            values.push(filters.endDate);
        }

        query += ' ORDER BY a.appointment_date ASC';

        const [rows] = await mysqlPool.execute(query, values);
        
        // Transform the data to match frontend expectations
        return rows.map(row => ({
            id: row.id,
            doctorId: row.doctor_id,
            patientId: row.patient_id,
            appointmentDate: row.appointment_date,
            time: row.appointment_time,
            reason: row.reason,
            appointmentType: row.appointment_type,
            status: row.status,
            mode: row.mode || 'In-person',
            duration: row.duration || 30,
            notes: row.notes,
            patient: {
                id: row.patient_id,
                name: row.patient_name,
                avatar: row.patient_avatar
            }
        }));
    }

    static async findByPatientId(patientId, filters = {}) {
        let query = `
            SELECT 
                a.*,
                CONCAT(u.first_name, ' ', u.last_name) as doctor_name,
                COALESCE(u.image_url, '/placeholder.svg?height=40&width=40') as doctor_avatar,
                dp.specialty as doctor_specialty,
                dp.rating as doctor_rating,
                TIME_FORMAT(a.appointment_date, '%h:%i %p') as appointment_time
            FROM appointments a
            JOIN users u ON a.doctor_id = u.id
            LEFT JOIN doctor_profiles dp ON u.id = dp.user_id
            WHERE a.patient_id = ?
        `;
        const values = [patientId];

        if (filters.status) {
            query += ' AND a.status = ?';
            values.push(filters.status);
        }

        query += ' ORDER BY a.appointment_date DESC';

        const [rows] = await mysqlPool.execute(query, values);

        return rows.map(row => ({
            id: row.id,
            appointmentDate: row.appointment_date,
            time: row.appointment_time,
            reason: row.reason,
            status: row.status,
            mode: row.mode || 'In-person',
            duration: row.duration || 30,
            notes: row.notes,
            doctor: {
                id: row.doctor_id,
                name: row.doctor_name,
                avatar: row.doctor_avatar,
                specialty: row.doctor_specialty,
                rating: row.doctor_rating
            }
        }));
    }

    static async updateStatus(appointmentId, status) {
        const query = `
            UPDATE appointments 
            SET status = ?
            WHERE id = ?
        `;
        await mysqlPool.execute(query, [status, appointmentId]);
    }

    static async update(appointmentId, data) {
        const query = `
            UPDATE appointments 
            SET 
                appointment_date = ?,
                reason = ?,
                status = ?,
                notes = ?,
                mode = ?,
                duration = ?
            WHERE id = ?
        `;
        const values = [
            data.appointment_date,
            data.reason,
            data.status,
            data.notes,
            data.mode,
            data.duration,
            appointmentId
        ];
        await mysqlPool.execute(query, values);
    }

    static async getDoctors() {
        const query = `
            SELECT 
                u.id,
                CONCAT(u.first_name, ' ', u.last_name) as name,
                COALESCE(u.image_url, '/placeholder.svg?height=40&width=40') as avatar,
                dp.specialty,
                dp.rating,
                dp.experience_years as experience,
                dp.bio,
                dp.clinic_name,
                dp.clinic_address
            FROM users u
            JOIN doctor_profiles dp ON u.id = dp.user_id
            WHERE u.role = 'doctor'
        `;
        const [rows] = await mysqlPool.execute(query);
        return rows;
    }

    static async checkAvailability(doctorId, appointmentDate) {
        const [rows] = await mysqlPool.execute(
            `SELECT COUNT(*) as count
            FROM appointments
            WHERE doctor_id = ?
            AND DATE(appointment_date) = DATE(?)
            AND status NOT IN ('cancelled', 'completed')`,
            [doctorId, appointmentDate]
        );
        return rows[0].count < 8; // Assuming max 8 appointments per day
    }
}

module.exports = Appointment;
