// ========================================
// Chat File Upload Middleware
// Handles images AND documents (PDF, DOC, ZIP)
// ========================================

const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        // Determine resource type based on mime type
        let resource_type = 'auto'; // Default to auto detection
        let folder = 'deskshare/chat';

        // If it's a raw file (doc, zip, etc), we might want to specify 'raw'
        // But Cloudinary 'auto' is usually smart enough.

        return {
            folder: folder,
            resource_type: resource_type,
            // Keep original filename for docs so downloads look nice
            use_filename: true,
            unique_filename: true
        };
    }
});

// Create multer upload middleware
const uploadChat = multer({
    storage: storage,
    limits: {
        fileSize: (process.env.MAX_CHAT_FILE_SIZE_MB || 10) * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
            'text/plain',
            'application/zip',
            'application/x-zip-compressed'
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: Images, PDF, DOC, TXT, ZIP'), false);
        }
    }
});

module.exports = uploadChat;
