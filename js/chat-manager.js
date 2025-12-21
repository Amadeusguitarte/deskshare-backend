
class ChatManager {
    constructor(currentUser, socketUrl) {
        this.currentUser = currentUser;
        this.socketUrl = socketUrl;
        this.socket = null;
        this.conversations = [];
        // Multi-tab support: Track IDs of open conversations
        this.openConversationIds = [];
        this.minimizedConversations = new Set();
        // New Features
        this.typingUsers = new Set();
        this.typingTimeouts = {};

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

        // Typing Indicators
        this.socket.on('typing', ({ senderId }) => {
            this.typingUsers.add(senderId);
            this.renderWidgetTabs(); // Update UI
        });

        this.socket.on('stop-typing', ({ senderId }) => {
            this.typingUsers.delete(senderId);
            this.renderWidgetTabs();
        });

        // Read Receipts
        this.socket.on('messages-read', ({ readerId }) => {
            const conv = this.conversations.find(c => c.otherUser.id == readerId);
            if (conv && conv.messages) {
                // Mark all messages as read
                conv.messages.forEach(m => m.isRead = true);
                if (this.activeConversation && this.activeConversation.otherUser.id == readerId) {
                    this.renderMessages(this.activeConversation.messages);
                }
                this.renderWidgetTabs();
            }
        });
    }

    handleNewMessage(msg) {
        // 1. Identify Target
        // Use loose equality for IDs to be safe
        let targetUserId = (msg.senderId == this.currentUser.id) ? msg.receiverId : msg.senderId;

        // 2. Find Conversation or Create Dummy
        let conv = this.conversations.find(c => c.otherUser.id == targetUserId);

        if (!conv) {
            // If completely missing, we have to load to get metadata (name, avatar).
            this.loadConversations().then(() => {
                // Retry
                let retryConv = this.conversations.find(c => c.otherUser.id == targetUserId);
                if (retryConv) {
                    this.handleNewMessage(msg);
                }
            });
            return; // Stop here, wait for reload
        }

        // 3. Dedup & Optimistic Merge
        if (!conv.messages) conv.messages = [];

        // Check if it's a duplicate of an existing REAL message
        if (conv.messages.some(m => m.id == msg.id)) {
            return;
        }

        // OPTIMISTIC MERGE FIX (v162)
        // Check if this incoming real message corresponds to a temporary optimistic message we just pushed.
        // If matches, we REPLACE the temp message with this real one, preventing duplicates.
        let wasMerge = false;
        const lastMsg = conv.messages[conv.messages.length - 1];
        if (msg.senderId == this.currentUser.id &&
            lastMsg &&
            String(lastMsg.id).startsWith('temp-') &&
            lastMsg.message === msg.message) {

            // It's a match! Replace the temp placeholder with the real confirmed message.
            // This prevents the "Double Bubble" issue.
            conv.messages[conv.messages.length - 1] = msg;
            wasMerge = true;
        } else {
            // standard append
            conv.messages.push(msg);
        }

        // 5. Update Metadata
        conv.lastMessage = msg;
        if (msg.receiverId == this.currentUser.id) conv.unreadCount = (conv.unreadCount || 0) + 1;

        // 6. Manual Reorder (Move to top)
        const idx = this.conversations.indexOf(conv);
        if (idx > 0) {
            this.conversations.splice(idx, 1);
            this.conversations.unshift(conv);
        }

        // 7. Render
        if (this.messagesPageContainer) {
            this.renderConversationsList();
            if (this.activeConversation && this.activeConversation.otherUser.id == targetUserId) {
                this.renderMessages(this.activeConversation.messages);
                this.scrollToBottom();
            }
        } else {
            // Widget Mode
            // FIX: If it was a merge (confirmation), the UI is already correct (optimistic).
            // We SKIP re-rendering to prevent killing the input focus.
            if (!wasMerge) {
                this.renderWidgetTabs();
            } else {
                console.log('Skipping render for merge confirmation to preserve focus');
            }
        }
    }

