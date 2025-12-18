
class ChatManager {
    constructor(currentUser, socketUrl) {
        this.currentUser = currentUser;
        this.socketUrl = socketUrl;
        this.socket = null;
        this.conversations = [];
        this.activeConversation = null;

        // UI Elements
        this.widgetContainer = null;
        this.messagesPageContainer = null;

        this.init();
    }

    async init() {
        if (!this.currentUser) return;

        // Initialize Socket
        if (typeof io !== 'undefined') {
            this.socket = io(this.socketUrl);
            this.setupSocketEvents();
        } else {
            console.error('Socket.io not loaded');
        }

        // Determine context
        this.messagesPageContainer = document.getElementById('messagesPageContainer');
        this.widgetContainer = document.getElementById('chatWidgetContainer');

        // Load data
        await this.loadConversations();

        // Render
        if (this.messagesPageContainer) {
            this.renderFullPage();
        } else {
            this.renderWidget();
        }
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Chat Connected');
            this.socket.emit('join-user-room', this.currentUser.id);
        });

        this.socket.on('disconnect', () => {
            console.log('Chat Disconnected');
        });

        this.socket.on('private-message', (msg) => {
            this.handleNewMessage(msg);
        });

        // this.socket.on('new-message', (msg) => {
        //     this.handleNewMessage(msg);
        // });
    }

    handleNewMessage(msg) {
        // Deduplication: Check if we already have this message in the history of the relevant conversation
        if (this.activeConversation &&
            (this.activeConversation.otherUser.id === msg.senderId || this.activeConversation.otherUser.id === msg.receiverId)) {
            const exists = this.activeConversation.messages.some(m => m.id === msg.id);
            if (exists) {
                console.log('Skipping duplicate message:', msg.id);
                return;
            }
        }

        // Refresh conversations
        this.loadConversations().then(() => {
            if (this.messagesPageContainer) {
                this.renderConversationsList();
                if (this.activeConversation &&
                    (this.activeConversation.otherUser.id === msg.senderId || this.activeConversation.otherUser.id === msg.receiverId)) {
                    // Update current chat view
                    this.loadHistory(this.activeConversation.otherUser.id).then(msgs => {
                        this.activeConversation.messages = msgs;
                        this.renderMessages(msgs);
                        this.scrollToBottom();
                    });
                }
            } else {
                // Widget Update
                this.renderWidgetTabs();
                // If tab is open, scroll/update it
                if (this.activeConversation &&
                    (this.activeConversation.otherUser.id === msg.senderId || this.activeConversation.otherUser.id === msg.receiverId)) {
                    this.loadHistory(this.activeConversation.otherUser.id).then(msgs => {
                        this.activeConversation.messages = msgs;
                        this.renderWidgetTabs();
                        setTimeout(() => {
                            const area = this.widgetContainer.querySelector('.mini-messages-area');
                            if (area) area.scrollTop = area.scrollHeight;
                        }, 50);
                    });
                }
            }
        });
    }

    async loadConversations() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            this.conversations = data.conversations || [];
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }

    async loadHistory(userId) {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_BASE_URL}/chat/history/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            return data.messages || [];
        } catch (error) {
            console.error('Error loading history:', error);
            return [];
        }
    }

    async sendMessage(receiverId, text, computerId = null) {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    receiverId,
                    message: text,
                    computerId
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || errData.message || `Server Error: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Send error:', error);
            alert(`Error: ${error.message}`);
            throw error; // Re-throw so caller knows it failed
        }
    }

    // Public API to open a chat
    async openChat(userId) {
        // Ensure conversations are loaded
        if (this.conversations.length === 0) await this.loadConversations();

        // Find existing or create dummy for new chat
        let conv = this.conversations.find(c => c.otherUser.id === userId);

        if (!conv) {
            // Re-load conversations to check if backend created it
            await this.loadConversations();
            conv = this.conversations.find(c => c.otherUser.id === userId);
        }

        if (conv) {
            // Set active and render
            this.activeConversation = conv;

            // Fetch latest history
            const msgs = await this.loadHistory(userId);
            this.activeConversation.messages = msgs;

            if (this.messagesPageContainer) {
                this.renderConversationsList();
                this.selectConversation(userId);
            } else {
                this.renderWidgetTabs();
            }
        }
    }

    // ===========================================
    // View Logic - Full Page (messages.html)
    // ===========================================
    renderFullPage() {
        if (!this.messagesPageContainer) return;

        this.messagesPageContainer.innerHTML = `
            <div class="chat-layout" style="display: grid; grid-template-columns: 350px 1fr; height: calc(100vh - 80px); gap: 1rem; padding: 1rem;">
                <!-- Sidebar -->
                <div class="chat-sidebar glass-card" style="display: flex; flex-direction: column;">
                    <div style="padding: 1rem; border-bottom: 1px solid var(--glass-border);">
                        <h2 style="margin: 0; font-size: 1.5rem;">Mensajes</h2>
                        <input type="text" placeholder="Buscar..." style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 0.5rem; width: 100%; margin-top: 1rem; border-radius: 8px; color: white;">
                    </div>
                    <div id="conversationsList" style="flex: 1; overflow-y: auto; padding: 1rem;">
                        <!-- Conversations go here -->
                    </div>
                </div>

                <!-- Chat Area -->
                <div class="chat-main glass-card" style="display: flex; flex-direction: column; overflow: hidden;">
                    <div id="chatHeader" style="padding: 1rem; border-bottom: 1px solid var(--glass-border); display: flex; align-items: center; justify-content: space-between;">
                        <h3 style="margin: 0; color: var(--text-secondary);">Selecciona una conversación</h3>
                    </div>
                    
                    <div id="messagesArea" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                         <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-direction: column;">
                            <span style="font-size: 3rem; margin-bottom: 1rem;">👋</span>
                            <p>¡Bienvenido al Chat de DeskShare!</p>
                            <small>Selecciona un usuario a la izquierda para comenzar.</small>
                        </div>
                    </div>

                    <div id="inputArea" style="padding: 1rem; border-top: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); display: none;">
                        <form id="messageForm" style="display: flex; gap: 1rem;">
                            <input type="text" id="messageInput" placeholder="Escribe un mensaje..." style="flex: 1; padding: 0.8rem; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.05); color: white;">
                            <button type="submit" class="btn btn-primary">Enviar</button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        this.renderConversationsList();
    }

    renderConversationsList() {
        const list = document.getElementById('conversationsList');
        if (!list) return;

        if (this.conversations.length === 0) {
            list.innerHTML = '<p style="text-align:center; opacity:0.6; padding: 1rem;">No tienes mensajes aún.</p>';
            return;
        }

        list.innerHTML = this.conversations.map(conv => {
            const user = conv.otherUser;
            const lastMsg = conv.messages[0] || conv.lastMessage;
            const time = lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            return `
            <div class="conversation-item ${this.activeConversation && this.activeConversation.otherUser.id === user.id ? 'active' : ''}" 
                 onclick="chatManager.selectConversation(${user.id})"
                 style="display: flex; align-items: center; gap: 1rem; padding: 0.8rem; border-radius: 8px; cursor: pointer; transition: background 0.2s; margin-bottom: 0.5rem; background: ${this.activeConversation && this.activeConversation.otherUser.id === user.id ? 'rgba(255,255,255,0.1)' : 'transparent'};">
                <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
                <div style="flex: 1; overflow: hidden;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
                        <span style="font-weight: 600; color: white;">${user.name || 'Usuario'}</span>
                        <span style="font-size: 0.8rem; color: var(--text-secondary);">${time}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.9rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
                            ${lastMsg ? (lastMsg.senderId === this.currentUser.id ? 'Tú: ' : '') + lastMsg.message : 'Nuevo chat'}
                        </span>
                        ${conv.unreadCount > 0 ? `<span style="background: var(--accent-purple); color: white; font-size: 0.75rem; padding: 2px 6px; border-radius: 10px;">${conv.unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    async selectConversation(userId) {
        let conv = this.conversations.find(c => c.otherUser.id === userId);
        if (!conv) return;

        this.activeConversation = conv;
        this.renderConversationsList();

        const messages = await this.loadHistory(userId);
        this.activeConversation.messages = messages;

        // Update Header
        const user = conv.otherUser;
        const header = document.getElementById('chatHeader');
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
                <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" style="width: 40px; height: 40px; border-radius: 50%;">
                <div>
                    <h3 style="margin: 0; color: white;">${user.name}</h3>
                    <span style="font-size: 0.8rem; color: var(--success-green);">En línea</span>
                </div>
            </div>
             <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary" style="padding: 0.5rem;" onclick="window.location.href='marketplace.html'">Explorar PC</button>
            </div>
        `;

        document.getElementById('inputArea').style.display = 'block';

        const form = document.getElementById('messageForm');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById('messageInput');
            const text = input.value;
            if (!text.trim()) return;

            input.value = '';
            await this.sendMessage(user.id, text);
            // Optimistic
            const msg = { senderId: this.currentUser.id, message: text, createdAt: new Date().toISOString() };
            this.activeConversation.messages.push(msg);
            this.renderMessages(this.activeConversation.messages);
            this.scrollToBottom();
        };

        this.renderMessages(messages);
        this.scrollToBottom();
    }

    renderMessages(messages) {
        const area = document.getElementById('messagesArea');
        area.innerHTML = messages.map(msg => {
            const isMe = msg.senderId === this.currentUser.id;
            return `
            <div style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'};">
                <div style="max-width: 70%; padding: 0.8rem 1rem; border-radius: 12px; background: ${isMe ? 'var(--accent-purple)' : 'rgba(255,255,255,0.1)'}; color: white; border-bottom-${isMe ? 'right' : 'left'}-radius: 2px;">
                    <p style="margin: 0; line-height: 1.4;">${msg.message}</p>
                    <span style="display: block; font-size: 0.7rem; opacity: 0.7; margin-top: 4px; text-align: right;">
                        ${new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        ${isMe ? (msg.isRead ? '✓✓' : '✓') : ''}
                    </span>
                </div>
            </div>
            `;
        }).join('');
    }

    scrollToBottom() {
        const area = document.getElementById('messagesArea');
        if (area) area.scrollTop = area.scrollHeight;
    }

    // ===========================================
    // View Logic - Global Widget
    // ===========================================
    renderWidget() {
        if (!this.widgetContainer) {
            this.widgetContainer = document.createElement('div');
            this.widgetContainer.id = 'chatWidgetContainer';
            this.widgetContainer.style.cssText = 'position: fixed; bottom: 0; right: 20px; display: flex; align-items: flex-end; gap: 10px; z-index: 9999; pointer-events: none;';
            document.body.appendChild(this.widgetContainer);
        }

        this.renderWidgetTabs();
    }

    renderWidgetTabs() {
        if (!this.widgetContainer) return;

        // 1. Persistent "Messages" Bar (Freelancer Style)
        // Shows as a small black bar at the bottom right, expanding on click
        const isListOpen = this.widgetContainer.dataset.listOpen === 'true';

        const persistentBar = `
            <div id="chat-global-bar" class="chat-tab" style="width: 280px; background: #1a1a1a; border: 1px solid var(--glass-border); border-bottom: none; border-radius: 8px 8px 0 0; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; box-shadow: 0 -5px 20px rgba(0,0,0,0.5); font-family: 'Outfit', sans-serif; transition: height 0.3s; height: ${isListOpen ? '400px' : '48px'};">
                <div onclick="const p = this.parentElement; const open = p.style.height!=='48px'; p.style.height=open?'48px':'400px'; document.getElementById('chatWidgetContainer').dataset.listOpen=!open;" style="padding: 12px; background: #222; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <span style="font-weight: 600; color: white;">Mensajes</span>
                    <span style="color: #aaa; font-size: 1.2rem;">${isListOpen ? '−' : '+'}</span>
                </div>
                
                <div class="chat-list-area" style="flex: 1; overflow-y: auto; background: #111;">
                    ${this.conversations.length > 0 ? this.conversations.map(conv => `
                        <div onclick="chatManager.openChat(${conv.otherUser.id})" style="padding: 10px; border-bottom: 1px solid #333; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.2s;" onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'">
                            <img src="${conv.otherUser.avatarUrl || 'assets/default-avatar.svg'}" style="width: 32px; height: 32px; border-radius: 50%;">
                            <div style="flex:1; overflow:hidden;">
                                <div style="font-weight: 500; font-size: 0.9rem; color: white;">${conv.otherUser.name}</div>
                                <div style="font-size: 0.8rem; color: #888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(conv.messages[0]?.message || conv.lastMessage?.message || '')}</div>
                            </div>
                        </div>
                    `).join('') : '<div style="padding: 20px; text-align: center; color: #666; font-size: 0.9rem;">No hay conversaciones recientes</div>'}
                </div>
                
                <div style="padding: 10px; border-top: 1px solid #333; text-align: center;">
                   <a href="messages.html" style="font-size: 0.8rem; color: var(--accent-purple); text-decoration: none;">Ver todo</a>
                </div>
            </div>
        `;

        // 2. Active Chat Tabs (next to the bar)
        // Show active conversation and maybe 1 other
        let chatsToShow = [];
        if (this.activeConversation) {
            chatsToShow = [this.activeConversation];
        }

        const tabsHtml = chatsToShow.map(conv => this.renderChatTab(conv)).join('');

        // Combine: Tabs (Left) + Persistent Bar (Right)
        this.widgetContainer.innerHTML = tabsHtml + persistentBar;
    }

    renderChatTab(conv) {
        const user = conv.otherUser;
        const isExpanded = this.activeConversation && this.activeConversation.otherUser.id === user.id;
        const unread = conv.unreadCount > 0;
        const tabId = `chat-tab-${user.id}`;

        if (isExpanded) {
            return `
            <div id="${tabId}" class="chat-tab expanded" style="width: 320px; height: 450px; background: #1a1a1a; border: 1px solid var(--glass-border); border-bottom: none; border-radius: 8px 8px 0 0; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; box-shadow: 0 -5px 20px rgba(0,0,0,0.5); font-family: 'Outfit', sans-serif;">
                <div onclick="chatManager.toggleTab(${user.id})" style="padding: 12px; background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
                        <span style="font-size: 0.95rem; font-weight: 600; color: white;">${user.name}</span>
                    </div>
                    <span style="color: #aaa; font-size: 1.2rem;">×</span>
                </div>
                
                <div class="mini-messages-area" style="flex: 1; overflow-y: auto; padding: 12px; font-size: 0.9rem; display: flex; flex-direction: column; gap: 8px;">
                    ${conv.messages.map(msg => `
                        <div style="display: flex; justify-content: ${msg.senderId === this.currentUser.id ? 'flex-end' : 'flex-start'};">
                            <span style="background: ${msg.senderId === this.currentUser.id ? 'var(--accent-purple)' : '#333'}; color: white; padding: 8px 12px; border-radius: 12px; max-width: 85%; word-wrap: break-word;">
                                ${msg.message}
                            </span>
                        </div>
                    `).join('')}
                </div>
                
                <form onsubmit="event.preventDefault(); chatManager.sendMiniMessage(${user.id}, this.querySelector('input').value); this.reset();" style="padding: 12px; border-top: 1px solid var(--glass-border); background: #222;">
                    <input type="text" placeholder="Envía un mensaje..." style="width: 100%; padding: 10px; border-radius: 20px; border: none; background: #333; color: white; outline: none;">
                </form>
            </div>
            `;
        }

        return `
        <div id="${tabId}" onclick="chatManager.toggleTab(${user.id})" style="pointer-events: auto; cursor: pointer; position: relative; margin-right: 5px; transition: transform 0.2s;">
            <div style="width: 54px; height: 54px; border-radius: 50%; background: #222; overflow: hidden; border: 2px solid var(--glass-border); box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
                <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            ${unread ? `<span style="position: absolute; top: 0; right: 0; background: var(--error-red); width: 14px; height: 14px; border-radius: 50%; border: 2px solid #111;"></span>` : ''}
        </div>
        `;
    }

    toggleTab(userId) {
        const conv = this.conversations.find(c => c.otherUser.id === userId);
        if (this.activeConversation && this.activeConversation.otherUser.id === userId) {
            this.activeConversation = null;
        } else {
            this.activeConversation = conv;
            this.loadHistory(userId).then(msgs => {
                if (this.activeConversation) {
                    this.activeConversation.messages = msgs;
                    this.renderWidgetTabs();
                    setTimeout(() => {
                        const area = this.widgetContainer.querySelector('.mini-messages-area');
                        if (area) area.scrollTop = area.scrollHeight;
                    }, 50);
                }
            });
        }
        this.renderWidgetTabs();
    }

    async sendMiniMessage(userId, text) {
        if (!text.trim()) return;
        await this.sendMessage(userId, text);
        // Optimistic update removed to prevent duplicates (socket handles it)
    }
    async openChat(userId) {
        // Ensure conversations are loaded
        if (this.conversations.length === 0) {
            await this.loadConversations();
        }

        const conv = this.conversations.find(c => c.otherUser.id === userId);
        if (conv) {
            this.toggleTab(userId);
        } else {
            // Create new optimistic conversation logic if needed, 
            // or just rely on sendMessage creating it on backend.
            // For now, let's try to fetch specific conversation or start fresh UI
            // But toggleTab handles existing.
            // If not existing, we might need a "Pending" tab or just force it open

            // Simplified: If not found, create a dummy one for UI
            // This requires fetching user details which we might pass or fetch
            // But for "Contact Host", we usually send a message FIRST.
            // computer-detail-dynamic.js sends message first, so conversation SHOULD exist after reload.
            // But we don't reload page.
            // Let's rely on handleNewMessage or force reload conversations
            await this.loadConversations();
            const retryConv = this.conversations.find(c => c.otherUser.id === userId);
            if (retryConv) {
                this.toggleTab(userId);
            }
        }
    }
}

// Make globally available
window.ChatManager = ChatManager;
