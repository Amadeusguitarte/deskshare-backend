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

        // 2. Standard Header (Class-based)
        document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'inline-block');
        document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'none');

        // Hide standalone logout if it exists (since we are moving it to dropdown)
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && logoutBtn.parentElement.tagName === 'LI') {
            logoutBtn.parentElement.style.display = 'none';
        }
    }

    if (!currentUser) return;

    // 2. Ensure Socket.io is loaded
    if (typeof io === 'undefined') {
        await loadScript('/socket.io/socket.io.js');
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

    // 1. Ensure Widget Container Exists
    let container = document.getElementById('chatWidgetContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'chatWidgetContainer';
        container.dataset.listOpen = 'false'; // Default closed
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

    // 2. Refine Header: Message Icon + Personalised Profile Dropdown
    const navLinks = document.getElementById('navLinks') || document.querySelector('.nav-links');
    if (navLinks && user) {
        // Find "Mi Perfil" link container (LI)
        let profileLi = Array.from(navLinks.children).find(li => {
            const a = li.querySelector('a');
            return a && a.href && a.href.includes('profile.html');
        });

        if (profileLi) {
            // A. Enhance Profile with Dropdown (Avatar + Name + Chevron)
            if (!profileLi.dataset.customized) {
                const firstName = user.name.split(' ')[0];
                const avatarUrl = user.avatarUrl || 'assets/default-avatar.svg';

                profileLi.style.position = 'relative';
                // Remove default hover effects that might conflict
                const originalLink = profileLi.querySelector('a');
                if (originalLink) originalLink.style.display = 'none';

                profileLi.innerHTML = `
                    <div onclick="toggleHeaderProfileDropdown()" style="cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 20px; transition: background 0.2s; color: var(--text-secondary);" onmouseover="this.style.background='rgba(255,255,255,0.05)'; this.style.color='var(--text-primary)'" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)'">
                        <img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-purple);">
                        <span style="font-weight: 500; font-size: 0.95rem;">${firstName}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7;">
                            <path d="M6 9l6 6 6-6"/>
                        </svg>
                    </div>

                    <!-- Profile Dropdown Menu -->
                    <div id="headerProfileDropdown" style="display: none; position: absolute; top: 50px; right: 0; width: 220px; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 10000; overflow: hidden; font-family: 'Inter', sans-serif;">
                        <!-- Arrow Tip -->
                        <div style="position: absolute; top: -6px; right: 20px; width: 12px; height: 12px; background: #ffffff; border-left: 1px solid #e0e0e0; border-top: 1px solid #e0e0e0; transform: rotate(45deg);"></div>
                        
                        <div style="padding: 16px; border-bottom: 1px solid #f0f0f0;">
                            <div style="font-weight: 700; color: #333; font-size: 1rem;">${user.name}</div>
                            <div style="font-size: 0.8rem; color: #10b981; margin-top: 2px;">● Online</div>
                        </div>

                        <ul style="list-style: none; padding: 8px 0; margin: 0;">
                            <li>
                                <a href="profile.html" style="display: flex; align-items: center; gap: 10px; padding: 10px 20px; color: #333; text-decoration: none; font-size: 0.95rem; transition: background 0.1s;" onmouseover="this.style.background='#f5f7f9'" onmouseout="this.style.background='transparent'">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #666;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                    Mi Perfil
                                </a>
                            </li>
                             <li>
                                <a href="#" onclick="handleLogout(event)" style="display: flex; align-items: center; gap: 10px; padding: 10px 20px; color: #dc3545; text-decoration: none; font-size: 0.95rem; transition: background 0.1s;" onmouseover="this.style.background='#fff0f1'" onmouseout="this.style.background='transparent'">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                    Cerrar Sesión
                                </a>
                            </li>
                        </ul>
                    </div>
                `;
                profileLi.dataset.customized = 'true';
            }

            // B. Inject Message Icon (To the LEFT of Profile)
            if (!document.getElementById('navMessageIcon')) {
                const li = document.createElement('li');
                li.id = 'navMessageIcon';
                li.className = 'auth-only'; // Ensure it behaves like other auth items
                li.style.display = 'inline-block'; // Force display if auth is active
                li.style.marginRight = '8px';
                li.style.position = 'relative'; // For dropdown positioning

                li.innerHTML = `
                    <a href="#" onclick="event.preventDefault(); toggleHeaderMessageDropdown();" style="position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; transition: background 0.2s; color: inherit; opacity: 0.9;" onmouseover="this.style.color='var(--primary-purple)'; this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.color='inherit'; this.style.background='transparent'">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span id="navMsgBadge" style="display: none; position: absolute; top: 0px; right: 0px; background: #ef4444; color: white; font-size: 10px; font-weight: bold; width: 16px; height: 16px; border-radius: 50%; align-items: center; justify-content: center; border: 2px solid var(--bg-secondary);">0</span>
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
    if (window.toggleHeaderProfileDropdown) {
        const profDropdown = document.getElementById('headerProfileDropdown');
        if (profDropdown) profDropdown.style.display = 'none';
    }

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
}

// Global Helpers for Profile Dropdown
window.toggleHeaderProfileDropdown = function () {
    const dropdown = document.getElementById('headerProfileDropdown');
    if (!dropdown) return;
    const isHidden = dropdown.style.display === 'none';

    // Close message dropdown
    const msgDropdown = document.getElementById('headerMessageDropdown');
    if (msgDropdown) msgDropdown.style.display = 'none';

    dropdown.style.display = isHidden ? 'block' : 'none';
};

window.handleLogout = function (e) {
    if (e) e.preventDefault();
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    // Message Dropdown logic
    const msgDropdown = document.getElementById('headerMessageDropdown');
    const msgIcon = document.getElementById('navMessageIcon');
    if (msgDropdown && msgIcon && !msgIcon.contains(e.target) && !msgDropdown.contains(e.target)) {
        msgDropdown.style.display = 'none';
    }

    // Profile Dropdown logic
    const profDropdown = document.getElementById('headerProfileDropdown');
    // Check if the click was ON the trigger. If so, toggle handled it.
    // We only want to close if click was OUTSIDE the dropdown AND OUTSIDE any trigger.
    // The trigger is replaced by innerHTML on the LI, so we check if strict containment matches.
    if (profDropdown && profDropdown.style.display === 'block') {
        if (!profDropdown.contains(e.target) && !e.target.closest('[onclick="toggleHeaderProfileDropdown()"]')) {
            profDropdown.style.display = 'none';
        }
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
