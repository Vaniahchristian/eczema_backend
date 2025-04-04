const { mysqlPool } = require('../config/database');
const uuidv4 = require('uuid').v4;

async function createDatabase() {
    try {
        console.log('Creating database...');

        // Create and use database
        await mysqlPool.query('DROP DATABASE IF EXISTS eczema;');
        await mysqlPool.query('CREATE DATABASE eczema;');
        await mysqlPool.query('USE eczema;');

        console.log('Database created successfully');
    } catch (error) {
        console.error('Error creating database:', error);
        throw error;
    }
}

async function createTables() {
    try {
        console.log('Creating tables...');

        // Create users table first (no foreign key dependencies)
        await mysqlPool.query(`
            CREATE TABLE users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('patient', 'doctor', 'researcher', 'admin') NOT NULL DEFAULT 'patient',
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                date_of_birth DATE,
                gender ENUM('male', 'female', 'other'),
                phone_number VARCHAR(20),
                address TEXT,
                image_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Create doctor_profiles table
        await mysqlPool.query(`
            CREATE TABLE doctor_profiles (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                specialty VARCHAR(100) NOT NULL,
                bio TEXT,
                rating DECIMAL(3,2) DEFAULT 5.0,
                experience_years INT DEFAULT 0,
                clinic_name VARCHAR(255),
                clinic_address TEXT,
                consultation_fee DECIMAL(10,2),
                available_hours JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Create patient_profiles table
        await mysqlPool.query(`
            CREATE TABLE patient_profiles (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                medical_history TEXT,
                allergies TEXT,
                medications TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Create appointments table
        await mysqlPool.query(`
            CREATE TABLE appointments (
                id VARCHAR(36) PRIMARY KEY,
                doctor_id VARCHAR(36) NOT NULL,
                patient_id VARCHAR(36) NOT NULL,
                appointment_date DATETIME NOT NULL,
                reason TEXT NOT NULL,
                appointment_type VARCHAR(50) NOT NULL DEFAULT 'regular',
                status ENUM('pending', 'confirmed', 'cancelled', 'completed', 'rescheduled') NOT NULL DEFAULT 'pending',
                mode ENUM('In-person', 'Video', 'Phone') NOT NULL DEFAULT 'In-person',
                duration INT DEFAULT 30,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (doctor_id) REFERENCES users(id),
                FOREIGN KEY (patient_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        console.log('Tables created successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
}

async function insertDummyData() {
    try {
        console.log('Inserting dummy data...');

        // Insert users
        const users = [
            {
                id: '550e8400-e29b-41d4-a716-446655440000',
                email: 'doctor1@example.com',
                password: '$2b$10$EiA3c7avHjGXwTagXqkZ1.YxkGBL3k0vuPkZSO.h6HT6NqhBRGHYe', // password123
                role: 'doctor',
                first_name: 'John',
                last_name: 'Doe',
                date_of_birth: '1980-01-01',
                gender: 'male',
                image_url: '/images/doctors/doctor1.jpg'
            },
            {
                id: '550e8400-e29b-41d4-a716-446655440001',
                email: 'patient1@example.com',
                password: '$2b$10$EiA3c7avHjGXwTagXqkZ1.YxkGBL3k0vuPkZSO.h6HT6NqhBRGHYe', // password123
                role: 'patient',
                first_name: 'Jane',
                last_name: 'Smith',
                date_of_birth: '1990-05-15',
                gender: 'female',
                image_url: '/images/patients/patient1.jpg'
            }
        ];

        for (const user of users) {
            await mysqlPool.query(
                'INSERT INTO users (id, email, password, role, first_name, last_name, date_of_birth, gender, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [user.id, user.email, user.password, user.role, user.first_name, user.last_name, user.date_of_birth, user.gender, user.image_url]
            );
        }

        // Insert doctor profiles
        const doctorProfiles = [
            {
                id: uuidv4(),
                user_id: '550e8400-e29b-41d4-a716-446655440000',
                specialty: 'Dermatology',
                bio: 'Experienced dermatologist specializing in eczema treatment',
                rating: 4.8,
                experience_years: 15,
                clinic_name: 'Healthy Skin Clinic',
                clinic_address: '123 Medical Center Dr.',
                consultation_fee: 150.00,
                available_hours: JSON.stringify({
                    monday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                    tuesday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                    wednesday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                    thursday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                    friday: ['09:00', '10:00', '11:00', '14:00', '15:00']
                })
            }
        ];

        for (const profile of doctorProfiles) {
            await mysqlPool.execute(`
                INSERT INTO doctor_profiles (
                    id, user_id, specialty, bio, rating, 
                    experience_years, clinic_name, clinic_address, 
                    consultation_fee, available_hours
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                profile.id, profile.user_id, profile.specialty,
                profile.bio, profile.rating, profile.experience_years,
                profile.clinic_name, profile.clinic_address,
                profile.consultation_fee, profile.available_hours
            ]);
        }

        console.log('Dummy data inserted successfully');
    } catch (error) {
        console.error('Error inserting dummy data:', error);
        throw error;
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
