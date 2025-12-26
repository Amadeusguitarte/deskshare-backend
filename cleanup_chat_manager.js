const fs = require('fs');
const path = require('path');

const filePaths = [
    'd:\\Downloads\\DeskShare\\backend\\public\\js\\chat-manager-stable.js',
    'd:\\Downloads\\DeskShare\\js\\chat-manager-stable.js',
    // Also fix the original just in case
    'd:\\Downloads\\DeskShare\\js\\chat-manager.js'
];

filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        console.log(`Processing ${filePath}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        // Validation: Check if line 513 is '    }' and line 804 is '    handleSearch(searchTerm) {'
        // Note: Lines in array are 0-indexed. Line 513 is index 512.

        const line513Ind = 512; // "    }" ending renderFullPage
        const line804Ind = 803; // "    handleSearch(searchTerm) {"

        // Check for "handleSearch" at 514 (index 514) approx to confirm corruption start
        // Actually, let's look for the specific garbage signature between 513 and 804 to be safe.
        // But the line numbers from view_file are reliable if the file hasn't changed.

        console.log(`Line 513 (index 512): ${lines[512]}`);
        console.log(`Line 804 (index 803): ${lines[803]}`);

        // We want to remove from index 513 (Line 514) to index 802 (Line 803).
        // Line 514 is empty?
        // Line 804 (index 803) should trigger the start of the next valid block.

        // Only proceed if signatures match roughly what we expect
        if (lines[512].trim() === '}' && lines[803].includes('handleSearch')) {
            console.log('Signatures match. Splicing...');
            // Remove from index 513 to 802 inclusive.
            // 803 is the keep line.

            const before = lines.slice(0, 513); // 0 to 512
            const after = lines.slice(803); // 803 to end

            const newContent = before.concat(after).join('\n');
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`Fixed ${filePath}. New line count: ${newContent.split('\n').length}`);
        } else {
            console.error('Signatures DID NOT MATCH. Aborting edit for safety.');
        }
    } else {
        console.log(`File not found: ${filePath}`);
    }
});
