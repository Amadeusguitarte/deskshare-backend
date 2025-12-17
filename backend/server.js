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
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
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

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// ========================================
// Socket.io for Real-time Chat
// ========================================

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join room for specific computer
    socket.on('join-computer-room', (computerId) => {
        socket.join(`computer-${computerId}`);
        console.log(`Socket ${socket.id} joined room computer-${computerId}`);
    });

    // Join my private user room (for global chat)
    socket.on('join-user-room', (userId) => {
        socket.join(`user-${userId}`);
        console.log(`Socket ${socket.id} joined user room user-${userId}`);
    });

    // Send message
    socket.on('send-message', (data) => {
        io.to(`computer-${data.computerId}`).emit('new-message', data);
    });

    // User typing indicator
    socket.on('typing', (data) => {
        socket.to(`computer-${data.computerId}`).emit('user-typing', {
            userId: data.userId,
            isTyping: data.isTyping
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
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
