const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const { Sequelize } = require('sequelize');

// Determine environment
const isTest = process.env.NODE_ENV === 'test';
const isDev = process.env.NODE_ENV === 'development';

// MySQL Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'eczema_dev'
};

// Create MySQL connection pool
const mysqlPool = mysql.createPool(mysqlConfig);

// Create Sequelize instance
const sequelize = new Sequelize(
  mysqlConfig.database,
  mysqlConfig.user,
  mysqlConfig.password,
  {
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    dialect: 'mysql',
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      // Enable SSL only for production (Railway)
      ssl: !isDev ? {
        rejectUnauthorized: false
      } : false,
      connectTimeout: 60000,
      // Fix for datetime issues
      dateStrings: true,
      typeCast: function (field, next) {
        if (field.type === 'DATETIME') {
          return field.string();
        }
        return next();
      }
    },
    define: {
      // Add default timestamp handling
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    logging: isDev ? console.log : false
  }
);

// MongoDB Configuration
const mongoConfig = {
  url: process.env.MONGODB_URI || 'mongodb://localhost:27017/eczema_dev'
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

module.exports = {
  connectMongoDB,
  mysqlPool,
  sequelize,
  isDev
};
