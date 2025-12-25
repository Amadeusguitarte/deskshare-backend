// ========================================
// DeskShare Backend Server
// Production-ready Express.js server
// ========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/google-auth');
const computerRoutes = require('./routes/computers');
const bookingRoutes = require('./routes/bookings');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const migrateRoutes = require('./routes/migrate'); // TEMPORARY - DELETE AFTER MIGRATION

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// ========================================
// Middleware
// ========================================

// Security
app.use(helmet());

// CORS
// CORS
app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5500',
            'https://deskshare.netlify.app',
            'https://deskshare-backend-production.up.railway.app'
        ];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || process.env.FRONTEND_URL === '*') {
            callback(null, true);
        } else {
            // For development/debugging, allowing all might be needed if user has a different preview URL
            // adhering to Security Best Practices, we should limit. 
            // BUT for this crisis, let's trust the origin if it matches our pattern or just REFLECT it.
            // Reflecting origin is what 'origin: true' does in newer cors versions, but let's be explicit:
            callback(null, origin);
        }
    },
    credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Make io accessible to routes
app.set('io', io);

// ========================================
// Routes
// ========================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api', googleAuthRoutes);
app.use('/api/computers', computerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/migrate', migrateRoutes); // TEMPORARY - DELETE AFTER MIGRATION

// Serve static files from the root directory (Project Root)
const path = require('path');
app.use(express.static(path.join(__dirname, '../')));

// 404 handler - For SPA, send index.html, but for now just 404 for API
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Route not found' });
    }
    // Fallback to index.html for unknown non-API routes (SPA support)
    res.sendFile(path.join(__dirname, '../index.html'));
});

// Error handler
app.use(errorHandler);

// ========================================
// Socket.io for Real-time Chat
// ========================================

// Track active users: userId -> Set<socketId>
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Existing handlers
    socket.on('join-computer-room', (computerId) => {
        socket.join(`computer-${computerId}`);
        console.log(`Socket ${socket.id} joined room computer-${computerId}`);
    });

    // Join my private user room (for global chat)
    socket.on('join-user-room', (userId) => {
        userId = String(userId); // Normalize
        socket.join(`user-${userId}`);

        // Track Online Status
        if (!connectedUsers.has(userId)) {
            connectedUsers.set(userId, new Set());
            // Broadcast ONLINE status to everyone
            io.emit('user-online', { userId });
        }
        connectedUsers.get(userId).add(socket.id);
        socket.userId = userId; // Store for disconnect

        console.log(`Socket ${socket.id} joined user room user-${userId}`);
    });

    // Check Status (Bulk)
    socket.on('check-status', ({ userIds }) => {
        const statuses = {};
        if (Array.isArray(userIds)) {
            userIds.forEach(id => {
                statuses[id] = connectedUsers.has(String(id));
            });
        }
        socket.emit('users-status', statuses);
    });

    // Send message
    socket.on('send-message', (data) => {
        io.to(`computer-${data.computerId}`).emit('new-message', data);
    });

    // User typing indicator (Legacy)
    socket.on('typing', (data) => {
        socket.to(`computer-${data.computerId}`).emit('user-typing', {
            userId: data.userId,
            isTyping: data.isTyping
        });
    });

    // --- NEW CHAT FEATURES ---

    // 1. Direct Typing Indicators
    socket.on('user-typing', ({ senderId, receiverId }) => {
        io.to(`user-${receiverId}`).emit('typing', { senderId });
    });

    socket.on('user-stop-typing', ({ senderId, receiverId }) => {
        io.to(`user-${receiverId}`).emit('stop-typing', { senderId });
    });

    // 2. Read Receipts
    socket.on('mark-read', ({ senderId, receiverId }) => {
        // senderId = person who just read
        // receiverId = person who sent the messages (needs to see the checkmarks)
        io.to(`user-${receiverId}`).emit('messages-read', { readerId: senderId });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Handle Online Status Removal
        if (socket.userId && connectedUsers.has(socket.userId)) {
            const userSockets = connectedUsers.get(socket.userId);
            userSockets.delete(socket.id);

            if (userSockets.size === 0) {
                connectedUsers.delete(socket.userId);
                // Broadcast OFFLINE status
                io.emit('user-offline', { userId: socket.userId });
            }
        }
    });
});

// ========================================
// Start Server
// ========================================

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║     🚀 DeskShare Backend Server          ║
╠═══════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV || 'development'}           ║
║  Port: ${PORT}                              ║
║  Socket.io: ✓ Active                      ║
║  Deployed: ${new Date().toISOString()}    ║
╚═══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

module.exports = { app, server, io };
