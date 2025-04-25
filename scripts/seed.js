const { MySQL, Mongo } = require('../models');
const { User, Appointment } = MySQL;
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { mysqlPool } = require('../config/database');
const { connectMongoDB } = require('../config/database');

async function seedUsers() {
    const passwordHash = await bcrypt.hash('password123', 10);
    
    // Create doctors
    const doctors = [
        {
            user_id: uuidv4(),
            email: 'dr.smith@example.com',
            password_hash: passwordHash,
            first_name: 'John',
            last_name: 'Smith',
            role: 'doctor',
            date_of_birth: '1980-05-15',
            gender: 'male',
            phone_number: '+1234567890',
            address: 'New York, USA'
        },
        {
            user_id: uuidv4(),
            email: 'dr.jones@example.com',
            password_hash: passwordHash,
            first_name: 'Sarah',
            last_name: 'Jones',
            role: 'doctor',
            date_of_birth: '1985-08-22',
            gender: 'female',
            phone_number: '+1234567891',
            address: 'Los Angeles, USA'
        }
    ];

    // Create patients
    const patients = [
        {
            user_id: uuidv4(),
            email: 'patient1@example.com',
            password_hash: passwordHash,
            first_name: 'Alice',
            last_name: 'Johnson',
            role: 'patient',
            date_of_birth: '1990-03-10',
            gender: 'female',
            phone_number: '+1234567892',
            address: 'Chicago, USA'
        },
        {
            user_id: uuidv4(),
            email: 'patient2@example.com',
            password_hash: passwordHash,
            first_name: 'Bob',
            last_name: 'Wilson',
            role: 'patient',
            date_of_birth: '1995-11-28',
            gender: 'male',
            phone_number: '+1234567893',
            address: 'Miami, USA'
        }
    ];

    try {
        // Insert all users first
        for (const doctor of doctors) {
            await mysqlPool.execute(
                `INSERT INTO users (user_id, email, password_hash, first_name, last_name, role, date_of_birth, gender, phone_number, address)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    doctor.user_id,
                    doctor.email,
                    doctor.password_hash,
                    doctor.first_name,
                    doctor.last_name,
                    doctor.role,
                    doctor.date_of_birth,
                    doctor.gender,
                    doctor.phone_number,
                    doctor.address
                ]
            );
        }
        
        for (const patient of patients) {
            await mysqlPool.execute(
                `INSERT INTO users (user_id, email, password_hash, first_name, last_name, role, date_of_birth, gender, phone_number, address)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    patient.user_id,
                    patient.email,
                    patient.password_hash,
                    patient.first_name,
                    patient.last_name,
                    patient.role,
                    patient.date_of_birth,
                    patient.gender,
                    patient.phone_number,
                    patient.address
                ]
            );
        }

        // Then create doctor profiles
        for (const doctor of doctors) {
            await mysqlPool.execute(
                `INSERT INTO doctor_profiles (user_id, specialization, license_number, available_hours)
                 VALUES (?, ?, ?, ?)`,
                [
                    doctor.user_id,
                    'Dermatology',
                    `LIC${Math.random().toString(36).substring(7).toUpperCase()}`,
                    JSON.stringify({
                        monday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                        tuesday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                        wednesday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                        thursday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
                        friday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
                    })
                ]
            );
        }

        return { doctors, patients };
    } catch (error) {
        console.error('Error in seedUsers:', error);
        throw error;
    }
}

async function seedAppointments(users) {
    const statuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    const appointments = [];

    try {
        for (const doctor of users.doctors) {
            for (const patient of users.patients) {
                // Create past appointments
                for (let i = 0; i < 3; i++) {
                    const pastDate = new Date();
                    pastDate.setDate(pastDate.getDate() - Math.floor(Math.random() * 30));
                    
                    const appointment = {
                        appointment_id: uuidv4(),
                        doctor_id: doctor.user_id,
                        patient_id: patient.user_id,
                        appointment_date: pastDate,
                        reason: 'Regular checkup',
                        status: statuses[Math.floor(Math.random() * statuses.length)]
                    };
                    
                    await mysqlPool.execute(
                        `INSERT INTO appointments (appointment_id, doctor_id, patient_id, appointment_date, reason, status)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            appointment.appointment_id,
                            appointment.doctor_id,
                            appointment.patient_id,
                            appointment.appointment_date,
                            appointment.reason,
                            appointment.status
                        ]
                    );
                    
                    appointments.push(appointment);
                }

                // Create future appointments
                for (let i = 0; i < 2; i++) {
                    const futureDate = new Date();
                    futureDate.setDate(futureDate.getDate() + Math.floor(Math.random() * 30));
                    
                    const appointment = {
                        appointment_id: uuidv4(),
                        doctor_id: doctor.user_id,
                        patient_id: patient.user_id,
                        appointment_date: futureDate,
                        reason: 'Follow-up consultation',
                        status: 'pending'
                    };
                    
                    await mysqlPool.execute(
                        `INSERT INTO appointments (appointment_id, doctor_id, patient_id, appointment_date, reason, status)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            appointment.appointment_id,
                            appointment.doctor_id,
                            appointment.patient_id,
                            appointment.appointment_date,
                            appointment.reason,
                            appointment.status
                        ]
                    );
                    
                    appointments.push(appointment);
                }
            }
        }
        return appointments;
    } catch (error) {
        console.error('Error in seedAppointments:', error);
        throw error;
    }
}

