const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

async function countMessages() {
    try {
        const count = await prisma.message.count();
        console.log(`Total Messages in DB: ${count}`);

        const lastMsg = await prisma.message.findFirst({
            orderBy: { createdAt: 'desc' },
            include: { sender: true }
        });

        if (lastMsg) {
            console.log(`Last Message: "${lastMsg.message}" from ${lastMsg.sender?.email} at ${lastMsg.createdAt}`);
        } else {
            console.log("No messages found.");
        }
    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

countMessages();
