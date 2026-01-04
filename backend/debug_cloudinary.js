require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function run() {
    console.log('Fetching last 10 raw files...');
    try {
        const raw = await cloudinary.api.resources({
            resource_type: 'raw',
            type: 'upload',
            max_results: 10,
            direction: 'desc'
        });

        console.log('--- RAW FILES ---');
        raw.resources.forEach(r => {
            console.log(`Public ID: "${r.public_id}"`);
            console.log(`URL: ${r.secure_url}`);
            console.log('----------------');
        });

    } catch (e) {
        console.error('Error fetching raw:', e);
    }
}

run();
