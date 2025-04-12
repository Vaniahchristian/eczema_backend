const jwt = require('jsonwebtoken');
const { MySQL } = require('../models');
const { User } = MySQL;

exports.protect = async (req, res, next) => {
  try {
    let token;

    console.log(' Auth Middleware - Headers:', {
      authorization: req.headers.authorization,
      cookies: req.cookies,
      origin: req.headers.origin,
      referer: req.headers.referer,
    });

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log(' Token found in Authorization header');
    }
    // Check for token in cookies
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
      console.log(' Token found in cookies');
    }

    if (!token) {
      console.log(' No token found');
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      console.log(' Verifying token...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      console.log(' Token verified:', { userId: decoded.id });

      const user = await User.findById(decoded.id);
      
      if (!user) {
        console.log(' User not found:', decoded.id);
        return res.status(401).json({
          success: false,
          message: 'User no longer exists'
        });
      }

      console.log(' User found:', { 
        id: user.id,
        email: user.email,
        role: user.role
      });

      // Set user info in request using correct field names from database
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name
      };
      
      next();
    } catch (err) {
      console.error(' Token verification failed:', err.message);
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    console.error(' Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    console.log(' Checking role authorization:', {
      userRole: req.user.role,
      requiredRoles: roles,
      path: req.path
    });

    if (!roles.includes(req.user.role)) {
      console.log(' Role authorization failed');
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    console.log(' Role authorization successful');
    next();
  };
};