async function seedDiagnoses(users) {
    const { Diagnosis } = Mongo;
    const severityLevels = ['mild', 'moderate', 'severe'];
    const bodyParts = ['face', 'arms', 'legs', 'torso', 'hands'];
    const diagnoses = [];

    try {
        for (const patient of users.patients) {
            for (let i = 0; i < 3; i++) {
                const diagnosisDate = new Date();
                diagnosisDate.setDate(diagnosisDate.getDate() - Math.floor(Math.random() * 90));
                const imageId = uuidv4();
                const doctorId = users.doctors[Math.floor(Math.random() * users.doctors.length)].user_id;

                const diagnosis = {
                    diagnosisId: uuidv4(),
                    patientId: patient.user_id,
                    imageId: imageId,
                    imageMetadata: {
                        originalFileName: `eczema_${imageId}.jpg`,
                        uploadDate: diagnosisDate,
                        fileSize: Math.floor(Math.random() * (5000000 - 1000000) + 1000000),
                        dimensions: {
                            width: 1920,
                            height: 1080
                        },
                        imageQuality: Math.random() * (1 - 0.7) + 0.7,
                        format: 'JPEG'
                    },
                    mlResults: {
                        prediction: true,
                        confidence: Math.random() * (0.99 - 0.7) + 0.7,
                        severity: severityLevels[Math.floor(Math.random() * severityLevels.length)],
                        affectedAreas: [bodyParts[Math.floor(Math.random() * bodyParts.length)]],
                        differentialDiagnosis: [
                            {
                                condition: 'Contact Dermatitis',
                                probability: Math.random() * (0.4 - 0.1) + 0.1
                            },
                            {
                                condition: 'Psoriasis',
                                probability: Math.random() * (0.3 - 0.1) + 0.1
                            }
                        ],
                        modelVersion: '1.0.0'
                    },
                    recommendations: {
                        treatments: [
                            {
                                type: 'Topical Corticosteroid',
                                description: 'Apply twice daily to affected areas',
                                priority: 1
                            },
                            {
                                type: 'Moisturizer',
                                description: 'Apply after bathing and as needed',
                                priority: 2
                            }
                        ],
                        lifestyle: [
                            {
                                category: 'Skincare',
                                recommendations: [
                                    'Use gentle, fragrance-free soap',
                                    'Take short, lukewarm showers',
                                    'Pat skin dry instead of rubbing'
                                ]
                            },
                            {
                                category: 'Diet',
                                recommendations: [
                                    'Stay hydrated',
                                    'Avoid known food triggers',
                                    'Consider keeping a food diary'
                                ]
                            }
                        ],
                        triggers: [
                            'Stress',
                            'Hot weather',
                            'Certain fabrics',
                            'Harsh soaps'
                        ],
                        precautions: [
                            'Avoid scratching affected areas',
                            'Keep nails trimmed',
                            'Wear loose-fitting, cotton clothing'
                        ]
                    },
                    doctorReview: {
                        reviewedBy: doctorId,
                        reviewDate: new Date(),
                        comments: 'Initial diagnosis looks accurate. Continue with recommended treatment plan.',
                        adjustments: []
                    }
                };

                const diagnosisDoc = new Diagnosis(diagnosis);
                await diagnosisDoc.save();
                diagnoses.push(diagnosisDoc);
            }
        }
        return diagnoses;
    } catch (error) {
        console.error('Error in seedDiagnoses:', error);
        throw error;
    }
}

async function clearDatabases() {
    try {
        // Clear MySQL tables
        await mysqlPool.execute('SET FOREIGN_KEY_CHECKS = 0');
        await mysqlPool.execute('TRUNCATE TABLE appointments');
        await mysqlPool.execute('TRUNCATE TABLE doctor_profiles');
        await mysqlPool.execute('TRUNCATE TABLE treatment_plans');
        await mysqlPool.execute('TRUNCATE TABLE patient_medical_history');
        await mysqlPool.execute('TRUNCATE TABLE users');
        await mysqlPool.execute('SET FOREIGN_KEY_CHECKS = 1');

        // Clear MongoDB collections
        const { Diagnosis } = Mongo;
        if (Diagnosis) {
            await Diagnosis.deleteMany({});
        }
    } catch (error) {
        console.error('Error clearing databases:', error);
        throw error;
    }
}

async function seed() {
    try {
        console.log('Starting database seeding...');
        
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await connectMongoDB();
        
        // Clear existing data
        console.log('Clearing existing data...');
        await clearDatabases();
        
        // Seed users and get references
        console.log('Seeding users...');
        const users = await seedUsers();
        
        // Seed appointments
        console.log('Seeding appointments...');
        await seedAppointments(users);
        
        // Seed diagnoses in MongoDB
        console.log('Seeding diagnoses...');
        await seedDiagnoses(users);
        
        console.log('Database seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seed();
