const fs = require('fs');
const path = 'd:\\Downloads\\DeskShare\\js\\chat-manager.js';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split('\n');

    // The class closes at line 2266 (index 2265)
    // The export is at line 2269 (index 2268)
    // The appended methods start at line 2271 (index 2270)

    // We want to REMOVE lines 2266 to 2270 (approx)
    // Specifically verify lines before removing

    if (lines[2265].trim() === '}' && lines[2268].includes('window.ChatManager')) {
        console.log('Confirmed structure. Removing premature closure.');

        // Remove lines 2266-2270 (indexes 2265 to 2269)
        // 2266: }
        // 2267: 
        // 2268: // Make globally available
        // 2269: window.ChatManager = ChatManager;
        // 2270: 

        // Remove 5 lines starting at index 2265
        lines.splice(2265, 5);

        // Now append the closure at the VERY end
        lines.push('');
        lines.push('}'); // Close class
        lines.push('');
        lines.push('// Make globally available');
        lines.push('window.ChatManager = ChatManager;');

        fs.writeFileSync(path, lines.join('\n'));
        console.log('Successfully repaired ChatManager structure.');

    } else {
        console.error('Line mismatch. Aborting to avoid damage.');
        console.log('Line 2266:', lines[2265]);
        console.log('Line 2269:', lines[2268]);
    }

} catch (e) {
    console.error('Error:', e);
}
