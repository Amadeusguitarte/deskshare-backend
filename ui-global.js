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

    // 2. Refine Header: Message Icon + Personalised Profile
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        // Find "Mi Perfil" link
        const profileLink = Array.from(navLinks.querySelectorAll('a')).find(a => a.href.includes('profile.html'));
        let profileLi = profileLink ? profileLink.parentElement : navLinks.lastElementChild;

        // A. Personalise Profile Link (Freelancer Style)
        if (profileLink && user) {
            const firstName = user.name.split(' ')[0];
            const avatarUrl = user.avatarUrl || 'assets/default-avatar.svg';

            profileLink.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-purple);">
                    <span style="font-weight: 600; font-size: 0.95rem;">${firstName}</span>
                </div>
            `;
            profileLink.className = '';
            profileLink.style.display = 'flex';
            profileLink.style.alignItems = 'center';
        }

        // B. Inject Message Icon (To the LEFT of Profile) with Dropdown
        if (!document.getElementById('navMessageIcon')) {
            const li = document.createElement('li');
            li.id = 'navMessageIcon';
            li.style.marginRight = '15px';
            li.style.position = 'relative'; // For dropdown positioning
            li.innerHTML = `
                <a href="#" onclick="event.preventDefault(); toggleHeaderMessageDropdown();" style="position: relative; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span id="navMsgBadge" style="display: none; position: absolute; top: 4px; right: 4px; background: #ef4444; color: white; font-size: 9px; font-weight: bold; width: 14px; height: 14px; border-radius: 50%; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--bg-primary);">0</span>
                </a>
                
                <!-- Dropdown Container -->
                <div id="headerMessageDropdown" style="display: none; position: absolute; top: 50px; right: 0; width: 320px; background: #1a1a1a; border: 1px solid var(--glass-border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 10000; overflow: hidden; font-family: 'Outfit', sans-serif;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; background: #222;">
                        <span style="font-weight: 600; font-size: 0.95rem;">Mensajes Recientes</span>
                        <a href="messages.html" style="font-size: 0.8rem; color: var(--accent-purple); text-decoration: none;">Ver todo</a>
                    </div>
                    <div id="headerDropdownList" style="max-height: 350px; overflow-y: auto;">
                        <!-- Content injected by JS -->
                        <div style="padding: 20px; text-align: center; color: #666; font-size: 0.9rem;">Cargando...</div>
                    </div>
                </div>

                <div style="width: 1px; height: 24px; background: rgba(255,255,255,0.1); margin-left: 10px; display: inline-block; vertical-align: middle;"></div>
            `;

            navLinks.insertBefore(li, profileLi);
        }
    }
}

// Global Toggle for Header Dropdown
window.toggleHeaderMessageDropdown = function () {
    const dropdown = document.getElementById('headerMessageDropdown');
    const isHidden = dropdown.style.display === 'none';

    // Close others
    document.querySelectorAll('.dropdown-menu').forEach(el => el.style.display = 'none');

    dropdown.style.display = isHidden ? 'block' : 'none';

    if (isHidden && window.chatManager) {
        // Render content
        const list = document.getElementById('headerDropdownList');
        const convs = window.chatManager.conversations || [];

        if (convs.length === 0) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; font-size: 0.9rem;">No hay mensajes</div>';
        } else {
            list.innerHTML = convs.map(conv => `
                <div onclick="window.location.href='messages.html'; /* For now simple redirect */" style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; display: flex; gap: 12px; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    <img src="${conv.otherUser.avatarUrl || 'assets/default-avatar.svg'}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                    <div style="flex: 1; overflow: hidden;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="font-weight: 600; font-size: 0.9rem; color: white;">${conv.otherUser.name}</span>
                            <span style="font-size: 0.75rem; color: #666;">${new Date(conv.lastMessage?.createdAt || Date.now()).toLocaleDateString()}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${(conv.messages[0]?.message || conv.lastMessage?.message || '')}
                        </div>
                    </div>
                    ${conv.unreadCount > 0 ? `<div style="width: 8px; height: 8px; background: var(--accent-purple); border-radius: 50%;"></div>` : ''}
                </div>
            `).join('');
        }
    }
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('headerMessageDropdown');
    const icon = document.getElementById('navMessageIcon');
    if (dropdown && icon && !icon.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}
