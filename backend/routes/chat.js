// ========================================
// Chat/Message Routes
// Real-time messaging between users
// ========================================

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const uploadChat = require('../middleware/uploadChat'); // Phase A: Import
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary explicitly to ensure utils.url has access to secrets for signing
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const prisma = new PrismaClient();

// ========================================
// GET /api/chat/document-proxy
// THE BRIDGE: Server-side proxy for viewing/downloading files.
// Bypasses browser-side signature issues by fetching content server-to-server.
// DEFINED AT TOP to avoid interception by dynamic routes like /:id
router.get('/document-proxy', auth, async (req, res) => {
    const { url, download } = req.query;
    if (!url) return res.status(400).send('Missing url');

    try {
        const parts = url.split('/upload/');
        if (parts.length < 2) throw new Error('Invalid Cloudinary URL');

        let pathPart = parts[1];

        // 1. EXTRACT VERSION (Critical for correct signature)
        // Cloudinary raw/private files REQUIRE the version to be part of the signature base string.
        let version = null;
        const versionMatch = pathPart.match(/^(v\d+)\//);
        if (versionMatch) {
            version = versionMatch[1]; // e.g. "v1767544466"
            // Remove version from pathPart for public_id extraction
            pathPart = pathPart.replace(/^v\d+\//, '');
        }

        // 2. Resolve Public ID
        const publicIdDecoded = decodeURIComponent(pathPart);
        const publicIdEncoded = pathPart;
        const isRaw = url.includes('/raw/');

        console.log(`Bridge: Resolving ${publicIdDecoded} (Ver: ${version})`);

        // Helper to generate and fetch
        const tryFetch = async (pid) => {
            const config = {
                resource_type: isRaw ? 'raw' : 'image',
                type: 'upload',
                sign_url: true,
                secure: true
            };
            // Explicitly pass version so sdk constructs the correct URL structure for signing
            if (version) config.version = version;

            const sUrl = cloudinary.utils.url(pid, config);
            return fetch(sUrl);
        };

        // Attempt 1: Standard (Decoded)
        let response = await tryFetch(publicIdDecoded);

        // Attempt 2: Fallback (Encoded) - if different and first failed
        if (!response.ok && publicIdDecoded !== publicIdEncoded) {
            console.warn(`Bridge Attempt 1 failed (${response.status}). Retrying with Raw Path...`);
            response = await tryFetch(publicIdEncoded);
        }

        if (!response.ok) {
            throw new Error(`Cloudinary Error: ${response.status} ${response.statusText}`);
        }

        // 3. Set Headers and Stream
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const disposition = download === 'true' ? 'attachment' : 'inline';

        let filename = publicIdDecoded.split('/').pop() || 'document';
        const safeFilename = filename.replace(/"/g, '');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);

        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));

    } catch (error) {
        console.error('Bridge Proxy Error:', error);
        res.status(500).send(`Error loading document via bridge: ${error.message} (Try: ${url})`);
    }
});

// ========================================
// GET /api/chat/conversations
// Get all conversations for current user
// ========================================
router.get('/conversations', auth, async (req, res, next) => {
    try {
        const userId = req.user.userId || req.user.id;

        // Get all messages where user is sender or receiver
        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId },
                    { receiverId: userId }
                ]
            },
            include: {
                sender: { select: { id: true, name: true, avatarUrl: true } },
                receiver: { select: { id: true, name: true, avatarUrl: true } },
                computer: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Group by conversation (computer or user pair)
        const conversations = {};
        messages.forEach(msg => {
            const key = msg.computerId ||
                (msg.senderId === userId ? msg.receiverId : msg.senderId);

            if (!conversations[key]) {
                conversations[key] = {
                    computerId: msg.computerId,
                    otherUser: msg.senderId === userId ? msg.receiver : msg.sender,
                    computer: msg.computer,
                    lastMessage: msg,
                    unreadCount: 0,
                    messages: []
                };
            }

            if (!msg.isRead && msg.receiverId === userId) {
                conversations[key].unreadCount++;
            }

            conversations[key].messages.push(msg);
        });

        res.json({ conversations: Object.values(conversations) });
    } catch (error) {
        next(error);
    }
});


