const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

// Determine environment
const isTest = process.env.NODE_ENV === 'test';

// MySQL Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'eczema', // Always use eczema database
  multipleStatements: true // Allow multiple statements in one query
};

// MongoDB Configuration
const mongoConfig = {
  url: process.env.MONGODB_URI || 'mongodb+srv://admin:0754092850@todoapp.aqby3.mongodb.net/TRY'
};

// Create MySQL connection pool
const mysqlPool = mysql.createPool(mysqlConfig);

// Test MySQL connection and ensure database exists
const testMySQLConnection = async () => {
  try {
    // Create database if it doesn't exist
    const tempPool = mysql.createPool({
      ...mysqlConfig,
      database: null
    });
    await tempPool.query('CREATE DATABASE IF NOT EXISTS eczema');
    await tempPool.end();

    // Test connection with main pool
    await mysqlPool.query('SELECT 1');
    console.log('MySQL connected successfully');
  } catch (error) {
    console.error('MySQL connection error:', error);
    process.exit(1);
  }
};

// Connect to MongoDB
const connectMongoDB = async () => {
  try {
    await mongoose.connect(mongoConfig.url);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize databases
const initializeDatabases = async () => {
  await testMySQLConnection();
  await connectMongoDB();
};

module.exports = {
  mysqlPool,
  connectMongoDB,
  initializeDatabases,
  testMySQLConnection
};
