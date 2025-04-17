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
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

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

// Serve uploaded files with size limit
const uploadPath = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadPath, {
  maxAge: '1d',
  limit: '50mb'
}));

// Connect to MongoDB with retry logic
const connectMongoDBWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await connectMongoDB();
      console.log('MongoDB connected successfully');
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${i + 1} failed:`, error);
      if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Failed to connect to MongoDB after retries');
  } else {
    process.exit(1);
  }
};

connectMongoDBWithRetry();

// Test MySQL connection and sync models
(async () => {
  try {
    // Test MySQL connection
    await sequelize.authenticate();
    console.log('MySQL connected successfully');

    // Sync strategy based on environment
    const syncOptions = {
      // In production, only alter tables, never force
      alter: process.env.NODE_ENV === 'production' ? true : false,
      // In development, use force only if explicitly set
      force: process.env.NODE_ENV !== 'production' && process.env.FORCE_SYNC === 'true'
    };

    if (syncOptions.force) {
      console.log('Force sync enabled, dropping and recreating tables...');
      // Drop tables in correct order
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      await sequelize.sync({ force: true });
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    } else if (syncOptions.alter) {
      console.log(`${process.env.NODE_ENV} environment detected, altering tables...`);
      await sequelize.sync({ alter: true });
    } else {
      console.log('Synchronizing tables without modifications...');
      await sequelize.sync();
    }

    console.log('MySQL models synced successfully');
  } catch (error) {
    console.error('MySQL connection/sync error:', error);
    // In development, exit on error
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
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || "https://eczema-dashboard-final.vercel.app"]
    }
  },
  crossOriginResourcePolicy: { policy: "same-site" }
}));

// CORS configuration with specific origin
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://eczema-dashboard-final.vercel.app",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Apply rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

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