const multer = require('multer');
const crypto = require('crypto');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
        return cb(new Error('Only JPG, JPEG, and PNG image files are allowed!'), false);
    }
    
    // Check file size before storage (max 5MB)
    if (parseInt(req.headers['content-length']) > 5 * 1024 * 1024) {
        return cb(new Error('File size exceeds 5MB limit!'), false);
    }
    
    cb(null, true);
};

// Create multer instance with error handling
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB in bytes
        files: 1 // Maximum number of files
    }
});

// Error handling middleware
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size exceeds 5MB limit!'
            });
        }
        return res.status(400).json({
            success: false,
            message: 'File upload error',
            error: err.message
        });
    }
    
    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    next();
};

module.exports = {
    upload,
    handleUploadError
};
