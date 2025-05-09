-- Drop tables if they exist (in reverse order of dependencies)
DROP TABLE IF EXISTS treatment_plans;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS patient_medical_history;
DROP TABLE IF EXISTS doctor_profiles;
DROP TABLE IF EXISTS users;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('patient', 'doctor', 'researcher', 'admin') DEFAULT 'patient',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(50),
    phone_number VARCHAR(20),
    address TEXT,
    last_active TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create doctor_profiles table
CREATE TABLE IF NOT EXISTS doctor_profiles (
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
);

-- Create Patient Medical History table
CREATE TABLE patient_medical_history (
    history_id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    allergies TEXT,
    previous_conditions TEXT,
    family_history TEXT,
    current_medications TEXT,
    eczema_history TEXT,
    known_triggers TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create Appointments table
CREATE TABLE appointments (
    appointment_id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    appointment_date DATETIME NOT NULL,
    status ENUM('pending', 'confirmed', 'completed', 'cancelled') NOT NULL,
    reason_for_visit TEXT NOT NULL,
    appointment_type ENUM('first_visit', 'follow_up', 'emergency') NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctor_profiles(doctor_id) ON DELETE CASCADE
);

-- Create Treatment Plans table
CREATE TABLE treatment_plans (
    treatment_id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    diagnosis_id VARCHAR(36) NOT NULL,
    treatment_description TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status ENUM('active', 'completed', 'discontinued') NOT NULL,
    progress_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctor_profiles(doctor_id) ON DELETE CASCADE
);
