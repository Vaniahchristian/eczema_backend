require('dotenv').config();
const { MySQL } = require('../models');

async function checkDb() {
  try {
    console.log('Checking users table...');
    const users = await MySQL.User.findAll({
      include: [{
        model: MySQL.Patient,
        as: 'patient'
      }]
    });
    

    console.log('\nUsers found:', users.length);
    users.forEach(user => {
      console.log('\nUser:', {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        patient: user.patient ? {
          id: user.patient.id,
          date_of_birth: user.patient.date_of_birth,
          gender: user.patient.gender
        } : null
      });
    });
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    process.exit();
  }
}

checkDb();
