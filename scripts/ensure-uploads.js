const fs = require('fs').promises;
const path = require('path');

async function ensureUploadsDirectory() {
    const uploadsPath = path.join(process.cwd(), 'uploads', 'diagnoses');
    
    try {
        await fs.mkdir(uploadsPath, { recursive: true });
        console.log('Uploads directory structure created successfully');
    } catch (error) {
        console.error('Error creating uploads directory:', error);
        process.exit(1);
    }
}

ensureUploadsDirectory();
