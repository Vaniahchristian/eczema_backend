const request = require('supertest');
const app = require('../app');
const { MySQL, Mongo } = require('../models');
const { User } = MySQL;
const { Diagnosis } = Mongo;
const jwt = require('jsonwebtoken');

let doctorToken;
let doctorId;

beforeAll(async () => {
    // Create test doctor
    doctorId = await User.create({
        email: 'test.analytics.doctor@example.com',
        password_hash: 'hashedpassword123',
        first_name: 'Analytics',
        last_name: 'Doctor',
        role: 'doctor',
        date_of_birth: '1980-01-01',
        gender: 'male'
    });

    // Generate token
    doctorToken = jwt.sign({ id: doctorId }, process.env.JWT_SECRET || 'your-secret-key');

    // Create test diagnoses
    const patients = await createTestPatients();
    await createTestDiagnoses(patients);
});

async function createTestPatients() {
    const patients = [];
    const ages = [25, 35, 45, 55];
    const locations = ['New York', 'Los Angeles', 'Chicago', 'Miami'];

    for (let i = 0; i < 4; i++) {
        const birthDate = new Date();
        birthDate.setFullYear(birthDate.getFullYear() - ages[i]);

        const patientId = await User.create({
            email: `test.patient${i}@example.com`,
            password_hash: 'hashedpassword123',
            first_name: `Patient`,
            last_name: `${i}`,
            role: 'patient',
            date_of_birth: birthDate.toISOString().split('T')[0],
            gender: i % 2 === 0 ? 'male' : 'female',
            address: locations[i]
        });

        patients.push(patientId);
    }

    return patients;
}

async function createTestDiagnoses(patients) {
    const severityLevels = ['mild', 'moderate', 'severe'];
    const treatmentTypes = ['topical_steroids', 'moisturizers', 'immunosuppressants'];
    const outcomes = ['improved', 'unchanged', 'worsened'];

    for (const patientId of patients) {
        for (let i = 0; i < 3; i++) {
            const diagnosisDate = new Date();
            diagnosisDate.setDate(diagnosisDate.getDate() - (i * 7));

            await Diagnosis.create({
                patient_id: patientId,
                doctor_id: doctorId,
                created_at: diagnosisDate,
                severity: severityLevels[i % 3],
                confidence: 0.7 + (i * 0.1),
                treatment: {
                    type: treatmentTypes[i % 3],
                    outcome: outcomes[i % 3]
                }
            });
        }
    }
}

describe('Analytics', () => {
    describe('GET /api/analytics/age-distribution', () => {
        it('should get age distribution of cases', async () => {
            const res = await request(app)
                .get('/api/analytics/age-distribution')
                .set('Authorization', `Bearer ${doctorToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('ageGroups');
            expect(Array.isArray(res.body.data.ageGroups)).toBe(true);
        });
    });

    describe('GET /api/analytics/geographical-distribution', () => {
        it('should get geographical distribution', async () => {
            const res = await request(app)
                .get('/api/analytics/geographical-distribution')
                .set('Authorization', `Bearer ${doctorToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('regions');
            expect(Array.isArray(res.body.data.regions)).toBe(true);
        });
    });

    describe('GET /api/analytics/treatment-effectiveness', () => {
        it('should get treatment effectiveness statistics', async () => {
            const res = await request(app)
                .get('/api/analytics/treatment-effectiveness')
                .set('Authorization', `Bearer ${doctorToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('treatments');
            expect(Array.isArray(res.body.data.treatments)).toBe(true);
            expect(res.body.data.treatments[0]).toHaveProperty('effectiveness');
        });
    });

    describe('GET /api/analytics/model-confidence', () => {
        it('should get model confidence distribution', async () => {
            const res = await request(app)
                .get('/api/analytics/model-confidence')
                .set('Authorization', `Bearer ${doctorToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('confidenceLevels');
            expect(Array.isArray(res.body.data.confidenceLevels)).toBe(true);
        });
    });

    describe('GET /api/analytics/diagnosis-history', () => {
        it('should get diagnosis history with trends', async () => {
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 1);

            const res = await request(app)
                .get('/api/analytics/diagnosis-history')
                .set('Authorization', `Bearer ${doctorToken}`)
                .query({
                    startDate: startDate.toISOString(),
                    endDate: new Date().toISOString()
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('history');
            expect(Array.isArray(res.body.data.history)).toBe(true);
        });

        it('should handle invalid date range', async () => {
            const res = await request(app)
                .get('/api/analytics/diagnosis-history')
                .set('Authorization', `Bearer ${doctorToken}`)
                .query({
                    startDate: 'invalid-date',
                    endDate: 'invalid-date'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe('Authentication and Authorization', () => {
        it('should require authentication for analytics endpoints', async () => {
            const res = await request(app)
                .get('/api/analytics/age-distribution');

            expect(res.status).toBe(401);
        });

        it('should require doctor role for analytics endpoints', async () => {
            const patientToken = jwt.sign(
                { id: await User.create({
                    email: 'test.patient.auth@example.com',
                    password_hash: 'hashedpassword123',
                    role: 'patient'
                }) },
                process.env.JWT_SECRET || 'your-secret-key'
            );

            const res = await request(app)
                .get('/api/analytics/age-distribution')
                .set('Authorization', `Bearer ${patientToken}`);

            expect(res.status).toBe(403);
        });
    });
});

afterAll(async () => {
    // Clean up test data
    await Mongo.connection.dropDatabase();
    await MySQL.query('DELETE FROM users WHERE user_id = ?', [doctorId]);
    await MySQL.query('DELETE FROM users WHERE email LIKE ?', ['test.patient%']);
});
