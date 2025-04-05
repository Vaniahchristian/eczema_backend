const request = require('supertest');
const app = require('../server');

// Test data
const testData = {
    patient: {
        id: "patient123",
        email: "patient@test.com",
        password: "testpass123",
        role: "patient"
    },
    doctor: {
        id: "doctor456",
        email: "doctor@test.com",
        password: "testpass456",
        role: "doctor"
    },
    message: {
        content: "Hello doctor, I have a question about my treatment.",
        type: "text"
    }
};

// Test sequence
describe('Messaging System Tests', () => {
    let patientToken;
    let doctorToken;
    let conversationId;
    let messageId;

    // Login tests
    test('Patient should be able to login', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testData.patient.email,
                password: testData.patient.password
            });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        patientToken = res.body.token;
    });

    test('Doctor should be able to login', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testData.doctor.email,
                password: testData.doctor.password
            });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        doctorToken = res.body.token;
    });

    // Conversation tests
    test('Patient should be able to create a conversation with doctor', async () => {
        const res = await request(app)
            .post('/api/messages/conversations')
            .set('Authorization', `Bearer ${patientToken}`)
            .send({
                participantId: testData.doctor.id
            });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
        conversationId = res.body.data.id;
    });

    // Message tests
    test('Patient should be able to send a message', async () => {
        const res = await request(app)
            .post(`/api/messages/conversations/${conversationId}/messages`)
            .set('Authorization', `Bearer ${patientToken}`)
            .send(testData.message);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
        messageId = res.body.data.id;
    });

    test('Doctor should be able to see the conversation', async () => {
        const res = await request(app)
            .get('/api/messages/conversations')
            .set('Authorization', `Bearer ${doctorToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeInstanceOf(Array);
        expect(res.body.data.some(conv => conv.id === conversationId)).toBe(true);
    });

    test('Doctor should be able to see messages in conversation', async () => {
        const res = await request(app)
            .get(`/api/messages/conversations/${conversationId}/messages`)
            .set('Authorization', `Bearer ${doctorToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeInstanceOf(Array);
        expect(res.body.data.some(msg => msg.id === messageId)).toBe(true);
    });

    test('Doctor should be able to reply to the message', async () => {
        const reply = {
            content: "I'll check your treatment records and get back to you.",
            type: "text"
        };
        const res = await request(app)
            .post(`/api/messages/conversations/${conversationId}/messages`)
            .set('Authorization', `Bearer ${doctorToken}`)
            .send(reply);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
    });

    test('Patient should be able to see the doctor\'s reply', async () => {
        const res = await request(app)
            .get(`/api/messages/conversations/${conversationId}/messages`)
            .set('Authorization', `Bearer ${patientToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeInstanceOf(Array);
        expect(res.body.data.length).toBeGreaterThan(1); // Should have both messages
    });
});
