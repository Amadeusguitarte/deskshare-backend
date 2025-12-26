const fs = require('fs');
const path = 'd:\\Downloads\\DeskShare\\js\\chat-manager.js';

try {
    // Read as binary buffer to catch hidden bytes
    // Or just string and strip \uFEFF
    let content = fs.readFileSync(path, 'utf8');

    // Check for BOM in the middle
    if (content.includes('\uFEFF')) {
        console.log('Found BOM in content! Removing it.');
        content = content.replace(/\uFEFF/g, '');
    }

    // Also harmlessly trim extra newlines at EOF
    content = content.trim() + '\n';

    fs.writeFileSync(path, content, 'utf8');
    console.log('Sanitization complete.');

} catch (e) {
    console.error('Error:', e);
}