    async loadConversations() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Pragma': 'no-cache', 'Cache-Control': 'no-store' }
            });
            const data = await response.json();
            // Deduplicate conversations by otherUser.id
            const rawConvs = data.conversations || [];
            const uniqueConvs = [];
            const seenIds = new Set();

            for (const conv of rawConvs) {
                if (!seenIds.has(conv.otherUser.id)) {
                    seenIds.add(conv.otherUser.id);

                    // PRESERVE HISTORY FIX:
                    // Check if we already have messages for this user in memory
                    // and copy them over so we don't wipe the UI while loading.
                    // FIX: Loose equality for ID check
                    const existing = this.conversations.find(c => c.otherUser.id == conv.otherUser.id);
                    if (existing && existing.messages) {
                        conv.messages = existing.messages;
                    }

                    uniqueConvs.push(conv);
                }
            }
            // Sort: Newest First (Sort by last message created at)
            uniqueConvs.sort((a, b) => {
                const dateA = new Date(a.lastMessage?.createdAt || 0);
                const dateB = new Date(b.lastMessage?.createdAt || 0);
                return dateB - dateA;
            });
            this.conversations = uniqueConvs;

            // Sync UI with new data
            if (this.messagesPageContainer) {
                this.renderConversationsList();
            } else {
                this.renderWidgetTabs();
            }

        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }

    async loadHistory(userId) {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_BASE_URL}/chat/history/${userId}?t=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Pragma': 'no-cache', 'Cache-Control': 'no-store' }
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
            const data = await response.json();
            // FIX: Backend returns { message: { ... } }, so we must unwrap it
            if (data.message && typeof data.message === 'object' && !Array.isArray(data.message)) {
                return data.message;
            }
            return data;
        } catch (error) {
            console.error('Send error:', error);
            alert(`Error: ${error.message}`);
            throw error; // Re-throw so caller knows it failed
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

        // Mark as Read (Full Page)
        conv.unreadCount = 0;
        this.socket.emit('mark-read', { senderId: this.currentUser.id, receiverId: userId });
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
        messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
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

        // FOCUS PROTECTION: Capture which input is focused before we destroy the DOM
        let focusedTabId = null;
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            const tabEl = document.activeElement.closest('.chat-tab');
            if (tabEl && tabEl.id.startsWith('chat-tab-')) {
                focusedTabId = tabEl.id;
            }
        }

        // 1. Persistent "Messages" Bar (Freelancer Style)
        const isListOpen = this.widgetContainer.dataset.listOpen === 'true';

        // Calculate total unread for badge
        const totalUnread = this.conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
        this.updateGlobalBadge(totalUnread);

        const persistentBar = `
            <div id="chat-global-bar" class="chat-tab" style="width: 280px; background: #1a1a1a; border: 1px solid var(--glass-border); border-bottom: none; border-radius: 8px 8px 0 0; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; box-shadow: 0 -5px 20px rgba(0,0,0,0.5); font-family: 'Outfit', sans-serif; transition: height 0.3s; height: ${isListOpen ? '400px' : '48px'}; margin-left: 10px;">
                <div onclick="const p = this.parentElement; const open = p.style.height!=='48px'; p.style.height=open?'48px':'400px'; document.getElementById('chatWidgetContainer').dataset.listOpen=!open;" style="padding: 12px; background: #222; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight: 600; color: white;">Mensajes</span>
                        ${totalUnread > 0 ? `<span style="background:var(--error-red); color:white; font-size:0.7rem; padding: 2px 6px; border-radius:10px;">${totalUnread}</span>` : ''}
                    </div>
                    <span style="color: #aaa; font-size: 1.2rem;">${isListOpen ? '−' : '+'}</span>
                </div>
                
                <div class="chat-list-area" style="flex: 1; overflow-y: auto; background: #111;">
                    ${this.conversations.length > 0 ? this.conversations.map(conv => `
                        <div onclick="chatManager.openChat(${conv.otherUser.id})" style="padding: 10px; border-bottom: 1px solid #333; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.2s;" onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'">
                            <img src="${conv.otherUser.avatarUrl || 'assets/default-avatar.svg'}" style="width: 32px; height: 32px; border-radius: 50%;">
                            <div style="flex:1; overflow:hidden;">
                                <div style="font-weight: 500; font-size: 0.9rem; color: white;">${conv.otherUser.name}</div>
                                <div style="font-size: 0.8rem; color: #888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(conv.lastMessage?.message || '')}</div>
                            </div>
                            ${(conv.unreadCount > 0) ? `<div style="width:8px; height:8px; background:var(--accent-purple); border-radius:50%;"></div>` : ''}
                        </div>
                    `).join('') : '<div style="padding: 20px; text-align: center; color: #666; font-size: 0.9rem;">No hay conversaciones recientes</div>'}
                </div>
                
                <div style="padding: 10px; border-top: 1px solid #333; text-align: center;">
                   <a href="messages.html" style="font-size: 0.8rem; color: var(--accent-purple); text-decoration: none;">Ver todo</a>
                </div>
            </div>
        `;

        // 2. Render Active Tabs
        // We render ALL IDs in openConversationIds
        const maxTabs = 3; // Limit visible tabs to prevent crowding
        const tabsToRender = this.openConversationIds.slice(0, maxTabs);

        const tabsHtml = tabsToRender.map(id => {
            const conv = this.conversations.find(c => c.otherUser.id === id);
            return conv ? this.renderChatTab(conv) : '';
        }).join('');

        // Combine: Tabs (Left) + Persistent Bar (Right)
        this.widgetContainer.innerHTML = tabsHtml + persistentBar;

        // RESTORE FOCUS: If we had focus, put it back
        if (focusedTabId) {
            const newTab = document.getElementById(focusedTabId);
            if (newTab) {
                const input = newTab.querySelector('input');
                if (input) {
                    input.focus();
                    // Optional: Restore cursor to end if needed, but usually empty after send.
                }
            }
        }

        // POST-RENDER SCROLL FIX
        // Immediately scroll all chat areas to bottom to prevent visual jumping
        // This replaces the "opacity: 0" hack which was causing invisible chats
        this.widgetContainer.querySelectorAll('.mini-messages-area').forEach(area => {
            area.scrollTop = area.scrollHeight;
        });
    }

    updateGlobalBadge(count) {
        const badges = document.querySelectorAll('#navMsgBadge, #navUnreadBadge');
        badges.forEach(el => {
            if (count > 0) {
                el.innerText = count > 99 ? '99+' : count;
                el.style.display = 'flex'; // or inline-block depending on css. flex allows centering
            } else {
                el.style.display = 'none';
            }
        });
    }

    renderChatTab(conv) {
        const user = conv.otherUser;
        const tabId = `chat-tab-${user.id}`;
        // Check state to persist minimization
        const isMin = this.minimizedConversations.has(user.id);
        const height = isMin ? '50px' : '400px';
        const borderRadius = isMin ? '8px' : '8px 8px 0 0';
        const minIcon = isMin ? '' : '−'; // No '+' icon per user request

        // SORT MESSAGES: Oldest -> Newest
        const sortedMessages = (conv.messages || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        return `
            <div id="${tabId}" class="chat-tab expanded" style="width: 300px; height: ${height}; background: #1a1a1a; border: 1px solid var(--glass-border); border-bottom: none; border-radius: ${borderRadius}; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; box-shadow: 0 -5px 20px rgba(0,0,0,0.5); font-family: 'Outfit', sans-serif; margin-right: 10px; transition: height 0.3s ease, border-radius 0.3s ease;">
                <!-- HEADER -->
                <div style="padding: 10px 12px; background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer; height: 50px; box-sizing: border-box;" onclick="chatManager.toggleMinimize(${user.id})">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.95rem; font-weight: 600; color: white; line-height: 1;">${user.name}</span>
                            <span style="font-size: 0.7rem; color: #aaa; line-height: 1; margin-top: 2px;">En línea</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <span class="minimize-icon" style="color: #aaa; font-size: 1.4rem; font-weight: 400; line-height: 0.6; padding-bottom: 4px;" title="Minimizar">${minIcon}</span>
                        <span onclick="event.stopPropagation(); chatManager.closeTab(${user.id})" style="color: #aaa; font-size: 1.2rem; line-height: 1;" title="Cerrar">×</span>
                    </div>
                </div>
                
                <!-- MESSAGES AREA (Visible by default) -->
                <div id="msg-area-${user.id}" class="mini-messages-area" style="flex: 1; overflow-y: auto; padding: 12px; font-size: 0.9rem; display: flex; flex-direction: column; gap: 8px;">
                    ${sortedMessages.map(msg => `
                        <div style="display: flex; justify-content: ${msg.senderId === this.currentUser.id ? 'flex-end' : 'flex-start'};">
                            <div style="display:flex; flex-direction:column; align-items: ${msg.senderId === this.currentUser.id ? 'flex-end' : 'flex-start'}; max-width: 85%;">
                                <span style="background: ${msg.senderId === this.currentUser.id ? 'var(--accent-purple)' : '#333'}; color: white; padding: 8px 12px; border-radius: 12px; word-wrap: break-word; font-size: 0.9rem;">
                                    ${msg.message}
                                </span>
                                ${msg.senderId === this.currentUser.id && msg.isRead ? '<span style="font-size:0.65rem; color:#aaa; margin-top:2px;">Visto</span>' : ''}
                            </div>
                        </div>
                    `).join('')}
                    
                    ${this.typingUsers.has(user.id) ? `
                        <div style="display: flex; justify-content: flex-start;">
                            <span style="background: #333; color: #888; padding: 8px 12px; border-radius: 12px; font-size: 0.8rem; font-style: italic;">
                                Escribiendo...
                            </span>
                        </div>
                    ` : ''}
                </div>
                
                <!-- FOOTER (Freelancer Style with Icons) -->
                <div class="chat-footer" style="padding: 12px; border-top: 1px solid #333; background: #222; display: flex; align-items: center; gap: 8px;">
                     <!-- Attach Icon -->
                    <button onclick="alert('Attachment coming soon')" style="background: none; border: none; cursor: pointer; color: #888; padding: 4px; display: flex; align-items: center; transition: color 0.2s;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                    </button>
                    
                    <!-- Input Container -->
                    <div style="flex-grow: 1; position: relative; display: flex; align-items: center;">
                        <input type="text" placeholder="Escribe un mensaje..." 
                               onkeypress="if(event.key === 'Enter') { chatManager.sendMiniMessage(${user.id}, this.value); this.value=''; } else { chatManager.emitTyping(${user.id}); }"
                               style="width: 100%; padding: 10px 36px 10px 12px; border: 1px solid #444; border-radius: 20px; outline: none; font-size: 0.9rem; background: #333; color: white; transition: border-color 0.2s;">
                        
                        <!-- Emoji Icon -->
                        <button onclick="alert('Emoji picker coming soon')" style="position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #888; display: flex; align-items: center;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                        </button>
                    </div>

                    <!-- Send Icon -->
                    <button onclick="const inp = this.previousElementSibling.querySelector('input'); if(inp.value.trim()) { chatManager.sendMiniMessage(${user.id}, inp.value); inp.value=''; }" 
                            style="background: none; border: none; cursor: pointer; color: var(--accent-purple); padding: 4px; display: flex; align-items: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </div>
        `;
    }

    toggleMinimize(userId) {
        // 1. Update State
        const isMin = this.minimizedConversations.has(userId);
        if (isMin) {
            this.minimizedConversations.delete(userId);
        } else {
            this.minimizedConversations.add(userId);
        }

        // 2. Direct DOM Manipulation (CSS Transition)
        const tab = document.getElementById(`chat-tab-${userId}`);
        if (tab) {
            const newMin = !isMin; // Toggle logic
            tab.style.height = newMin ? '50px' : '400px';
            // If minimized, radius 8px all around. If expanded, 8px 8px 0 0.
            tab.style.borderRadius = newMin ? '8px' : '8px 8px 0 0';

            // Toggle Icon
            const icon = tab.querySelector('.minimize-icon');
            if (icon) icon.textContent = newMin ? '' : '−';

            // Important: When expanding, enforce scroll to bottom
            if (!newMin) {
                setTimeout(() => this.scrollToBottom(userId), 300); // Wait for transition
            }
        }
    }

    // Updated toggleTab
    toggleTab(userId) {
        if (!this.openConversationIds.includes(userId)) {
            this.openConversationIds.push(userId);
        }
        // Ensure not minimized on open
        this.minimizedConversations.delete(userId);

        this.loadHistory(userId).then(fetchedMsgs => {
            const conv = this.conversations.find(c => c.otherUser.id == userId);
            if (conv) {
                // SAFE MERGE STRATEGY:
                // Don't just overwrite. DB might be slightly behind local optimistic state.
                const currentMsgs = conv.messages || [];
                // Mark as Read (Widget)
                if (conv.unreadCount > 0) {
                    conv.unreadCount = 0;
                    this.socket.emit('mark-read', { senderId: this.currentUser.id, receiverId: userId });
                }

                const mergedMap = new Map();

                // 1. Add Fetched (DB) Messages (Source of Truth)
                fetchedMsgs.forEach(m => mergedMap.set(String(m.id), m));

                // 2. Add Local (Optimistic) Messages that aren't in DB yet
                currentMsgs.forEach(m => {
                    const id = String(m.id);
                    if (!mergedMap.has(id)) {
                        mergedMap.set(id, m);
                    }
                });

                // 3. Convert back to array
                conv.messages = Array.from(mergedMap.values());

                this.renderWidgetTabs();
            }
        });
        this.renderWidgetTabs();
    }

    // Updated scrollToBottom to support ID targeting and minimized check
    scrollToBottom(userId) {
        if (userId && this.minimizedConversations.has(userId)) return;

        const area = userId ? document.getElementById(`msg-area-${userId}`) : document.getElementById('messagesArea');
        if (area) {
            area.scrollTop = area.scrollHeight;
            // Ensure opacity is 1 if it was hidden
            if (area.style.opacity === '0') area.style.opacity = '1';
        }
    }

    closeTab(userId) {
        this.openConversationIds = this.openConversationIds.filter(id => id !== userId);
        this.minimizedConversations.delete(userId); // Cleanup
        this.renderWidgetTabs();
    }

    async sendMiniMessage(userId, text) {
        if (!text.trim()) return;

        const conv = this.conversations.find(c => c.otherUser.id === userId);
        if (conv) {
            const tempMsg = {
                id: 'temp-' + Date.now(),
                senderId: this.currentUser.id,
                message: text,
                createdAt: new Date().toISOString(),
                isRead: false
            };
            if (!conv.messages) conv.messages = [];
            conv.messages.push(tempMsg);

            const tabId = `chat-tab-${userId}`;
            const tabEl = document.getElementById(tabId);

            if (tabEl) {
                const msgArea = tabEl.querySelector('.mini-messages-area');
                if (msgArea) {
                    const msgHtml = `
                        <div style="display: flex; justify-content: flex-end;">
                            <span style="background: var(--accent-purple); color: white; padding: 8px 12px; border-radius: 12px; max-width: 85%; word-wrap: break-word; font-size: 0.9rem;">
                                ${text}
                            </span>
                        </div>
                    `;
                    msgArea.insertAdjacentHTML('beforeend', msgHtml);
                    this.scrollToBottom(userId);
                } else {
                    this.renderWidgetTabs();
                }
            } else {
                this.renderWidgetTabs();
            }
        }

        try {
            await this.sendMessage(userId, text);
        } catch (e) {
            console.error("Failed to send", e);
        }
    }

    emitTyping(receiverId) {
        if (!this.currentUser) return;

        // Debounce
        if (this.typingTimeouts[receiverId]) {
            clearTimeout(this.typingTimeouts[receiverId]);
        } else {
            // Start typing
            this.socket.emit('user-typing', { senderId: this.currentUser.id, receiverId });
        }

        // Stop typing after 2 seconds of inactivity
        this.typingTimeouts[receiverId] = setTimeout(() => {
            this.socket.emit('user-stop-typing', { senderId: this.currentUser.id, receiverId });
            this.typingTimeouts[receiverId] = null;
        }, 2000);
    }

    async openChat(userId) {
        if (this.conversations.length === 0) await this.loadConversations();

        // Ensure tab is added
        // Fix ID check
        if (!this.openConversationIds.some(id => id == userId)) {
            this.openConversationIds.push(userId);
        }

        const conv = this.conversations.find(c => c.otherUser.id == userId);
        if (conv) {
            this.toggleTab(userId);
        } else {
            await this.loadConversations();
            this.toggleTab(userId);
        }
    }
}

// Make globally available
window.ChatManager = ChatManager;
