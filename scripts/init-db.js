const { mysqlPool } = require('../config/database');

async function initializeDatabase() {
    try {
        console.log('Initializing databases...');

        // Create database if it doesn't exist
        await mysqlPool.execute('CREATE DATABASE IF NOT EXISTS eczema');
        await mysqlPool.execute('USE eczema');

        // Disable foreign key checks temporarily
        await mysqlPool.execute('SET FOREIGN_KEY_CHECKS = 0');

        // Drop existing tables
        console.log('Dropping existing tables...');
        await mysqlPool.execute('DROP TABLE IF EXISTS research_consent');
        await mysqlPool.execute('DROP TABLE IF EXISTS appointments');
        await mysqlPool.execute('DROP TABLE IF EXISTS patient_profiles');
        await mysqlPool.execute('DROP TABLE IF EXISTS doctor_profiles');
        await mysqlPool.execute('DROP TABLE IF EXISTS users');

        // Re-enable foreign key checks
        await mysqlPool.execute('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Creating tables...');

        // Create users table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('patient', 'doctor', 'researcher', 'admin') NOT NULL DEFAULT 'patient',
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                date_of_birth DATE NOT NULL,
                gender ENUM('male', 'female', 'other') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create doctor_profiles table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS doctor_profiles (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                specialization VARCHAR(100) NOT NULL,
                license_number VARCHAR(50) UNIQUE NOT NULL,
                years_of_experience INT NOT NULL,
                available_hours JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create patient_profiles table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS patient_profiles (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                medical_history TEXT,
                allergies TEXT,
                medications TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create appointments table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS appointments (
                id VARCHAR(36) PRIMARY KEY,
                patient_id VARCHAR(36) NOT NULL,
                doctor_id VARCHAR(36) NOT NULL,
                appointment_date DATETIME NOT NULL,
                status ENUM('scheduled', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'scheduled',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create research_consent table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS research_consent (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                consented BOOLEAN NOT NULL DEFAULT FALSE,
                consent_date TIMESTAMP NULL,
                revocation_date TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Insert dummy data
        console.log('Inserting dummy data...');

        // Insert users
        await mysqlPool.execute(`
            INSERT INTO users (id, email, password, role, first_name, last_name, date_of_birth, gender) VALUES
            ('d1', 'doctor1@example.com', '$2b$10$xxxxxxxxxxx', 'doctor', 'John', 'Smith', '1980-01-01', 'male'),
            ('d2', 'doctor2@example.com', '$2b$10$xxxxxxxxxxx', 'doctor', 'Sarah', 'Johnson', '1985-02-15', 'female'),
            ('p1', 'patient1@example.com', '$2b$10$xxxxxxxxxxx', 'patient', 'Michael', 'Brown', '1990-03-20', 'male'),
            ('p2', 'patient2@example.com', '$2b$10$xxxxxxxxxxx', 'patient', 'Emily', 'Davis', '1995-04-10', 'female'),
            ('r1', 'researcher1@example.com', '$2b$10$xxxxxxxxxxx', 'researcher', 'David', 'Wilson', '1975-05-05', 'male')
        `);

        // Insert doctor profiles
        await mysqlPool.execute(`
            INSERT INTO doctor_profiles (id, user_id, specialization, license_number, years_of_experience, available_hours) VALUES
            ('dp1', 'd1', 'Dermatology', 'LIC123456', 15, '{"monday": ["09:00-17:00"], "tuesday": ["09:00-17:00"], "wednesday": ["09:00-17:00"], "thursday": ["09:00-17:00"], "friday": ["09:00-17:00"]}'),
            ('dp2', 'd2', 'Dermatology', 'LIC789012', 10, '{"monday": ["10:00-18:00"], "tuesday": ["10:00-18:00"], "wednesday": ["10:00-18:00"], "thursday": ["10:00-18:00"], "friday": ["10:00-18:00"]}')
        `);

        // Insert patient profiles
        await mysqlPool.execute(`
            INSERT INTO patient_profiles (id, user_id, medical_history, allergies, medications) VALUES
            ('pp1', 'p1', 'History of mild eczema', 'Peanuts', 'None'),
            ('pp2', 'p2', 'Chronic eczema since childhood', 'Dairy, dust', 'Topical corticosteroids')
        `);

        // Insert appointments
        await mysqlPool.execute(`
            INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, status, notes) VALUES
            ('a1', 'p1', 'd1', '2025-03-21 10:00:00', 'scheduled', 'Initial consultation'),
            ('a2', 'p2', 'd2', '2025-03-22 14:00:00', 'scheduled', 'Follow-up appointment'),
            ('a3', 'p1', 'd2', '2025-03-19 11:00:00', 'completed', 'Regular checkup')
        `);

        // Insert research consent
        await mysqlPool.execute(`
            INSERT INTO research_consent (id, user_id, consented, consent_date) VALUES
            ('rc1', 'p1', TRUE, '2025-03-01 00:00:00'),
            ('rc2', 'p2', TRUE, '2025-03-02 00:00:00')
        `);

        console.log('Database initialization completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

initializeDatabase();
