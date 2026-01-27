const { PrismaClient } = require('@prisma/client');

// Prevent multiple instances of Prisma Client in development
// and verify connection limits in production.
const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
    log: ['error', 'warn'], // Reduce log noise
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = prisma;
