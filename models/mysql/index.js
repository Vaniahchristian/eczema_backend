const { mysqlPool } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

class User {
    static async create(userData) {
        const id = uuidv4();
        const query = `
            INSERT INTO users (
                id, email, password, role, first_name, last_name,
                date_of_birth, gender
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            id, userData.email, userData.password, userData.role,
            userData.firstName, userData.lastName, userData.dateOfBirth,
            userData.gender
        ];

        await mysqlPool.execute(query, values);
        return id;
    }

    static async findByEmail(email) {
        const [rows] = await mysqlPool.execute(
            'SELECT id, email, password, role, first_name as firstName, last_name as lastName, date_of_birth as dateOfBirth, gender FROM users WHERE email = ?',
            [email]
        );
        return rows[0];
    }

    static async findById(userId) {
        const [rows] = await mysqlPool.execute(
            'SELECT id, email, role, first_name as firstName, last_name as lastName, date_of_birth as dateOfBirth, gender FROM users WHERE id = ?',
            [userId]
        );
        return rows[0];
    }

    static async updateProfile(userId, userData) {
        const query = `
            UPDATE users 
            SET first_name = ?, last_name = ?, gender = ?
            WHERE id = ?
        `;
        const values = [userData.firstName, userData.lastName, userData.gender, userId];
        await mysqlPool.execute(query, values);
    }
}

class DoctorProfile {
    static async create(profileData) {
        const query = `
            INSERT INTO doctor_profiles (
                id, user_id, specialty, bio, rating,
                experience_years, available_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            profileData.id,
            profileData.userId,
            profileData.specialty,
            profileData.bio,
            profileData.rating,
            profileData.experienceYears,
            profileData.available_hours
        ];

        await mysqlPool.execute(query, values);
        return profileData.id;
    }

    static async findByUserId(userId) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM doctor_profiles WHERE user_id = ?',
            [userId]
        );
        return rows[0];
    }
}

class PatientProfile {
    static async create(profileData) {
        const id = uuidv4();
        const query = `
            INSERT INTO patient_profiles (
                id, user_id, medical_history, allergies, medications
            ) VALUES (?, ?, ?, ?, ?)
        `;
        const values = [
            id, profileData.userId, profileData.medicalHistory,
            profileData.allergies, profileData.medications
        ];
        await mysqlPool.execute(query, values);
        return id;
    }

    static async findByUserId(userId) {
        const [rows] = await mysqlPool.execute(
            'SELECT * FROM patient_profiles WHERE user_id = ?',
            [userId]
        );
        return rows[0];
    }
}

class Appointment {
    static async create(appointmentData) {
        const id = uuidv4();
        const query = `
            INSERT INTO appointments (
                id, patient_id, doctor_id, appointment_date,
                status, reason, appointment_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            id, appointmentData.patient_id, appointmentData.doctor_id,
            appointmentData.appointment_date, appointmentData.status,
            appointmentData.reason, appointmentData.appointment_type || 'regular'
        ];

        await mysqlPool.execute(query, values);
        return id;
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
    PatientProfile,
    Appointment,
    TreatmentPlan,
    PatientMedicalHistory
};
