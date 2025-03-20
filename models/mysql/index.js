const { mysqlPool } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

class User {
    static async create(userData) {
        const userId = uuidv4();
        const query = `
            INSERT INTO users (
                user_id, email, password_hash, role, first_name, last_name,
                date_of_birth, gender, phone_number, address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            userId, userData.email, userData.password_hash, userData.role,
            userData.first_name, userData.last_name, userData.date_of_birth,
            userData.gender, userData.phone_number, userData.address
        ];

        await mysqlPool.execute(query, values);
        return userId;
    }

    static async findByEmail(email) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return rows[0];
    }

    static async findById(userId) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM users WHERE user_id = ?',
            [userId]
        );
        return rows[0];
    }

    static async update(userId, userData) {
        // Filter out undefined values
        const validUpdates = Object.entries(userData)
            .filter(([_, value]) => value !== undefined)
            .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

        if (Object.keys(validUpdates).length === 0) {
            return; // No valid updates
        }

        const setClause = Object.keys(validUpdates)
            .map(key => `${key} = ?`)
            .join(', ');

        const query = `UPDATE users SET ${setClause} WHERE user_id = ?`;
        const values = [...Object.values(validUpdates), userId];

        await mysqlPool.execute(query, values);
    }
}

class DoctorProfile {
    static async create(profileData) {
        const doctorId = uuidv4();
        const query = `
            INSERT INTO doctor_profiles (
                doctor_id, user_id, license_number, specialization,
                qualification, hospital_affiliation, consultation_fee,
                years_of_experience, available_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            doctorId, profileData.user_id, profileData.license_number,
            profileData.specialization, profileData.qualification,
            profileData.hospital_affiliation, profileData.consultation_fee,
            profileData.years_of_experience, JSON.stringify(profileData.available_days)
        ];

        await mysqlPool.execute(query, values);
        return doctorId;
    }

    static async findByUserId(userId) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM doctor_profiles WHERE user_id = ?',
            [userId]
        );
        return rows[0];
    }
}

class Appointment {
    static async create(appointmentData) {
        const appointmentId = uuidv4();
        const query = `
            INSERT INTO appointments (
                appointment_id, patient_id, doctor_id, appointment_date,
                status, reason_for_visit, appointment_type, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            appointmentId, appointmentData.patient_id, appointmentData.doctor_id,
            appointmentData.appointment_date, appointmentData.status,
            appointmentData.reason_for_visit, appointmentData.appointment_type,
            appointmentData.notes
        ];

        await mysqlPool.execute(query, values);
        return appointmentId;
    }

    static async findByPatientId(patientId) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM appointments WHERE patient_id = ? ORDER BY appointment_date DESC',
            [patientId]
        );
        return rows;
    }

    static async findByDoctorId(doctorId) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM appointments WHERE doctor_id = ? ORDER BY appointment_date DESC',
            [doctorId]
        );
        return rows;
    }

    static async updateStatus(appointmentId, status) {
        await mysqlPool.execute(
            'UPDATE appointments SET status = ? WHERE appointment_id = ?',
            [status, appointmentId]
        );
    }
}

class TreatmentPlan {
    static async create(treatmentData) {
        const treatmentId = uuidv4();
        const query = `
            INSERT INTO treatment_plans (
                treatment_id, patient_id, doctor_id, diagnosis_id,
                treatment_description, start_date, end_date, status,
                progress_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            treatmentId, treatmentData.patient_id, treatmentData.doctor_id,
            treatmentData.diagnosis_id, treatmentData.treatment_description,
            treatmentData.start_date, treatmentData.end_date,
            treatmentData.status, treatmentData.progress_notes
        ];

        await mysqlPool.execute(query, values);
        return treatmentId;
    }

    static async findByPatientId(patientId) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM treatment_plans WHERE patient_id = ? ORDER BY created_at DESC',
            [patientId]
        );
        return rows;
    }

    static async updateProgress(treatmentId, progressNotes) {
        await mysqlPool.execute(
            'UPDATE treatment_plans SET progress_notes = ? WHERE treatment_id = ?',
            [progressNotes, treatmentId]
        );
    }
}

class PatientMedicalHistory {
    static async create(historyData) {
        const historyId = uuidv4();
        const query = `
            INSERT INTO patient_medical_history (
                history_id, patient_id, allergies, previous_conditions,
                family_history, current_medications, eczema_history,
                known_triggers
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            historyId, historyData.patient_id, historyData.allergies,
            historyData.previous_conditions, historyData.family_history,
            historyData.current_medications, historyData.eczema_history,
            historyData.known_triggers
        ];

        await mysqlPool.execute(query, values);
        return historyId;
    }

    static async findByPatientId(patientId) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM patient_medical_history WHERE patient_id = ?',
            [patientId]
        );
        return rows[0];
    }

    static async update(patientId, historyData) {
        const query = `
            UPDATE patient_medical_history
            SET allergies = ?,
                previous_conditions = ?,
                family_history = ?,
                current_medications = ?,
                eczema_history = ?,
                known_triggers = ?
            WHERE patient_id = ?
        `;
        const values = [
            historyData.allergies, historyData.previous_conditions,
            historyData.family_history, historyData.current_medications,
            historyData.eczema_history, historyData.known_triggers,
            patientId
        ];

        await mysqlPool.execute(query, values);
    }
}

module.exports = {
    User,
    DoctorProfile,
    Appointment,
    TreatmentPlan,
    PatientMedicalHistory
};
