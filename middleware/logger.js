const winston = require('winston');
const morgan = require('morgan');

// Configure winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      let logMessage = `${timestamp} ${level}: ${message}`;
      if (Object.keys(metadata).length > 0) {
        logMessage += `\nMetadata: ${JSON.stringify(metadata, null, 2)}`;
      }
      return logMessage;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Custom morgan token for request body
morgan.token('request-body', (req) => {
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    // Remove sensitive fields
    if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
    if (sanitizedBody.token) sanitizedBody.token = '[REDACTED]';
    return `\nRequest Body: ${JSON.stringify(sanitizedBody, null, 2)}`;
  }
  return '';
});

// Custom morgan token for response body
morgan.token('response-body', (req, res) => {
  if (res._body) {
    return `\nResponse Body: ${JSON.stringify(res._body, null, 2)}`;
  }
  return '';
});

// Middleware to capture response body
const captureResponseBody = (req, res, next) => {
  const oldSend = res.send;
  res.send = function (data) {
    res._body = data;
    return oldSend.apply(res, arguments);
  };
  next();
};

// Custom morgan format with request and response bodies
const morganFormat = ':method :url :status :response-time ms :request-body :response-body';

// Request logging middleware
const requestLogger = morgan(morganFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
});

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    headers: req.headers,
    userId: req.user ? req.user.id : null
  });
  next(err);
};

// Function to log service operations with metadata
const logOperation = (operation, details, metadata = {}) => {
  logger.info(`Operation: ${operation}`, { ...details, ...metadata });
};

module.exports = {
  logger,
  requestLogger,
  errorLogger,
  captureResponseBody,
  logOperation
};
