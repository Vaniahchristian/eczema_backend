require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const helmet = require('helmet');
const path = require('path');
const cookieParser = require('cookie-parser');
const WebSocketServer = require('./websocket');
const { mysqlPool, connectMongoDB, sequelize } = require('./config/database');
const { MySQL } = require('./models');

// Import routes
const authRoutes = require('./routes/auth');
const eczemaRoutes = require('./routes/eczema');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const analyticsRoutes = require('./routes/analytics');
const researchRoutes = require('./routes/research');
const messageRoutes = require('./routes/messages');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Connect to MongoDB
connectMongoDB();

// Test MySQL connection and sync models
(async () => {
  try {
    // Test MySQL connection
    await sequelize.authenticate();
    console.log('MySQL connected successfully');

    // In production, only alter tables, never force
    if (process.env.NODE_ENV === 'production') {
      console.log('Production environment detected, altering tables...');
      await sequelize.sync({ alter: true });
    } else {
      // In development, we need to handle the force sync carefully
      console.log('Development environment detected, force syncing tables...');
      
      // Drop tables in correct order (respecting foreign key constraints)
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      // Drop and recreate tables in order
      await MySQL.Diagnosis.sync({ force: true });
      await MySQL.Patient.sync({ force: true });
      await MySQL.User.sync({ force: true });
      
      // Re-enable foreign key checks
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      
      // Create associations
      await sequelize.sync();
    }

    console.log('MySQL models synced successfully');

  } catch (error) {
    console.error('MySQL connection/sync error:', error);
    // Don't exit in production, just log the error
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
})();

// Initialize WebSocket server for real-time updates
const wsServer = new WebSocketServer(server);

// Custom request logger
app.use((req, res, next) => {
  console.log('📝 Incoming Request:', {
    method: req.method,
    path: req.path,
    origin: req.headers.origin,
    cookies: req.cookies,
    authorization: req.headers.authorization ? 'Present' : 'Not present'
  });
  next();
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
})); // Security headers with relaxed settings for development

// CORS configuration with detailed logging
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('🌐 CORS - Incoming origin:', origin);
  
  const allowedOrigins = [
    process.env.CLIENT_URL,
    'http://localhost:3000',
    'https://eczema-dashboard.vercel.app',
    'https://eczema-dashboard-git-main-vaniahchristian.vercel.app'
  ].filter(Boolean);

  console.log('🌐 CORS - Allowed origins:', allowedOrigins);

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    console.log(`🌐 CORS - Origin ${origin} is allowed`);
  } else {
    console.log(`🌐 CORS - Origin ${origin} is not in allowed list`);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    console.log('🌐 CORS - Handling OPTIONS preflight request');
    return res.sendStatus(200);
  }

  next();
});

app.use(morgan('dev')); // Logging
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Parse cookies

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/eczema', eczemaRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/messages', messageRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    mysql: sequelize.connectionManager.connections.length > 0,
    mongodb: mongoose.connection.readyState === 1,
    websocket: wsServer.wss.clients.size
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API base URL: http://localhost:${PORT}/api`);
});
