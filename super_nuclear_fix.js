const fs = require('fs');
const path = require('path');

// Target the FRONTEND file which is the one loaded by the browser
const filePath = path.join(__dirname, 'js', 'chat-manager-stable.js');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    console.log('Original size:', content.length);

    // 1. Tag Cleaners (Open and Close)
    // < div -> <div
    content = content.replace(/<\s+([a-zA-Z0-9]+)/g, '<$1');
    // </ div -> </div
    content = content.replace(/<\/\s+([a-zA-Z0-9]+)/g, '</$1');

    // 2. Closing Bracket Cleaner
    // > -> > (Removes space before >)
    // Warning: Don't break arrows like =>. 
    // HTML tags end with >.
    // e.g. <div ... > -> <div ...>
    // e.g. </div > -> </div>
    // e.g. <img ... > -> <img ...>
    // Logic: If preceded by " or ' or letter or /, remove space.
    content = content.replace(/(["'a-z0-9\/])\s+>/gi, '$1>');

    // 3. Attribute Cleaner
    // style = " -> style="
    content = content.replace(/\s+=\s+"/g, '="');
    // id = " -> id="
    content = content.replace(/\s+=\s+'/g, "='");

    // 4. Template Literal Cleaner (Optional but safer)
    // ${ var } -> ${var}
    // This isn't strictly necessary for JS execution but helpful for URL construction where spaces matter
    content = content.replace(/\${\s+/g, '${');
    content = content.replace(/\s+}/g, '}');

    // 5. Specific Entities
    // & times; -> &times;
    content = content.replace(/&\s+times;/g, '&times;');

    // 6. LOGIC FIX: Space in Fetch URLs
    // ${this.baseUrl} /chat -> ${this.baseUrl}/chat
    content = content.replace(/\}\s+\/chat/g, '}/chat');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed size:', content.length);
    console.log('SUCCESS: Super Nuclear cleanup applied.');

    // ALSO sync to backend just in case
    try {
        const backendPath = path.join(__dirname, 'backend', 'public', 'js', 'chat-manager-stable.js');
        fs.writeFileSync(backendPath, content, 'utf8');
        console.log('Synced to backend/public/js');
    } catch (e) {
        console.log('Backend sync skipped or failed');
    }

} catch (err) {
    console.error('Error:', err);
    process.exit(1);
}
