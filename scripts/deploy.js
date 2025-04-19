require('dotenv').config();
const { sequelize } = require('../config/database');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function deployDatabase() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Database connection successful.');

        // Run migrations instead of force sync
        console.log('Running migrations...');
        await execPromise('npx sequelize-cli db:migrate');
        console.log('Migrations completed successfully.');

        // Seed data if in development
        if (process.env.NODE_ENV === 'development') {
            console.log('Running seeders...');
            await execPromise('npx sequelize-cli db:seed:all');
            console.log('Seeders completed successfully.');
        }

    } catch (error) {
        console.error('Deployment error:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('Database connection closed.');
    }
}

// Only run deployment if this script is run directly
if (require.main === module) {
    deployDatabase();
}

module.exports = deployDatabase;
