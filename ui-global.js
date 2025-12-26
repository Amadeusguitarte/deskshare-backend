
// ui-global.js - Revised for Robustness (Hardcoded HTML in index.html)

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check Auth
    const authToken = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('currentUser');
    const currentUser = (authToken && userStr) ? JSON.parse(userStr) : null;

    // 2. UI State Updates
    if (currentUser) {
        document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'inline-block');

        // Populate Header Data
        enhanceHeaderProfile(currentUser);
    } else {
        document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'inline-block');
    }

    // 3. Ensure ChatManager is initialized (Assumes script is loaded via HTML)
    if (typeof ChatManager !== 'undefined') {
        initGlobalChat(currentUser);
    } else {
        // Fallback with cache buster if not found (though HTML should have it)
        const script = document.createElement('script');
        script.src = 'js/chat-manager.js?v=' + new Date().getTime();
        script.onload = () => initGlobalChat(currentUser);
        document.body.appendChild(script);
    }
});

function enhanceHeaderProfile(user) {
    if (!user) return;

    // A. Populate Profile Dropdown Data (Hardcoded in index.html)
    const avatarImg = document.getElementById('headerUserAvatar');
    const nameSpan = document.getElementById('headerUserName');
    const dropdownName = document.getElementById('headerDropdownName');

    // Safety check: if elements don't exist, we might be on a page without them or index.html hasn't updated.
    if (avatarImg) avatarImg.src = user.avatarUrl || 'assets/default-avatar.svg';
    if (nameSpan) nameSpan.textContent = user.name.split(' ')[0];
    if (dropdownName) dropdownName.textContent = user.name;

    // B. Ensure Elements are Visible (Double check)
    const msgIcon = document.getElementById('navMessageIcon');
    const profTrigger = document.getElementById('navProfileDropdownTrigger');

    if (msgIcon) msgIcon.style.display = 'inline-block';
    if (profTrigger) profTrigger.style.display = 'inline-block';
}

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

    // Header enhancement is now done separately in enhanceHeaderProfile
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
            <div onclick="event.preventDefault(); document.getElementById('headerMessageDropdown').style.display='none'; if(window.chatManager) window.chatManager.openChat(${user.id}); else window.location.href='messages.html';" style="padding: 12px 16px; border-bottom: 1px solid #f5f5f5; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: background 0.1s; background: ${isUnread ? '#f0f7ff' : '#ffffff'};" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='${isUnread ? '#f0f7ff' : '#ffffff'}'">
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
                             ${lastMsg ? (lastMsg.senderId === user.id ? 'Tú: ' : '') + (lastMsg.message || (lastMsg.fileUrl ? (lastMsg.fileType === 'image' ? '📷 Foto' : '📎 Archivo') : '')) : 'Nueva conversación'}
                        </div>
                        ${isUnread ? `<span style="background: #dc3545; color: white; border-radius: 10px; padding: 0 6px; font-size: 0.7rem; font-weight: bold; min-width: 18px; text-align: center;">${conv.unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

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
    if (profDropdown && profDropdown.style.display === 'block') {
        if (!profDropdown.contains(e.target) && !e.target.closest('[onclick="toggleHeaderProfileDropdown()"]')) {
            profDropdown.style.display = 'none';
        }
    }
});
