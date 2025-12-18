// ========================================  
// Global UI Functions
// Handles button events for publish page
// ========================================

// Redirect to publish page
function openAddComputerModal() {
    console.log('Redirecting to publish page...');

    // Check if user is logged in
    const token = localStorage.getItem('authToken');

    if (!token) {
        window.location.href = 'register.html?redirect=publish';
        return;
    }

    // Redirect to dedicated publish page
    window.location.href = 'publish.html';
}

// Setup "Publicar PC" buttons
function setupPublishButtons() {
    console.log('Setting up Publicar PC buttons...');

    // Find all "Publicar PC" buttons/links
    const links = document.querySelectorAll('a[href="#"]');
    console.log(`Found ${links.length} links with href="#"`);

    links.forEach(link => {
        if (link.textContent.includes('Publicar PC')) {
            console.log('Found Publicar PC button:', link);
            link.onclick = (e) => {
                e.preventDefault();
                console.log('Publicar PC clicked!');
                openAddComputerModal();
            };
        }
    });

    // Also setup by class if exists
    document.querySelectorAll('.btn-publish-pc').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            openAddComputerModal();
        };
    });
}

// Execute setup immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPublishButtons);
} else {
    setupPublishButtons();
}

// Make functions globally available
// Make functions globally available
window.openAddComputerModal = openAddComputerModal;

// ========================================
// Global Chat Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Auth
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;

    // 2. Ensure Socket.io is loaded
    if (typeof io === 'undefined') {
        await loadScript('https://cdn.socket.io/4.7.2/socket.io.min.js');
    }

    // 3. Ensure ChatManager is loaded
    if (typeof ChatManager === 'undefined') {
        const script = document.createElement('script');
        script.src = 'js/chat-manager.js';
        script.onload = () => {
            initGlobalChat(currentUser);
        };
        script.onerror = () => {
            console.error('Failed to load chat-manager.js');
        };
        document.body.appendChild(script);
    } else {
        initGlobalChat(currentUser);
    }
});

function initGlobalChat(user) {
    if (window.chatManager) return; // Already init

    // 1. Ensure Widget Container Exists (Freelancer Style)
    let container = document.getElementById('chatWidgetContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'chatWidgetContainer';
        container.dataset.listOpen = 'false'; // Default closed
        // Fixed bottom-right positioning, pointer-events: none allows clicking through empty space
        container.style.cssText = `
            position: fixed;
            bottom: 0px;
            right: 20px;
            z-index: 9999;
            display: flex;
            align-items: flex-end;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const socketUrl = 'https://deskshare-backend-production.up.railway.app';
    window.chatManager = new ChatManager(user, socketUrl);
    console.log('Global Chat Widget Initialized');

    // 2. Inject Message Icon into Header (Freelancer Style)
    const navLinks = document.querySelector('.nav-links');
    if (navLinks && !document.getElementById('navMessageIcon')) {
        const li = document.createElement('li');
        li.id = 'navMessageIcon';
        li.style.marginLeft = '10px'; // Extra spacing
        li.innerHTML = `
            <div style="width: 1px; height: 24px; background: rgba(255,255,255,0.1); margin-right: 15px; display: inline-block; vertical-align: middle;"></div>
            <a href="#" onclick="event.preventDefault(); toggleGlobalChatList();" style="position: relative; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span id="navMsgBadge" style="display: none; position: absolute; top: 4px; right: 4px; background: #ef4444; color: white; font-size: 9px; font-weight: bold; width: 14px; height: 14px; border-radius: 50%; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--bg-primary);">0</span>
            </a>
        `;
        // Insert before the last item (usually specific action or profile)
        // Or just append if easier. Let's insert before "Mi Perfil" or similar if possible.
        // For robustness, just prepend or append. Let's prepend to be visible.
        navLinks.insertBefore(li, navLinks.lastElementChild);
    }
}

// Global toggle for the list
window.toggleGlobalChatList = function () {
    const container = document.getElementById('chatWidgetContainer');
    const bar = document.getElementById('chat-global-bar');
    if (container && bar) {
        const isOpen = container.dataset.listOpen === 'true';
        container.dataset.listOpen = !isOpen;
        bar.style.height = !isOpen ? '400px' : '48px';
    }
};

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}
