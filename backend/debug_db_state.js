const fs = require('fs');
const path = require('path');
const axios = require('axios');

const APPDATA = process.env.APPDATA;
const LAUNCHER_DIR = path.join(APPDATA, 'deskshare-launcher');
const CONFIG_PATH = path.join(LAUNCHER_DIR, 'config.json');

const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app';

async function check() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            console.error('Config not found at ' + CONFIG_PATH);
            return;
        }
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const computerId = config.computerId;
        const token = config.token;

        console.log(`Checking Tunnel State for Computer ${computerId}...`);
        const resStats = await axios.get(`${BACKEND_URL}/api/tunnels/${computerId}`);
        console.log('Tunnel API URL:', resStats.data.tunnelUrl);

        console.log(`Checking Booking 17 View...`);
        try {
            const resBooking = await axios.get(`${BACKEND_URL}/api/bookings/17`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('Booking API Computer Tunnel URL:', resBooking.data.booking.computer.tunnelUrl);
        } catch (e) {
            console.error('Booking API Error:', e.response?.data || e.message);
        }

        console.log('--- BACKEND STATE ---');
        console.log('Tunnel URL:', resStats.data.tunnelUrl);
        console.log('Status:', resStats.data.tunnelStatus);
        console.log('Last Updated:', resStats.data.tunnelUpdatedAt);
        console.log('---------------------');

    } catch (e) {
        console.error('API Error:', e.response?.data || e.message);
    }
}

check();