// ========================================
// GET /api/chat/proxy-download
// Proxy file download to bypass CORS/Auth restrictions
// ========================================
router.get('/proxy-download', auth, async (req, res) => {
    const { url, name } = req.query;
    if (!url) return res.status(400).send('Missing url');

    // Security: Only allow Cloudinary URLs
    if (!url.includes('cloudinary.com')) {
        return res.status(403).send('Only Cloudinary URLs allowed');
    }

    try {
        // Extract Public ID
        const parts = url.split('/upload/');
        if (parts.length < 2) throw new Error('Invalid Cloudinary URL structure');

        let pathPart = parts[1];
        if (pathPart.match(/^v\d+\//)) {
            pathPart = pathPart.replace(/^v\d+\//, '');
        }

        // DECODE Public ID (Cloudinary expects "my file.pdf", not "my%20file.pdf" for signing)
        const publicId = decodeURIComponent(pathPart);
        const isRaw = url.includes('/raw/');

        // Sanitize Filename for 'attachment' header
        const safeName = (name || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');

        console.log('Proxy Signing:', { original: url, publicId, isRaw, safeName });

        // Generate Signed URL (Pure access, NO attachment flag needed for proxying)
        const signedUrl = cloudinary.utils.url(publicId, {
            resource_type: isRaw ? 'raw' : 'image',
            type: 'upload',
            sign_url: true,
            secure: true
        });

        console.log('Proxy Fetching Source:', signedUrl);

        // Fetch file server-side (Bypasses Browser/CORS/Cloudinary-Redirect limitations)
        const response = await fetch(signedUrl);
        if (!response.ok) throw new Error(`Cloudinary fetch failed: ${response.statusText}`);

        // Set Headers to force download
        const contentType = response.headers.get('content-type');
        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

        // Stream content to client
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));

    } catch (error) {
        console.error('Download Proxy Error:', error);
        res.status(500).send('Download linking failed');
    }
});

// ========================================
// GET /api/chat/sign-url
// Generates a signed URL for client-side usage (Viewer/Download)
// ========================================
router.get('/sign-url', auth, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        const parts = url.split('/upload/');
        if (parts.length < 2) throw new Error('Invalid Cloudinary URL');

        // Extract version and path
        let pathPart = parts[1];
        // Remove version prefix if present (e.g. v1761234/)
        pathPart = pathPart.replace(/^v\d+\//, '');

        // Decode to get the real public ID (including spaces)
        const publicId = decodeURIComponent(pathPart);
        const isRaw = url.includes('/raw/');

        // Generate Signed URL
        const signedUrl = cloudinary.utils.url(publicId, {
            resource_type: isRaw ? 'raw' : 'image',
            type: 'upload',
            sign_url: true,
            secure: true,
        });

        res.json({ signedUrl });

    } catch (error) {
        console.error('Sign URL Error:', error);
        res.status(500).json({ error: 'Failed to sign URL' });
    }
});

// ========================================
// GET /api/chat/:computerId
// Get messages for a specific computer
// ========================================
router.get('/:computerId', auth, async (req, res, next) => {
    try {
        const computerId = parseInt(req.params.computerId);
        const userId = req.user.userId || req.user.id;

        const messages = await prisma.message.findMany({
            where: {
                computerId,
                OR: [
                    { senderId: userId },
                    { receiverId: userId }
                ]
            },
            include: {
                sender: { select: { id: true, name: true, avatarUrl: true } },
                receiver: { select: { id: true, name: true, avatarUrl: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Mark as read
        await prisma.message.updateMany({
            where: {
                computerId,
                receiverId: userId,
                isRead: false
            },
            data: { isRead: true }
        });

        res.json({ messages });
    } catch (error) {
        next(error);
    }

});

// ========================================
// GET /api/chat/history/:userId
// Get messages between current user and another user (any context)
// ========================================
router.get('/history/:userId', auth, async (req, res, next) => {
    try {
        const partnerId = parseInt(req.params.userId);
        const userId = req.user.userId || req.user.id;

        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: partnerId },
                    { senderId: partnerId, receiverId: userId }
                ]
            },
            include: {
                sender: { select: { id: true, name: true, avatarUrl: true } },
                receiver: { select: { id: true, name: true, avatarUrl: true } },
                computer: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Mark as read
        await prisma.message.updateMany({
            where: {
                senderId: partnerId,
                receiverId: userId,
                isRead: false
            },
            data: { isRead: true }
        });

        res.json({ messages });
    } catch (error) {
        next(error);
    }
});


// Upload endpoint (Phase A)
router.post('/upload', auth, uploadChat.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({
        fileUrl: req.file.path,
        fileType: req.file.mimetype.startsWith('image/') ? 'image' : 'document'
    });
});

// ========================================
// POST /api/chat
// Send a new message
// ========================================
router.post('/', auth, async (req, res, next) => {
    try {
        const { receiverId, computerId, message, fileUrl, fileType } = req.body;

        // Allow empty message IF there is a file
        if ((!message || !message.trim()) && !fileUrl) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        const newMessage = await prisma.message.create({
            data: {
                senderId: req.user.userId || req.user.id,
                receiverId: parseInt(receiverId),
                computerId: computerId ? parseInt(computerId) : null,
                message: message ? message.trim() : '',
                fileUrl: fileUrl || null,
                fileType: fileType || null
            },
            include: {
                sender: { select: { id: true, name: true, avatarUrl: true } },
                receiver: { select: { id: true, name: true, avatarUrl: true } }
            }
        });

        // Emit socket event (if io is available)
        const io = req.app.get('io');
        if (io) {
            // 1. Emit to specific computer room (for Detail Page)
            if (computerId) {
                io.to(`computer-${computerId}`).emit('new-message', newMessage);
            }

            // 2. Emit to user-specific room (for Global Widget)
            io.to(`user-${receiverId}`).emit('private-message', newMessage);
            io.to(`user-${req.user.userId || req.user.id}`).emit('private-message', newMessage); // Also to sender
        }

        res.status(201).json({ message: newMessage });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
