const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');

const APPDATA = process.env.APPDATA;
const LAUNCHER_DIR = path.join(APPDATA, 'deskshare-launcher');
const CONFIG_PATH = path.join(LAUNCHER_DIR, 'config.json');
// UPDATED: Restored backup writes to TEMP
const LOG_PATH = path.join(os.tmpdir(), 'deskshare_debug.log');

const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app';

async function fix() {
    // 1. Read Config
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error('Config not found');
        return;
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log('Config loaded:', { computerId: config.computerId, hasToken: !!config.token });

    // 2. Read Log for URL
    if (!fs.existsSync(LOG_PATH)) {
        console.error('Log not found at ' + LOG_PATH);
        return;
    }
    const logContent = fs.readFileSync(LOG_PATH, 'utf8');
    const matches = logContent.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);

    if (!matches || matches.length === 0) {
        console.error('No tunnel URL found in logs');
        return;
    }

    const tunnelUrl = matches[matches.length - 1]; // Last one is most recent
    console.log('Found Tunnel URL:', tunnelUrl);

    // 3. Force Register
    try {
        console.log('Sending register request...');
        const res = await axios.post(`${BACKEND_URL}/api/tunnels/register`,
            {
                computerId: config.computerId,
                tunnelUrl: tunnelUrl,
                accessMethod: 'vnc',
                accessPassword: '***' // Assuming standard, backend doesn't overwrite if undefined but let's see
            },
            { headers: { 'Authorization': `Bearer ${config.token}` } }
        );
        console.log('SUCCESS! Backend updated:', res.data);
    } catch (e) {
        console.error('ERROR:', e.response?.data || e.message);
    }
}

fix();
