const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const booking = await prisma.booking.findUnique({
            where: { id: 21 },
            include: { computer: true }
        });
        console.log('--- BOOKING 21 ---');
        console.log(JSON.stringify(booking, null, 2));

        const allComp = await prisma.computer.findMany({
            select: { id: true, name: true }
        });
        console.log('--- ALL COMPUTERS ---');
        console.log(JSON.stringify(allComp, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
