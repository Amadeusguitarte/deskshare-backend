require('dotenv').config({ path: 'backend/.env' }); // Load backend env vars
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function findFile() {
    console.log('Searching for file with timestamp 1767544466984...');
    try {
        // Search by prefix or filename pattern
        // The file in the error was: 1767544466984-Your boarding pass...
        const result = await cloudinary.search
            .expression('resource_type:raw AND public_id:deskshare-chat/1767544466984*')
            .execute();

        console.log('Search Result:', JSON.stringify(result, null, 2));

        if (result.resources.length > 0) {
            console.log('\n--- EXACT MATCH FOUND ---');
            console.log('Public ID:', result.resources[0].public_id);
            console.log('URL:', result.resources[0].secure_url);
        } else {
            console.log('No match found.');
        }
    } catch (error) {
        console.error('Search failed:', error);
    }
}

findFile();
