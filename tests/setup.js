const { MySQL, Mongo } = require('../models');

beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';
    
    // Connect to test databases
    await MySQL.connect({
        host: process.env.TEST_MYSQL_HOST || 'localhost',
        user: process.env.TEST_MYSQL_USER || 'root',
        password: process.env.TEST_MYSQL_PASSWORD || '',
        database: process.env.TEST_MYSQL_DATABASE || 'eczema_test'
    });

    await Mongo.connect(process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/eczema_test');
});

afterAll(async () => {
    // Close database connections
    await MySQL.end();
    await Mongo.connection.close();
});

// Global test timeout
jest.setTimeout(10000);
