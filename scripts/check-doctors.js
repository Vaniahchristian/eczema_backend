require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.MYSQL_HOST || 'turntable.proxy.rlwy.net',
    port: process.env.MYSQL_PORT || 47914,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'iloVnaEyMEYXFFknMevATgzYZpFCEobd',
    database: process.env.MYSQL_DATABASE || 'railway',
    ssl: {
        rejectUnauthorized: false
    }
};

async function checkDoctors() {
    const connection = await mysql.createConnection(dbConfig);

    try {
        console.log('Checking users table...');
        const [users] = await connection.query(`
            SELECT id, email, role, first_name, last_name 
            FROM users 
            WHERE role = 'doctor'
        `);
        console.log('Doctors in users table:', JSON.stringify(users, null, 2));

        console.log('\nChecking doctor_profiles table...');
        const [profiles] = await connection.query(`
            SELECT * 
            FROM doctor_profiles
        `);
        console.log('Doctor profiles:', JSON.stringify(profiles, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkDoctors();
