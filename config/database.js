const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

// MySQL Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'eczema'
};

// MongoDB Configuration
const mongoConfig = {
  url: process.env.MONGODB_URI || 'mongodb://localhost:27017/eczema_nosql'
};

// Create MySQL connection pool
const mysqlPool = mysql.createPool(mysqlConfig);

// Connect to MongoDB
const connectMongoDB = async () => {
  try {
    await mongoose.connect(mongoConfig.url, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = {
  mysqlPool,
  connectMongoDB
};
