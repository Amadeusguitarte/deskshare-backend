const fs = require('fs');
const path = 'd:\\Downloads\\DeskShare\\js\\chat-manager.js';

try {
    let content = fs.readFileSync(path, 'utf8');
    const lines = content.split('\n');

    // We strictly know the duplicate block is between line 995 and 1235 based on previous `view_file`
    // Line 994 is "}" (end of renderFullPage cleanup?)
    // Line 995 is "handleSearch(searchTerm) {"
    // ...
    // Line 1235 is "}" (end of selectConversation)
    // Line 1237 is "renderMessages(messages) {"

    // Let's find the specific signature of the duplicate block start
    // We look for the SECOND occurrence of `handleSearch(searchTerm)` followed closely by `renderConversationsList`

    let firstHandleSearch = -1;
    let duplicateStart = -1;
    let duplicateEnd = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('handleSearch(searchTerm) {')) {
            if (firstHandleSearch === -1) {
                firstHandleSearch = i;
                console.log('Found first handleSearch at line', i + 1);
            } else {
                duplicateStart = i;
                console.log('Found duplicate handleSearch at line', i + 1);
            }
        }

        // The duplicate block ends right before `renderMessages(messages) {`
        if (duplicateStart !== -1 && i > duplicateStart && line.includes('renderMessages(messages) {')) {
            duplicateEnd = i - 1; // The line before renderMessages
            console.log('Found end of duplicate block near line', i + 1);
            break;
        }
    }

    if (duplicateStart !== -1 && duplicateEnd !== -1) {
        // Remove the block
        console.log(`Removing lines ${duplicateStart + 1} to ${duplicateEnd + 1}`);
        lines.splice(duplicateStart, duplicateEnd - duplicateStart + 1);

        const newContent = lines.join('\n');
        fs.writeFileSync(path, newContent);
        console.log('Successfully removed duplicate block.');
    } else {
        console.log('Could not locate duplicate block with certainty.');
        // Fallback: If we can't find it dynamically, we use the line numbers observed: 995 to 1235.
        // But verifying content.
        const line994 = lines[994].trim(); // 0-indexed, so 994 is line 995
        if (line994.includes('handleSearch')) {
            console.log('Fallback: Line 995 matches handleSearch. Removing 995-1235 range manually.');
            // Removing 240 lines
            lines.splice(994, 242);
            fs.writeFileSync(path, lines.join('\n'));
            console.log('Fallback removal complete.');
        } else {
            console.log('Fallback failed: Line 995 is:', line994);
        }
    }

} catch (e) {
    console.error('Error:', e);
}
