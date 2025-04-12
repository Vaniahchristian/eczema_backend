require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Database configuration
const dbConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'railway',
    ssl: {
        rejectUnauthorized: false
    }
};

async function createDatabase() {
    const connection = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        ssl: dbConfig.ssl
    });

    try {
        console.log('Creating database...');
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        console.log('Database created successfully');
    } catch (error) {
        console.error('Error creating database:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

async function createTables() {
    const connection = await mysql.createConnection(dbConfig);

    try {
        console.log('Creating tables...');

        // Drop existing tables in reverse order of dependencies
        await connection.query('DROP TABLE IF EXISTS appointments');
        await connection.query('DROP TABLE IF EXISTS diagnoses');
        await connection.query('DROP TABLE IF EXISTS doctor_profiles');
        await connection.query('DROP TABLE IF EXISTS patients');
        await connection.query('DROP TABLE IF EXISTS patient_profiles');
        await connection.query('DROP TABLE IF EXISTS users');

        // Create users table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('patient', 'doctor', 'researcher', 'admin') DEFAULT 'patient',
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                image_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Create patients table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                date_of_birth DATE,
                gender VARCHAR(50),
                medical_history TEXT,
                allergies TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Create patient_profiles table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS patient_profiles (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                height DECIMAL(5,2),
                weight DECIMAL(6,2),
                blood_type VARCHAR(10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Create doctor_profiles table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS doctor_profiles (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                specialty VARCHAR(100),
                bio TEXT,
                rating DECIMAL(3,2) DEFAULT 5.0,
                experience_years INT DEFAULT 0,
                clinic_name VARCHAR(255),
                clinic_address TEXT,
                consultation_fee DECIMAL(10,2),
                available_hours JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Create diagnoses table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS diagnoses (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                severity ENUM('mild', 'moderate', 'severe') NOT NULL,
                confidence FLOAT NOT NULL,
                notes TEXT,
                image_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Create appointments table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id VARCHAR(36) PRIMARY KEY,
                doctor_id VARCHAR(36) NOT NULL,
                patient_id VARCHAR(36) NOT NULL,
                appointment_date DATETIME NOT NULL,
                reason TEXT,
                status ENUM('pending', 'confirmed', 'cancelled', 'completed', 'rescheduled') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (doctor_id) REFERENCES users(id),
                FOREIGN KEY (patient_id) REFERENCES users(id)
            )
        `);

        console.log('Tables created successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

async function insertDummyData() {
    const connection = await mysql.createConnection(dbConfig);

    try {
        console.log('Inserting dummy data...');
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Create a test patient
        const patientId = uuidv4();
        const patientUserId = uuidv4();
        const patientPassword = await bcrypt.hash('testpassword', 10);

        await connection.query(`
            INSERT INTO users (id, email, password, role, first_name, last_name, created_at, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [patientUserId, 'test@example.com', patientPassword, 'patient', 'Test', 'User', now, now, now]);

        await connection.query(`
            INSERT INTO patients (id, user_id, date_of_birth, gender, medical_history, allergies, created_at, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [patientId, patientUserId, '1990-01-01', 'male', 'No significant history', 'None', now, now, now]);

        // Create a test doctor
        const doctorId = uuidv4();
        const doctorUserId = uuidv4();
        const doctorPassword = await bcrypt.hash('doctorpass', 10);

        await connection.query(`
            INSERT INTO users (id, email, password, role, first_name, last_name, image_url, created_at, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [doctorUserId, 'doctor@example.com', doctorPassword, 'doctor', 'John', 'Smith', '/images/doctors/default.jpg', now, now, now]);

        await connection.query(`
            INSERT INTO doctor_profiles (id, user_id, specialty, bio, rating, experience_years, clinic_name, clinic_address, consultation_fee, available_hours, created_at, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            doctorId, 
            doctorUserId, 
            'Dermatology',
            'Experienced dermatologist specializing in eczema treatment',
            4.8,
            10,
            'Healthy Skin Clinic',
            '123 Medical Center Dr, City',
            150.00,
            JSON.stringify({
                monday: ['09:00', '10:00', '11:00', '14:00', '15:00'],
                tuesday: ['09:00', '10:00', '11:00', '14:00', '15:00'],
                wednesday: ['09:00', '10:00', '11:00', '14:00', '15:00']
            }),
            now,
            now,
            now
        ]);

        // Create some test diagnoses
        const diagnosisId1 = uuidv4();
        const diagnosisId2 = uuidv4();

        await connection.query(`
            INSERT INTO diagnoses (id, user_id, severity, confidence, notes, image_url, created_at, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            diagnosisId1, patientUserId, 'mild', 0.85, 'First diagnosis', 'uploads/test1.jpg', now, now, now,
            diagnosisId2, patientUserId, 'moderate', 0.92, 'Second diagnosis', 'uploads/test2.jpg', now, now, now
        ]);

        console.log('Dummy data inserted successfully');
    } catch (error) {
        console.error('Error inserting dummy data:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

async function initializeDatabase() {
    try {
        await createDatabase();
        await createTables();
        await insertDummyData();
        console.log('Database initialization completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Database initialization failed:', error);
        process.exit(1);
    }
}

initializeDatabase();
