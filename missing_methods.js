
handleSearch(searchTerm) {
    this.renderConversationsList(searchTerm);
}

renderConversationsList(filterTerm = '') {
    const list = document.getElementById('conversationsList');
    if (!list) return;

    if (this.conversations.length === 0) {
        list.innerHTML = '<p style="text-align:center; opacity:0.6; padding: 1rem;">No tienes mensajes aún.</p>';
        return;
    }

    list.innerHTML = this.conversations
        .filter(conv => {
            if (!filterTerm) return true;
            return conv.otherUser.name.toLowerCase().includes(filterTerm.toLowerCase());
        })
        .map(conv => {
            const user = conv.otherUser;
            const sortedMessages = (conv.messages || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const lastMsg = sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1] : conv.lastMessage;
            const time = lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            const isActive = this.activeConversation && this.activeConversation.otherUser.id == user.id;
            const unreadCount = this.unreadCounts[user.id] || 0;

            return `
                <div onclick="chatManager.selectConversation(${user.id})" 
                     style="padding: 10px; display: flex; align-items: center; gap: 15px; cursor: pointer; border-radius: 8px; transition: background 0.2s; background: ${isActive ? 'rgba(255,255,255,0.1)' : 'transparent'}; border: 1px solid ${isActive ? 'var(--glass-border)' : 'transparent'};">
                    
                    <div style="position: relative;">
                        <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" onerror="this.src='assets/default-avatar.svg'" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
                        ${user.isOnline ? '<div style="position: absolute; bottom: 2px; right: 2px; width: 10px; height: 10px; background: #4ade80; border-radius: 50%; border: 2px solid #1a1a1a;"></div>' : ''}
                    </div>

                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-weight: 600; color: white;">${user.name}</span>
                            <span style="font-size: 0.8rem; color: #888;">${time}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.9rem; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 100%;">
                                ${(lastMsg ? (lastMsg.senderId === this.currentUser.id ? 'Tú: ' : '') + (lastMsg.fileUrl ? (lastMsg.fileType === 'image' ? '📷 Imagen' : '📎 Archivo') : lastMsg.message) : '<i>Sin mensajes</i>')}
                            </span>
                            ${unreadCount > 0 ? `<span style="background: var(--accent-color); color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.75rem; font-weight: bold;">${unreadCount}</span>` : ''}
                        </div>
                    </div>
                </div>
                `;
        }).join('');
}

    async selectConversation(userId) {
    let conv = this.conversations.find(c => c.otherUser.id == userId);
    if (!conv) return;

    this.activeConversation = conv;
    conv.unreadCount = 0;
    this.socket.emit('mark-read', { senderId: this.currentUser.id, receiverId: userId });
    this.renderConversationsList();

    const messages = await this.loadHistory(userId);
    this.activeConversation.messages = messages;

    // Update Header
    const user = conv.otherUser;
    const header = document.getElementById('chatHeader');
    if (header) {
        header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" onerror="this.src='assets/default-avatar.svg'" style="width: 40px; height: 40px; border-radius: 50%;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <h3 style="margin: 0; color: white;">${user.name}</h3>
                            <div class="header-status-dot" style="width: 8px; height: 8px; background: #4ade80; border-radius: 50%; box-shadow: 0 0 5px #4ade80; display: ${user.isOnline ? 'block' : 'none'};"></div>
                        </div>
                        <span class="header-status-text" style="font-size: 0.8rem; color: ${user.isOnline ? '#4ade80' : '#666'};">
                            ${user.isOnline ? 'En línea' : ''}
                        </span>
                    </div>
                </div>
                 <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-secondary" style="padding: 0.5rem;" onclick="window.location.href='marketplace.html'">Explorar PC</button>
                </div>
            `;
    }

    const inputArea = document.getElementById('inputArea');
    if (inputArea) inputArea.style.display = 'block';

    // Clear Staging Logic (But don't rebind)
    this.fullPageStagedFile = null;
    const stagingArea = document.getElementById('fullPageStaging');
    const fileInput = document.getElementById('fullPageFileInput');
    if (stagingArea) {
        stagingArea.innerHTML = '';
        stagingArea.style.display = 'none';
    }
    if (fileInput) fileInput.value = '';

    // Focus
    const msgInput = document.getElementById('messageInput');
    if (msgInput) msgInput.focus();

    this.renderMessages(messages);
    this.scrollToBottom();
}
