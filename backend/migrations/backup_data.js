const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Reconstructed from User's Internal Creds + Public Host/Port
// User: postgres
// Pass: WjKSNLLkgdpTCzExTHdQEqOjrTDhPGfo
// Host: turntable.proxy.rlwy.net
// Port: 19199
// DB: railway
const OLD_DATABASE_URL = "postgresql://postgres:WjKSNLLkgdpTCzExTHdQEqOjrTDhPGfo@turntable.proxy.rlwy.net:19199/railway?sslmode=no-verify&connect_timeout=30";

// Initialize Prisma with the OLD URL explicitly
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: OLD_DATABASE_URL,
        },
    },
});

async function backup() {
    console.log('🚀 Starting Data Rescue Operation...');
    console.log('Target: Old Railway DB');

    try {
        // 1. Users
        console.log('📥 Backing up Users...');
        const users = await prisma.user.findMany();
        fs.writeFileSync(path.join(__dirname, 'backup_users.json'), JSON.stringify(users, null, 2));
        console.log(`✅ Saved ${users.length} users.`);

        // 2. Computers
        console.log('📥 Backing up Computers...');
        const computers = await prisma.computer.findMany();
        fs.writeFileSync(path.join(__dirname, 'backup_computers.json'), JSON.stringify(computers, null, 2));
        console.log(`✅ Saved ${computers.length} computers.`);

        // 3. Messages (Chats)
        console.log('📥 Backing up Messages/History...');
        const messages = await prisma.message.findMany();
        fs.writeFileSync(path.join(__dirname, 'backup_messages.json'), JSON.stringify(messages, null, 2));
        console.log(`✅ Saved ${messages.length} messages.`);

        console.log('\n🎉 BACKUP COMPLETE! Files saved locally.');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ CRITICAL BACKUP FAILURE ❌');
        console.error('Error Code:', error.code);
        console.error('Message:', error.message);
        if (error.meta) console.error('Meta:', JSON.stringify(error.meta, null, 2));
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

backup();
