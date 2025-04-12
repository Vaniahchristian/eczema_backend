const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const { Sequelize } = require('sequelize');
const mysql2 = require('mysql2');

// Determine environment
const isTest = process.env.NODE_ENV === 'test';

// MySQL Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
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
    dialect: 'mysql',
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: console.log
  }
);

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
  sequelize,
  connectMongoDB,
  initializeDatabases,
  mysqlConfig
};
