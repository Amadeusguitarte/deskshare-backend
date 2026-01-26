const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APPDATA = process.env.APPDATA;
const CONFIG_PATH = path.join(APPDATA, 'deskshare-launcher', 'config.json');

async function check() {
    // Read Token
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log('Using Token for User:', config.computerId);

    try {
        // We might not have permission to view connection details as the 'Computer', 
        // but we can check the public/computer status or try to act as the client.
        // Actually, let's just check the Computer #9 state directly first, that's public-ish or we have access.

        const resComp = await axios.get(`https://deskshare-backend-production.up.railway.app/api/tunnels/${config.computerId}`);
        console.log('CURRENT LIVE TUNNEL (DB):', resComp.data.tunnelUrl);

        console.log('------------------------------------------------');
        console.log('CRITICAL: The user is seeing "binding-hit..." in their screenshot.');
        console.log('If the DB says "legislative...", then the Booking 18 is STALE.');

    } catch (e) {
        console.error(e.message);
    }
}
check();
