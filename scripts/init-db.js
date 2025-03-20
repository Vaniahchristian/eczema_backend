const { mysqlPool } = require('../config/database');

async function initializeDatabase() {
    try {
        console.log('Initializing databases...');

        // Disable foreign key checks temporarily
        await mysqlPool.execute('SET FOREIGN_KEY_CHECKS = 0');

        // Drop existing tables
        console.log('Dropping existing tables...');
        await mysqlPool.execute('DROP TABLE IF EXISTS patient_medical_history');
        await mysqlPool.execute('DROP TABLE IF EXISTS treatment_plans');
        await mysqlPool.execute('DROP TABLE IF EXISTS appointments');
        await mysqlPool.execute('DROP TABLE IF EXISTS doctor_profiles');
        await mysqlPool.execute('DROP TABLE IF EXISTS users');

        // Re-enable foreign key checks
        await mysqlPool.execute('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Creating tables...');

        // Create users table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                user_id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                role ENUM('patient', 'doctor', 'admin') NOT NULL DEFAULT 'patient',
                date_of_birth DATE,
                gender ENUM('male', 'female', 'other'),
                phone_number VARCHAR(20),
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create doctor_profiles table with available_hours column
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS doctor_profiles (
                user_id VARCHAR(36) PRIMARY KEY,
                specialization VARCHAR(100),
                license_number VARCHAR(50),
                available_hours JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create appointments table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS appointments (
                appointment_id VARCHAR(36) PRIMARY KEY,
                doctor_id VARCHAR(36) NOT NULL,
                patient_id VARCHAR(36) NOT NULL,
                appointment_date DATETIME NOT NULL,
                reason TEXT,
                status ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (doctor_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create treatment_plans table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS treatment_plans (
                plan_id VARCHAR(36) PRIMARY KEY,
                patient_id VARCHAR(36) NOT NULL,
                doctor_id VARCHAR(36) NOT NULL,
                diagnosis_id VARCHAR(36) NOT NULL,
                treatment_description TEXT NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                status ENUM('active', 'completed', 'discontinued') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create patient_medical_history table
        await mysqlPool.execute(`
            CREATE TABLE IF NOT EXISTS patient_medical_history (
                history_id VARCHAR(36) PRIMARY KEY,
                patient_id VARCHAR(36) NOT NULL,
                condition_name VARCHAR(100) NOT NULL,
                diagnosis_date DATE,
                medications TEXT,
                allergies TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        console.log('Database tables created successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

initializeDatabase();
