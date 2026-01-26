const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');
const net = require('net');

const APPDATA = process.env.APPDATA;
const LAUNCHER_DIR = path.join(APPDATA, 'deskshare-launcher');
const CONFIG_PATH = path.join(LAUNCHER_DIR, 'config.json');
// v12 writes to TEMP
const LOG_PATH = path.join(os.tmpdir(), 'deskshare_debug.log');

const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app';

async function diagnose() {
    console.log('=== DESKSHARE FULL DIAGNOSIS ===');

    // 1. CHECK CONFIG
    if (!fs.existsSync(CONFIG_PATH)) { console.error('FAIL: No Config'); return; }
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log(`[CONFIG] User: ${config.computerId}, Token: ${config.token ? 'YES' : 'NO'}`);

    // 2. CHECK LOCAL VNC PORT
    await checkPort(5900, 'TvnServer (VNC)');

    // 3. CHECK LOG TUNNEL URL
    let localTunnelUrl = null;
    if (fs.existsSync(LOG_PATH)) {
        const content = fs.readFileSync(LOG_PATH, 'utf8');
        const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
        if (matches && matches.length > 0) {
            localTunnelUrl = matches[matches.length - 1];
            console.log(`[LOGS] Latest Tunnel URL:   ${localTunnelUrl}`);
        } else {
            console.log(`[LOGS] No Tunnel URL found in ${LOG_PATH}`);
        }
    } else {
        console.log(`[LOGS] Log file not found at ${LOG_PATH}`);
    }

    // 4. CHECK BACKEND STATE
    try {
        const res = await axios.get(`${BACKEND_URL}/api/tunnels/${config.computerId}`);
        const backendUrl = res.data.tunnelUrl;
        console.log(`[BACKEND] Stored Tunnel URL:  ${backendUrl}`);

        if (localTunnelUrl && backendUrl !== localTunnelUrl) {
            console.error('❌ MISMATCH DETECTED! Backend has wrong URL.');
        } else if (localTunnelUrl) {
            console.log('✅ URL SYNCED OK.');
        }

    } catch (e) {
        console.error(`[BACKEND] API Error: ${e.message}`);
    }

    // 5. CHECK WEB TOKEN GENERATION (Simulate Frontend)
    /*
    try {
        const resBooking = await axios.get(`${BACKEND_URL}/api/bookings/17`, {
             headers: { 'Authorization': `Bearer ${config.token}` }
        });
        const bookingUrl = resBooking.data.booking?.computer?.tunnelUrl;
        console.log(`[BOOKING] Token Base URL:     ${bookingUrl}`);
    } catch (e) {
        console.error(`[BOOKING] Error: ${e.message}`);
    }
    */

    console.log('================================');
}

function checkPort(port, name) {
    return new Promise(resolve => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => {
            console.log(`[LOCAL] ${name} is LISTENING on port ${port}. ✅`);
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            console.error(`[LOCAL] ${name} TIMEOUT on port ${port}. ❌ (Firewall or Hung?)`);
            socket.destroy();
            resolve(false);
        });
        socket.on('error', (err) => {
            console.error(`[LOCAL] ${name} ERROR on port ${port}: ${err.message} ❌`);
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

diagnose();
