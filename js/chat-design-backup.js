
// ===========================================
// DESIGN BACKUP (From chat-manager-restored.js)
// ===========================================
// Use this to implement the visual layer later.

renderFullPage() {
    if (!this.messagesPageContainer) return;
    this.messagesPageContainer.style.overflow = 'hidden';

    this.messagesPageContainer.innerHTML = `
            <div class="chat-layout" style="display: grid; grid-template-columns: 420px 1fr; height: 100%; gap: 1.5rem; padding: 1rem; padding-bottom: 2rem; box-sizing: border-box;">
                <!-- Sidebar -->
                <div class="chat-sidebar glass-card" style="display: flex; flex-direction: column; height: 100%;">
                    <div style="padding: 1rem; border-bottom: 1px solid var(--glass-border);">
                        <h2 style="margin: 0; font-size: 1.5rem;">Mensajes</h2>
                        <input type="text" oninput="chatManager.handleSearch(this.value)" placeholder="Buscar..." style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 0.5rem; width: 100%; margin-top: 1rem; border-radius: 8px; color: white;">
                    </div>
                    <div id="conversationsList" style="flex: 1; overflow-y: auto; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;"></div>
                </div>

                <!-- Chat Area -->
                <div class="chat-main glass-card" style="display: flex; flex-direction: column; height: 100%; overflow: hidden; position: relative;">
                    <div id="chatHeader" style="padding: 1rem; border-bottom: 1px solid var(--glass-border); display: flex; align-items: center; justify-content: space-between; height: 70px; flex-shrink: 0;">
                        <h3 style="margin: 0; color: var(--text-secondary);">Selecciona una conversación</h3>
                    </div>

                    <div id="messagesArea" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; background: rgba(0,0,0,0.2);">
                        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-direction: column;">
                            <span style="font-size: 3rem; margin-bottom: 1rem;">👋</span>
                            <p>¡Bienvenido al Chat de DeskShare!</p>
                            <small>Selecciona un usuario a la izquierda para comenzar.</small>
                        </div>
                    </div>

                     <!-- Input Area -->
                    <div id="inputArea" style="padding: 1rem; border-top: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); display: none; flex-shrink: 0;">
                        <form id="messageForm" style="display: flex; gap: 0.8rem; align-items: center;">
                             <!-- File Button -->
                            <input type="file" id="fullPageFileInput" style="display: none;" accept="image/*,application/pdf,.doc,.docx,.zip">
                            <button type="button" onclick="document.getElementById('fullPageFileInput').click()"
                                style="background: transparent; border: none; color: #aaa; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; transition: background 0.2s;"
                                onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                </svg>
                            </button>

                            <!-- Text Input -->
                            <div style="flex: 1; position: relative; display: flex; align-items: center;">
                                <input type="text" id="messageInput" placeholder="Escribe un mensaje..." autocomplete="off"
                                    style="width: 100%; padding: 12px 45px 12px 16px; border-radius: 24px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.05); color: white; font-family: 'Outfit', sans-serif;">
                                    
                                    <!-- Emoji Button -->
                                    <button type="button" id="fullPageEmojiBtn"
                                        style="position: absolute; right: 8px; background: transparent; border: none; font-size: 1.2rem; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
                                        😊
                                    </button>
                            </div>

                            <!-- Send Button -->
                            <button type="submit" class="btn btn-primary" style="width: 44px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                    <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
                                </svg>
                            </button>
                        </form>
                         <!-- Staging Area for File -->
                        <div id="fullPageStaging" style="display: none; padding-top: 10px;"></div>
                    </div>
                </div>
            </div>
        `;
    this.renderConversationsList();

    // ... (Event handlers logic was here, ensure to copy logic if needed for implementation later)
}

renderConversationsList(filterTerm = '') {
    const list = document.getElementById('conversationsList');
    if (!list) return;
    if (this.conversations.length === 0) {
        list.innerHTML = '<p style="text-align:center; opacity:0.6; padding: 1rem;">No tienes mensajes aún.</p>';
        return;
    }
    const filtered = this.conversations.filter(conv => {
        if (!filterTerm) return true;
        return conv.otherUser.name.toLowerCase().includes(filterTerm.toLowerCase());
    });

    list.innerHTML = filtered.map(conv => {
        const user = conv.otherUser;
        const msgs = conv.messages || [];
        const sorted = msgs.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const lastMsg = sorted[sorted.length - 1] || conv.lastMessage;
        let timeStr = lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const isActive = this.activeConversation && this.activeConversation.otherUser.id == user.id;
        const activeBg = isActive ? 'rgba(255,255,255,0.1)' : 'transparent';
        const activeBorder = isActive ? 'var(--glass-border)' : 'transparent';

        let preview = '<i>Sin mensajes</i>';
        if (lastMsg) {
            const prefix = lastMsg.senderId === this.currentUser.id ? 'Tú: ' : '';
            let content = lastMsg.message;
            if (lastMsg.fileUrl) content = (lastMsg.fileType === 'image') ? '📷 Imagen' : '📎 Archivo';
            preview = prefix + content;
        }

        return `
                 <div onclick="chatManager.selectConversation(${user.id})" 
                      style="padding: 10px; display: flex; align-items: center; gap: 15px; cursor: pointer; border-radius: 8px; transition: background 0.2s; background: ${activeBg}; border: 1px solid ${activeBorder};">
                     <div style="position: relative;">
                         <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
                         ${user.isOnline ? '<div style="position: absolute; bottom: 2px; right: 2px; width: 10px; height: 10px; background: #4ade80; border-radius: 50%; border: 2px solid #1a1a1a;"></div>' : ''}
                     </div>
                     <div style="flex: 1; min-width: 0;">
                         <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                             <span style="font-weight: 600; color: white;">${user.name}</span>
                             <span style="font-size: 0.8rem; color: #888;">${timeStr}</span>
                         </div>
                         <div style="display: flex; justify-content: space-between; align-items: center;">
                             <span style="font-size: 0.9rem; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 100%;">${preview}</span>
                             ${(conv.unreadCount > 0) ? `<span style="background: var(--accent-color); color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.75rem; font-weight: bold;">${conv.unreadCount}</span>` : ''}
                         </div>
                     </div>
                 </div>
            `;
    }).join('');
}
