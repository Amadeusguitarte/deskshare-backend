// PROBE_API.JS - "The Surveyor"
// Purpose: Manually verify API bricks before building the house.
// Usage: node probe_api.js <authToken> <computerId>

const https = require('https');

const ARGS = process.argv.slice(2);
const TOKEN = ARGS[0];
const COMPUTER_ID = ARGS[1] || "14";

if (!TOKEN) {
    console.error("Usage: node probe_api.js <authToken> [computerId]");
    console.log("Please copy the authToken from your config.json");
    process.exit(1);
}

const API_HOST = "deskshare-backend-production.up.railway.app";
const API_BASE = "/api/webrtc";

function req(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : "";
        const opts = {
            hostname: API_HOST,
            port: 443,
            path: API_BASE + path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`,
                'User-Agent': 'DeskShare-Probe/1.0',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        console.log(`\n[REQUEST] ${method} ${path}`);
        console.log("Headers:", JSON.stringify(opts.headers));
        console.log("Body:", data);

        const r = https.request(opts, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                console.log(`[RESPONSE] ${res.statusCode} ${res.statusMessage}`);
                console.log("Body:", d); // PRINT RAW BODY
                try {
                    const json = JSON.parse(d);
                    resolve(json);
                } catch (e) {
                    resolve({ error: "Invalid JSON", raw: d });
                }
            });
        });
        r.on('error', e => reject(e));
        if (data) r.write(data);
        r.end();
    });
}

async function runProbe() {
    console.log("=== BRICK 1: REGISTRATION ===");
    // Proving the server accepts this Computer ID for WebRTC
    const r1 = await req('POST', '/register', {
        computerId: COMPUTER_ID,
        mode: 'native'
    });

    if (r1.success) {
        console.log("✅ Brick 1 (Register) Laid Successfully.");
    } else {
        console.error("❌ Brick 1 Failed. Stop Here.");
        return;
    }

    console.log("\n=== BRICK 2: DISCOVERY ===");
    // Checking if the server sees any pending sessions
    const r2 = await req('GET', `/host/pending?computerId=${COMPUTER_ID}`);

    if (r2.sessionId) {
        console.log(`✅ Brick 2 (Discovery) Success. Found Session: ${r2.sessionId}`);

        console.log("\n=== BRICK 3: HANDSHAKE CHECK ===");
        const r3 = await req('GET', `/poll/${r2.sessionId}`);
        if (r3.offer) {
            console.log("✅ Brick 3 (Offer) Success. Server has an OFFER waiting for us.");
            console.log("   Ready to build the Agent.");
        } else {
            console.log("⚠️ Brick 3 Partial. Session exists, but no Offer yet. (Viewer hasn't sent it?)");
        }

    } else {
        console.log("⚠️ Brick 2 Result: No Pending Sessions. (Did you open the link in the browser?)");
    }
}

runProbe();
