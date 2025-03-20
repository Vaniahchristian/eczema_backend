const request = require('supertest');
const app = require('../app');
const { MySQL } = require('../models');
const { User, Appointment } = MySQL;
const jwt = require('jsonwebtoken');

let doctorToken;
let patientToken;
let doctorId;
let patientId;
let appointmentId;

beforeAll(async () => {
    // Create test users
    doctorId = await User.create({
        email: 'test.doctor@example.com',
        password_hash: 'hashedpassword123',
        first_name: 'Test',
        last_name: 'Doctor',
        role: 'doctor',
        date_of_birth: '1980-01-01',
        gender: 'male'
    });

    patientId = await User.create({
        email: 'test.patient@example.com',
        password_hash: 'hashedpassword123',
        first_name: 'Test',
        last_name: 'Patient',
        role: 'patient',
        date_of_birth: '1990-01-01',
        gender: 'female'
    });

    // Generate tokens
    doctorToken = jwt.sign({ id: doctorId }, process.env.JWT_SECRET || 'your-secret-key');
    patientToken = jwt.sign({ id: patientId }, process.env.JWT_SECRET || 'your-secret-key');
});

describe('Appointment Management', () => {
    describe('POST /api/appointments', () => {
        it('should create a new appointment', async () => {
            const appointmentDate = new Date();
            appointmentDate.setDate(appointmentDate.getDate() + 7);

            const res = await request(app)
                .post('/api/appointments')
                .set('Authorization', `Bearer ${patientToken}`)
                .send({
                    doctorId,
                    appointmentDate,
                    reason: 'Test appointment'
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('appointmentId');
            appointmentId = res.body.data.appointmentId;
        });

        it('should not create appointment with invalid data', async () => {
            const res = await request(app)
                .post('/api/appointments')
                .set('Authorization', `Bearer ${patientToken}`)
                .send({
                    doctorId
                    // Missing required fields
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe('GET /api/appointments', () => {
        it('should get doctor appointments', async () => {
            const res = await request(app)
                .get('/api/appointments')
                .set('Authorization', `Bearer ${doctorToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('should get patient appointments', async () => {
            const res = await request(app)
                .get('/api/appointments')
                .set('Authorization', `Bearer ${patientToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    describe('GET /api/appointments/upcoming', () => {
        it('should get upcoming appointments', async () => {
            const res = await request(app)
                .get('/api/appointments/upcoming')
                .set('Authorization', `Bearer ${patientToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    describe('GET /api/appointments/doctor/:doctorId/availability', () => {
        it('should get doctor availability', async () => {
            const date = new Date().toISOString().split('T')[0];
            const res = await request(app)
                .get(`/api/appointments/doctor/${doctorId}/availability`)
                .set('Authorization', `Bearer ${patientToken}`)
                .query({ date });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    describe('PATCH /api/appointments/:appointmentId/status', () => {
        it('should update appointment status', async () => {
            const res = await request(app)
                .patch(`/api/appointments/${appointmentId}/status`)
                .set('Authorization', `Bearer ${doctorToken}`)
                .send({
                    status: 'confirmed'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.status).toBe('confirmed');
        });

        it('should not allow unauthorized status update', async () => {
            const res = await request(app)
                .patch(`/api/appointments/${appointmentId}/status`)
                .set('Authorization', `Bearer ${patientToken}`)
                .send({
                    status: 'completed'
                });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });
    });
});

afterAll(async () => {
    // Clean up test data
    await MySQL.query('DELETE FROM appointments WHERE doctor_id = ? OR patient_id = ?', [doctorId, patientId]);
    await MySQL.query('DELETE FROM users WHERE user_id IN (?, ?)', [doctorId, patientId]);
});
