const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const c12 = await prisma.computer.findUnique({ where: { id: 12 } });
        console.log('COMP 12 OWNER ID:', c12 ? c12.userId : 'NOT FOUND');

        const c9 = await prisma.computer.findUnique({ where: { id: 9 } });
        console.log('COMP 9 OWNER ID:', c9 ? c9.userId : 'NOT FOUND');

        const u1 = await prisma.user.findUnique({ where: { id: 1 } });
        console.log('USER 1:', u1 ? u1.email : 'NOT FOUND');

        const u8 = await prisma.user.findUnique({ where: { id: 8 } });
        console.log('USER 8:', u8 ? u8.email : 'NOT FOUND');

    } catch (e) { console.error(e); }
    finally { await prisma.$disconnect(); }
}
check();
