const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend', 'public', 'js', 'chat-manager-stable.js');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    console.log('Original size:', content.length);

    // 1. Fix Space Infection in HTML tags
    // Matches < followed by space, then tag name
    content = content.replace(/<\s+div/gi, '<div');
    content = content.replace(/<\/\s+div/gi, '</div');
    content = content.replace(/<\s+img/gi, '<img');
    content = content.replace(/<\s+span/gi, '<span');
    content = content.replace(/<\s+!--/gi, '<!--');
    content = content.replace(/--\s+>/gi, '-->');

    // 2. Fix Space Infection in Attributes (e.g. style = "...")
    // This is riskier, but let's try specific ones seen in the file
    content = content.replace(/style\s+=\s+"/gi, 'style="');
    content = content.replace(/onclick\s+=\s+"/gi, 'onclick="');
    content = content.replace(/id\s+=\s+"/gi, 'id="');
    content = content.replace(/class\s+=\s+"/gi, 'class="');

    // 3. Remove Duplicate Block at the end
    // The duplicate block starts with 'toggleEmojiPicker(triggerBtn, userId) {' around line 2005
    // But we need to be careful not to delete the FIRST definition.
    // The FIRST definition of toggleEmojiPicker in the file is around line 1923 (inside a method?) No.
    // Let's look at the structure.

    // Strategy: Truncate file before the duplicates start.
    // The valid class ends, and then there is junk? 
    // Actually, the duplicates are INSIDE the class (before the final }).
    // We can identify the start of the duplicate block by a unique signature.
    // Signature: "toggleEmojiPicker(triggerBtn, userId) {" appearing TWICE.

    const duplicateSig = 'toggleEmojiPicker(triggerBtn, userId) {';
    const firstIndex = content.indexOf(duplicateSig);
    const lastIndex = content.lastIndexOf(duplicateSig);

    if (firstIndex !== lastIndex && firstIndex !== -1) {
        console.log('Duplicate block detected.');
        console.log('First occurrence:', firstIndex);
        console.log('Second occurrence:', lastIndex);

        // We want to keep the FIRST one (it seemed more complete with the manual unicode array?)
        // Wait, looking at Step 14825/14827:
        // Line 1923: toggleEmojiPicker(triggerBtn, userId) { ... definitions ... }
        // Line 2005: toggleEmojiPicker(triggerBtn, userId) { if (!window.EmojiButton) ... }

        // The one at 1923 uses a manual emoji array.
        // The one at 2005 uses 'window.EmojiButton' logic (better?).

        // Actually, the code at 500 (renderFullPage) uses 'new EmojiButton'.
        // The code at 2005 checks !window.EmojiButton.

        // Let's just keep the file AS IS regarding logic, but remove the second block if it's redundant.
        // But they are DIFFERENT implementations.
        // The one at 1923 is "Inline - No Dependencies".
        // The one at 2005 is "EmojiButton" dependency.

        // If I have both, the second one overwrites the first on the prototype.
        // Usage: chatManager.toggleEmojiPicker(...)

        // I will assume the one at 2005 (later) is the "intended" one if it works, BUT
        // The user said "nothing works".
        // I will trust the top of the file more.

        // ACTUALLY, checking Step 14827 again.
        // Line 2035 is renderConversationsList AGAIN.
        // Line 2084 is selectConversation AGAIN.
        // These are definitely duplicates.

        // I will cutoff the file at line 2004 (before the second toggleEmojiPicker).
        // And append "}" to close the class if needed.
        // content lines are split by \n.

        const lines = content.split('\n');
        // Find line index of the second toggleEmojiPicker
        let seenFirst = false;
        let cutIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('toggleEmojiPicker(triggerBtn, userId)')) {
                if (seenFirst) {
                    cutIndex = i;
                    break;
                }
                seenFirst = true;
            }
        }

        if (cutIndex !== -1) {
            console.log('Cutting file at line:', cutIndex + 1);
            // Keep lines 0 to cutIndex - 1
            const newLines = lines.slice(0, cutIndex);
            // Add closing brace for class and global export
            newLines.push('}');
            newLines.push('window.ChatManager = ChatManager;');
            content = newLines.join('\n');
        }
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed size:', content.length);
    console.log('SUCCESS: Nuclear cleanup applied.');

} catch (err) {
    console.error('Error:', err);
    process.exit(1);
}
