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

    // IMMEDIATE HEADER FIX (Supports both Custom and Standard layouts)
    if (currentUser) {
        // 1. Legacy Custom Header (ID-based)
        const authBtns = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        if (authBtns) authBtns.style.display = 'none';
        if (userMenu) {
            userMenu.style.display = 'flex';
            const initDiv = document.getElementById('navUserInitials');
            if (initDiv) initDiv.innerText = currentUser.name.substring(0, 2).toUpperCase();
        }

        // 2. Standard Header (Class-based) - Used in index.html, marketplace.html, and now messages.html
        document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'inline-block'); // or block/flex depending on css, inline-block is safe for LIs
        document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'none');

        // Update logout buttons if needed
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.onclick = (e) => {
                e.preventDefault();
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html';
            };
        }
    }

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
    const navLinks = document.getElementById('navLinks') || document.querySelector('.nav-links');
    if (navLinks && user) {
        // Find "Mi Perfil" link container (LI)
        let profileLi = Array.from(navLinks.children).find(li => {
            const a = li.querySelector('a');
            return a && a.href && a.href.includes('profile.html');
        });

        if (profileLi) {
            // A. Personalise Profile Link (Avatar + Name)
            const profileLink = profileLi.querySelector('a');
            if (profileLink && !profileLink.dataset.customized) {
                const firstName = user.name.split(' ')[0];
                const avatarUrl = user.avatarUrl || 'assets/default-avatar.svg';

                profileLink.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                         <img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-purple);">
                        <span style="font-weight: 500;">${firstName}</span>
                    </div>
                `;
                profileLink.dataset.customized = 'true'; // Prevent double-customization
            }

            // B. Inject Message Icon (To the LEFT of Profile)
            if (!document.getElementById('navMessageIcon')) {
                const li = document.createElement('li');
                li.id = 'navMessageIcon';
                li.className = 'auth-only'; // Ensure it behaves like other auth items
                li.style.display = 'inline-block'; // Force display if auth is active
                li.style.marginRight = '5px';
                li.style.position = 'relative'; // For dropdown positioning

                li.innerHTML = `
                    <a href="#" onclick="event.preventDefault(); toggleHeaderMessageDropdown();" style="position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; transition: background 0.2s; color: #666;" onmouseover="this.style.color='var(--primary-purple)'" onmouseout="this.style.color='#666'">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span id="navMsgBadge" style="display: none; position: absolute; top: -2px; right: -2px; background: #ff0000; color: white; font-size: 10px; font-weight: bold; width: 18px; height: 18px; border-radius: 50%; align-items: center; justify-content: center; border: 2px solid #fff;">0</span>
                    </a>
                    
                    <!-- Dropdown Container (Freelancer Style: White, Arrow Tip) -->
                    <div id="headerMessageDropdown" style="display: none; position: absolute; top: 50px; right: -10px; width: 360px; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 10000; overflow: visible; font-family: 'Inter', sans-serif;">
                        <!-- Arrow Tip -->
                        <div style="position: absolute; top: -6px; right: 20px; width: 12px; height: 12px; background: #ffffff; border-left: 1px solid #e0e0e0; border-top: 1px solid #e0e0e0; transform: rotate(45deg);"></div>

                        <!-- Header -->
                        <div style="padding: 16px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; background: #ffffff; border-radius: 8px 8px 0 0;">
                            <span style="font-weight: 700; font-size: 0.95rem; color: #333;">Recent Messages</span>
                            <a href="messages.html" style="font-size: 0.85rem; color: #007bff; text-decoration: none; font-weight: 600;">View All</a>
                        </div>

                        <!-- List -->
                        <div id="headerDropdownList" style="max-height: 400px; overflow-y: auto; background: #ffffff;">
                            <!-- Content injected by JS -->
                            <div style="padding: 30px; text-align: center; color: #999; font-size: 0.9rem;">Loading messages...</div>
                        </div>

                        <!-- Optional: Search Placeholder (Visual only for now) -->
                        <div style="padding: 12px; border-top: 1px solid #f0f0f0; background: #fafafa; border-radius: 0 0 8px 8px;">
                            <input type="text" placeholder="Search messages..." style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85rem; background: #fff; color: #333; outline: none;">
                        </div>
                    </div>
                `;

                navLinks.insertBefore(li, profileLi);
            }
        }
    }
}

// Global Toggle for Header Dropdown
window.toggleHeaderMessageDropdown = function () {
    const dropdown = document.getElementById('headerMessageDropdown');
    const isHidden = dropdown.style.display === 'none';

    // Close others
    document.querySelectorAll('.dropdown-menu').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#userMenu .dropdown-menu').forEach(el => el.style.display = 'none');

    dropdown.style.display = isHidden ? 'block' : 'none';

    if (isHidden && window.chatManager) {
        renderHeaderDropdown(window.chatManager.conversations);
    }
};

function renderHeaderDropdown(conversations) {
    const list = document.getElementById('headerDropdownList');
    if (!list) return;

    if (!conversations || conversations.length === 0) {
        list.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: #888; font-size: 0.95rem;">You have no messages yet.</div>';
        return;
    }

    list.innerHTML = conversations.map(conv => {
        const user = conv.otherUser;
        const lastMsg = conv.lastMessage;
        const isUnread = conv.unreadCount > 0;

        // Formatting Style: White Theme hover effect
        return `
            <div onclick="window.location.href='messages.html'" style="padding: 12px 16px; border-bottom: 1px solid #f5f5f5; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: background 0.1s; background: ${isUnread ? '#f0f7ff' : '#ffffff'};" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='${isUnread ? '#f0f7ff' : '#ffffff'}'">
                <div style="position: relative;">
                    <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #eee;">
                    ${user.isOnline ? '<div style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; background: #10b981; border: 2px solid #fff; border-radius: 50%;"></div>' : ''}
                </div>
                <div style="flex: 1; overflow: hidden;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 2px; align-items: center;">
                        <span style="font-weight: 600; color: #333; font-size: 0.9rem;">${user.name}</span>
                        <span style="font-size: 0.75rem; color: #999;">
                             ${new Date(lastMsg?.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                         <div style="font-size: 0.85rem; color: ${isUnread ? '#333' : '#777'}; font-weight: ${isUnread ? '600' : '400'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
                            ${lastMsg ? (lastMsg.senderId === user.id ? '' : 'You: ') + lastMsg.message : 'Started a conversation'}
                        </div>
                        ${isUnread ? `<span style="background: #dc3545; color: white; border-radius: 10px; padding: 0 6px; font-size: 0.7rem; font-weight: bold; min-width: 18px; text-align: center;">${conv.unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
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
