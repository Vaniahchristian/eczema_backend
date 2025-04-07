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
const { mysqlPool, connectMongoDB } = require('./config/database');

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
app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
connectMongoDB();

// Test MySQL connection
(async () => {
  try {
    const connection = await mysqlPool.getConnection();
    console.log('MySQL connected successfully');
    connection.release();
  } catch (error) {
    console.error('MySQL connection error:', error);
    process.exit(1);
  }
})();

// Initialize WebSocket server for real-time updates
const wsServer = new WebSocketServer(server);

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev')); // Logging
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Parse cookies

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    mysql: mysqlPool.pool.pool.state === 'authenticated',
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
