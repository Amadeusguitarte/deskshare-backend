const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure storage specifically for chat files
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: (req, file) => {
        // Determine resource type based on mimetype
        // 'auto' lets Cloudinary decide (good for pdfs vs images)
        // But for strict control:
        let resourceType = 'raw'; // Default for docs/zips
        if (file.mimetype.startsWith('image/')) {
            resourceType = 'image';
        }

        return {
            folder: 'deskshare-chat',
            resource_type: resourceType,
            // Keep original name for download
            public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
            format: async (req, file) => {
                // Keep original extension for non-images
                // Cloudinary handles images automatically usually
                return undefined;
            },
        };
    },
});

// File Filter (Max 10MB, allowed types)
const fileFilter = (req, file, cb) => {
    // Allowed: Images, PDF, DOC, DOCX, TXT, ZIP
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/zip',
        'application/x-zip-compressed'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, PDF, Word, TXT, and ZIP are allowed.'), false);
    }
};

const uploadChat = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: fileFilter
});

module.exports = uploadChat;
