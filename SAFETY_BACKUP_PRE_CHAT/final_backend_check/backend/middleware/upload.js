// ========================================
// File Upload Middleware
// Handles image uploads to Cloudinary
// ========================================

const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'deskshare',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1200, height: 800, crop: 'limit' }]
    }
});

// Create multer upload middleware
const upload = multer({
    storage: storage,
    limits: {
        fileSize: (process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024, // MB to bytes
        files: process.env.MAX_FILES_PER_UPLOAD || 5
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (!file.mimetype.startsWith('image/')) {
            cb(new Error('Only image files are allowed'), false);
            return;
        }
        cb(null, true);
    }
});

module.exports = upload;
