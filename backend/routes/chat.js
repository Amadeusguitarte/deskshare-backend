// ========================================
// Chat/Message Routes
// Real-time messaging between users
// ========================================

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const uploadChat = require('../middleware/uploadChat'); // Phase A: Import

const prisma = new PrismaClient();

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
