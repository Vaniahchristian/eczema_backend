const mysql = require('mysql2');
const mongoose = require('mongoose');
const { Sequelize } = require('sequelize');

// Determine environment
const isTest = process.env.NODE_ENV === 'test';

// MySQL Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT, 10),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
};

// Create MySQL connection pool
const mysqlPool = mysql.createPool(mysqlConfig);

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.MYSQL_DATABASE,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASSWORD,
  {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT, 10),
    dialect: 'mysql',
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      connectTimeout: 60000, // 60 seconds
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false
    },
    logging: console.log
  }
);

// MongoDB Configuration
const mongoConfig = {
  url: process.env.MONGODB_URI || 'mongodb+srv://admin:0754092850@todoapp.aqby3.mongodb.net/TRY'
};

// Connect to MongoDB
async function connectMongoDB() {
  try {
    await mongoose.connect(mongoConfig.url);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Test MySQL connection and ensure database exists
async function testMySQLConnection() {
  try {
    // Create database if it doesn't exist
    const tempPool = mysql.createPool({
      ...mysqlConfig,
      database: undefined // Temporarily remove database to create it
    });

    await tempPool.query('CREATE DATABASE IF NOT EXISTS eczema');
    await tempPool.end();

    // Test connection with main pool
    const connection = await mysqlPool.getConnection();
    console.log('MySQL connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL connection error:', error);
    return false;
  }
}

// Initialize databases
async function initializeDatabases() {
  await Promise.all([
    testMySQLConnection(),
    connectMongoDB()
  ]);
}

module.exports = {
  mysqlPool,
  sequelize,
  connectMongoDB,
  initializeDatabases,
  mysqlConfig
};
