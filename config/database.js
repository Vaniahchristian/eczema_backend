const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

// Determine environment
const isTest = process.env.NODE_ENV === 'test';

// MySQL Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'eczema', // Add database name back
  multipleStatements: true // Allow multiple statements in one query
};

// Create MySQL connection pool
const mysqlPool = mysql.createPool(mysqlConfig);

// MongoDB Configuration
const mongoConfig = {
  url: process.env.MONGODB_URI || 'mongodb+srv://admin:0754092850@todoapp.aqby3.mongodb.net/TRY'
};

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

// Connect to MongoDB
async function connectMongoDB() {
  try {
    await mongoose.connect(mongoConfig.url);
    console.log('MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error);
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
  connectMongoDB,
  initializeDatabases,
  mysqlConfig
};
