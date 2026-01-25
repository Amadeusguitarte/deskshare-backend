const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

async function checkLatestComputer() {
    const computer = await prisma.computer.findFirst({
        orderBy: { updatedAt: 'desc' },
        include: { user: true }
    });

    if (!computer) {
        console.log("No computers found.");
    } else {
        console.log("Latest Computer:");
        console.log(`ID: ${computer.id}`);
        console.log(`Name: ${computer.name}`);
        console.log(`Tunnel Status: ${computer.tunnelStatus}`);
        console.log(`Access Method: ${computer.accessMethod}`); // VNC or RDP?
        console.log(`Pass (stored): ${computer.accessPassword}`);
        console.log(`Updated At: ${computer.updatedAt}`);
        console.log(`Tunnel URL: ${computer.tunnelUrl}`);
        console.log(`VNC Port: ${computer.vncPort} | RDP Port: ${computer.rdpPort}`);
    }
}

checkLatestComputer()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
