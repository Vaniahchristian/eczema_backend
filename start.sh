#!/bin/bash

# Set environment to production
export NODE_ENV=production

# Run deployment script (includes migrations)
echo "Running deployment script..."
node scripts/deploy.js

# Start the application
echo "Starting the application..."
node server.js
