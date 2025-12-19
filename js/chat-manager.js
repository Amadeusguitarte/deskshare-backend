
class ChatManager {
    constructor(currentUser, socketUrl) {
        this.currentUser = currentUser;
        this.socketUrl = socketUrl;
        this.socket = null;
        this.conversations = [];
        // Multi-tab support: Track IDs of open conversations
        this.openConversationIds = [];
        this.minimizedConversations = new Set(); // Track minimized state

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

        // Load Persistence State
        this.loadState();

        // Load data
        await this.loadConversations();

        // Render
        if (this.messagesPageContainer) {
            this.renderFullPage();
        } else {
            this.renderWidget();
        }
    }

    // ===========================================
    // Persistence Logic
    // ===========================================
    loadState() {
        try {
            const state = localStorage.getItem('deskshare_chat_state');
            if (state) {
                const parsed = JSON.parse(state);
                this.openConversationIds = parsed.openIds || [];
                // AUTO-MINIMIZE ON NAV: User wants chat to "stay but be minimized" when changing pages
                // So when we load state (new page load), we treat all open tabs as minimized initially
                // unless the user explicitly opens them on this page.
                const storedMinimized = new Set(parsed.minimizedIds || []);

                // Add all open IDs to minimized set for this new session start
                this.openConversationIds.forEach(id => storedMinimized.add(id));

                this.minimizedConversations = storedMinimized;
            }
        } catch (e) {
            console.error('Failed to load chat state', e);
        }
    }

    saveState() {
        try {
            const state = {
                openIds: this.openConversationIds,
                minimizedIds: Array.from(this.minimizedConversations)
            };
            localStorage.setItem('deskshare_chat_state', JSON.stringify(state));
        } catch (e) {
            console.error('Failed to save chat state', e);
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
        // Dedup check (keep existing logic)
        if (this.activeConversation &&
            (this.activeConversation.otherUser.id === msg.senderId || this.activeConversation.otherUser.id === msg.receiverId)) {
            const exists = this.activeConversation.messages.some(m => m.id === msg.id);
            if (exists) return; // Strict ID check
        }

        // Check ALL open tabs, not just activeConversation
        const currentUserId = parseInt(this.currentUser.id);
        const senderId = parseInt(msg.senderId);
        const receiverId = parseInt(msg.receiverId);
        const relevantUserId = (senderId === currentUserId) ? receiverId : senderId;

        // Ensure IDs are numbers
        this.openConversationIds = this.openConversationIds.map(id => parseInt(id));

        // OPTIMIZATION: Do NOT call loadConversations() on every message.
        // Only load if we don't have the conversation in memory.
        const existingConv = this.conversations.find(c => parseInt(c.otherUser.id) === relevantUserId);

        const processMessage = async () => {
            if (!existingConv) {
                await this.loadConversations();
            }

            if (this.messagesPageContainer) {
                // ... Full page logic ...
                this.renderConversationsList();
                if (this.activeConversation &&
                    (this.activeConversation.otherUser.id === msg.senderId || this.activeConversation.otherUser.id === msg.receiverId)) {
                    // For active Full Page chat, we might want to reload history or just append. 
                    // Loading history is safer for full consistency.
                    this.loadHistory(this.activeConversation.otherUser.id).then(msgs => {
                        this.activeConversation.messages = msgs;
                        this.renderMessages(msgs);
                        this.scrollToBottom();
                    });
                }
            } else {
                // WIDGET LOGIC (OPTIMIZED & STABILIZED)
                // 1. UPDATE DATA MODEL
                const conv = this.conversations.find(c => parseInt(c.otherUser.id) === relevantUserId);
                if (conv) {
                    if (!conv.messages) conv.messages = [];
                    // CRITICAL GUARD: If message already exists (e.g. from Optimistic Update), STOP.
                    // This prevents "Double Append" where both Optimistic and Socket logic add to DOM.
                    if (conv.messages.some(m => m.id === msg.id)) {
                        return; // Successfully ignored duplicate
                    }
                    conv.messages.push(msg);
                }

                // 2. DOM OPERATIONS (Direct Append)
                const tabId = `chat-tab-${relevantUserId}`;
                const tabEl = document.getElementById(tabId);
                // STRICT TYPE CHECK: ensure we don't mix "5" and 5
                const tabIsOpen = this.openConversationIds.map(Number).includes(Number(relevantUserId));

                // Auto-Open (Facebook Style)
                if (senderId !== currentUserId && !tabIsOpen) {
                    this.openConversationIds.push(relevantUserId);
                    this.renderWidgetTabs(); // Force render to open
                    // After render, we need to ensure scroll handles the new content
                    setTimeout(() => this.scrollToBottom(relevantUserId), 100);
                    return;
                }

                // If Tab is open...
                if (tabIsOpen && tabEl) {
                    const msgArea = tabEl.querySelector('.mini-messages-area');
                    if (msgArea) {
                        // View Synchronization
                        // View Synchronization
                        // STRICT DEDUP REMOVED: We allow identical messages ("2", then "2").
                        // Protection against Socket Echo is handled by memory map if needed, 
                        // but here we trust the caller (optimistic) or socket (id check).
                        const isMe = senderId === currentUserId;
                        const msgHtml = `
                            <div style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'};">
                                <span style="background: ${isMe ? 'var(--accent-purple)' : '#333'}; color: white; padding: 6px 10px; border-radius: 12px; max-width: 85%; word-wrap: break-word;">
                                    ${msg.message}
                                </span>
                            </div>
                        `;
                        msgArea.insertAdjacentHTML('beforeend', msgHtml);

                        // forceScrollToBottom handles the scroll
                        this.forceScrollToBottom(msgArea);
                    }

                    // Pulse Effect
                    if (senderId !== currentUserId) {
                        const header = tabEl.querySelector('div[onclick^="chatManager.closeTab"]');
                        if (header) {
                            header.style.animation = 'none';
                            header.offsetHeight;
                            header.style.animation = 'highlightPulse 0.5s 4';
                        }
                        const msgIcon = document.querySelector('nav svg.feather-message-square');
                        if (msgIcon) {
                            msgIcon.style.color = 'var(--accent-purple)';
                            setTimeout(() => msgIcon.style.color = '', 2000);
                        }
                    }
                } else if (tabIsOpen && !tabEl) {
                    // State says open but DOM missing -> Re-render
                    this.renderWidgetTabs();
                    // Ensure scroll is restored after re-render
                    setTimeout(() => this.scrollToBottom(relevantUserId), 100);
                }

                // GLOBAL SYNC
                window.dispatchEvent(new CustomEvent('chat:sync', { detail: msg }));

                // 3. UPDATE LIST PREVIEW
                this.updateGlobalPreviews(relevantUserId, msg);

                // Update Data Unread Count
                const totalUnread = this.conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
                this.updateGlobalBadge(totalUnread);
            }
        };

        processMessage();
    }

    forceScrollToBottom(element) {
        if (!element) return;
        // Method 1: Immediate
        // We use direct assignment. CSS 'scroll-behavior: smooth' handles the animation.
        // Using JS scrollTo({behavior:'smooth'}) repeatedly causes "stuck" behavior.
        element.scrollTop = element.scrollHeight;

        // Method 2: Next Frame
        requestAnimationFrame(() => {
            element.scrollTop = element.scrollHeight;
        });

        // Method 3: Safety delay (catch async layout shifts)
        setTimeout(() => {
            element.scrollTop = element.scrollHeight;
        }, 100);

        setTimeout(() => {
            element.scrollTop = element.scrollHeight;
        }, 300);
    }

    scrollToBottom(userId) {
        setTimeout(() => {
            const tab = document.getElementById(userId ? `chat-tab-${userId}` : 'chatMessages');
            if (tab) {
                const area = userId ? tab.querySelector('.mini-messages-area') : tab;
                if (area) {
                    this.forceScrollToBottom(area);
                }
            }
        }, 50);
    }

    async loadConversations() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            // Deduplicate conversations by otherUser.id
            const rawConvs = data.conversations || [];
            const uniqueConvs = [];
            const seenIds = new Set();

            for (const conv of rawConvs) {
                if (!seenIds.has(conv.otherUser.id)) {
                    seenIds.add(conv.otherUser.id);
                    uniqueConvs.push(conv);
                }
            }
            this.conversations = uniqueConvs;
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
            const data = await response.json();
            return data.message; // Unwrap the message object
        } catch (error) {
            console.error('Send error:', error);
            alert(`Error: ${error.message}`);
            throw error;
        }
    }

    // Public API to open a chat
    async openChat(userId) {
        // Ensure conversations are loaded
        if (this.conversations.length === 0) await this.loadConversations();

        // Ensure Tab is tracked (Fix for Missing Widget)
        userId = parseInt(userId);
        const wasOpen = this.openConversationIds.includes(userId);
        if (!wasOpen) {
            this.openConversationIds.push(userId);
            this.saveState(); // Save explicitly
        }

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
                // Widget Logic
                // If it was minimized, un-minimize it (User Action = Open)
                if (this.minimizedConversations.has(userId)) {
                    this.minimizedConversations.delete(userId);
                    this.saveState();
                }

                // If not open or we just want to ensure it's fresh
                if (!wasOpen || true) { // FORCE RENDER to ensure logic flows
                    this.renderWidgetTabs();
                }

                // FORCE SCROLL TO BOTTOM (User Request: "Abre con el ultimo mensaje")
                // We use a stronger chain of attempts to catch any render timing issues
                const scrollTarget = () => this.scrollToBottom(userId);

                scrollTarget();
                setTimeout(scrollTarget, 50);
                setTimeout(scrollTarget, 150);
                setTimeout(scrollTarget, 300);
                setTimeout(scrollTarget, 500); // Final check
            }
        }
    }

    closeTab(userId) {
        userId = parseInt(userId);
        this.openConversationIds = this.openConversationIds.filter(id => id !== userId);
        this.minimizedConversations.delete(userId);
        this.saveState();
        this.renderWidgetTabs();
    }

    toggleMinimize(userId) {
        userId = parseInt(userId);
        if (this.minimizedConversations.has(userId)) {
            this.minimizedConversations.delete(userId);
        } else {
            this.minimizedConversations.add(userId);
        }
        this.saveState();
        this.renderWidgetTabs();

        // If maximizing, scroll to bottom
        if (!this.minimizedConversations.has(userId)) {
            setTimeout(() => this.scrollToBottom(userId), 100);
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
            // No Optimistic Update. Wait for Socket.
            await this.sendMessage(user.id, text);
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
                        <div class="sidebar-item" data-user-id="${conv.otherUser.id}" onclick="chatManager.openChat(${conv.otherUser.id})" style="padding: 10px; border-bottom: 1px solid #333; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.2s;" onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'">
                            <img src="${conv.otherUser.avatarUrl || 'assets/default-avatar.svg'}" style="width: 32px; height: 32px; border-radius: 50%;">
                            <div style="flex:1; overflow:hidden;">
                                <div style="font-weight: 500; font-size: 0.9rem; color: white;">${conv.otherUser.name}</div>
                                <div class="sidebar-last-msg" style="font-size: 0.8rem; color: #888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(conv.lastMessage?.message || '')}</div>
                            </div>
                            <div class="sidebar-unread" style="width:8px; height:8px; background:var(--accent-purple); border-radius:50%; display:${(conv.unreadCount > 0) ? 'block' : 'none'};"></div>
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
        // Always expanded in multi-tab mode for now
        const tabId = `chat-tab-${user.id}`;

        // SORT MESSAGES: Oldest -> Newest
        const sortedMessages = (conv.messages || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        return `
            <div id="${tabId}" class="chat-tab expanded" style="width: 300px; height: 400px; background: #1a1a1a; border: 1px solid var(--glass-border); border-bottom: none; border-radius: 8px 8px 0 0; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; box-shadow: 0 -5px 20px rgba(0,0,0,0.5); font-family: 'Outfit', sans-serif; margin-right: 10px;">
                <div onclick="chatManager.closeTab(${user.id})" style="padding: 10px; background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                        <span style="font-size: 0.9rem; font-weight: 600; color: white;">${user.name}</span>
                    </div>
                    <span style="color: #aaa; font-size: 1.2rem; line-height:0.8;">×</span>
                </div>
                
                <div class="mini-messages-area" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 0.85rem; display: flex; flex-direction: column; gap: 8px;">
                    ${sortedMessages.map(msg => `
                        <div style="display: flex; justify-content: ${msg.senderId === this.currentUser.id ? 'flex-end' : 'flex-start'};">
                            <span style="background: ${msg.senderId === this.currentUser.id ? 'var(--accent-purple)' : '#333'}; color: white; padding: 6px 10px; border-radius: 12px; max-width: 85%; word-wrap: break-word;">
                                ${msg.message}
                            </span>
                        </div>
                    `).join('')}
                </div>
                
                <!-- FREELANCER STYLE FOOTER -->
                <div style="padding: 12px; border-top: 1px solid #333; background: #222; display: flex; align-items: center; gap: 8px;">
                     <!-- Attach Icon -->
                    <button onclick="alert('Attachment coming soon')" style="background: none; border: none; cursor: pointer; color: #888; padding: 4px; display: flex; align-items: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                    </button>
                    
                    <!-- Input Container -->
                    <div style="flex-grow: 1; position: relative; display: flex; align-items: center;">
                        <input type="text" placeholder="Escribe un mensaje..." 
                               onkeypress="if(event.key === 'Enter') { chatManager.sendMiniMessage(${user.id}, this.value); this.value=''; }"
                               style="width: 100%; padding: 10px 36px 10px 12px; border: 1px solid #444; border-radius: 20px; outline: none; font-size: 0.9rem; background: #333; color: white;">
                        
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

    toggleTab(userId) {
        // In multi-tab mode, "toggle" means "open if not open, bring to front/focus if open"
        // Since we render side-by-side, we just ensure it's in the list.
        if (!this.openConversationIds.includes(userId)) {
            this.openConversationIds.push(userId);
        }

        // Refresh history
        this.loadHistory(userId).then(msgs => {
            const conv = this.conversations.find(c => c.otherUser.id === userId);
            if (conv) {
                conv.messages = msgs;
                this.renderWidgetTabs();
                setTimeout(() => {
                    const tab = document.getElementById(`chat-tab-${userId}`);
                    if (tab) {
                        const area = tab.querySelector('.mini-messages-area');
                        if (area) area.scrollTop = area.scrollHeight;
                    }
                }, 100);
            }
        });

        this.renderWidgetTabs();
    }

    closeTab(userId) {
        this.openConversationIds = this.openConversationIds.filter(id => id !== userId);
        this.renderWidgetTabs();
    }

    async sendMiniMessage(userId, text) {
        if (!text.trim()) return;

        // No Optimistic Update - Rely on Socket for Single Truth
        // This prevents double messages (one optimistic, one from socket)
        try {
            await this.sendMessage(userId, text);
            // Success: Socket will handle handleNewMessage.
            // Dispatch sync event just in case socket is slow
            window.dispatchEvent(new CustomEvent('chat:sync', {
                detail: {
                    senderId: this.currentUser.id,
                    receiverId: userId,
                    message: text,
                    createdAt: new Date().toISOString(),
                    id: 'temp-' + Date.now()
                }
            }));
        } catch (e) {
            console.error("Failed to send", e);
            alert("Error al enviar mensaje. Intenta de nuevo.");
        }
    }

    updateGlobalPreviews(userId, msg) {
        // 1. Update Internal Model
        const conv = this.conversations.find(c => c.otherUser.id === userId);
        if (conv) {
            conv.lastMessage = msg;

            // Logic: If I am sender, unread = 0.
            // If receiver AND tab closed, unread++.
            // If receiver AND tab open, unread stays same (or 0 if we assume read).
            if (msg.senderId === this.currentUser.id) {
                // Sent by me -> Read
                // conv.unreadCount = 0; // Don't reset to 0 immediately as backend sync might differ, but for UI feedback yes.
            } else {
                if (!this.openConversationIds.includes(userId)) {
                    conv.unreadCount = (conv.unreadCount || 0) + 1;
                }
            }
        }

        // 2. Update Header (UI Global)
        if (typeof window.renderHeaderDropdown === 'function') {
            window.renderHeaderDropdown(this.conversations);
        }

        // 3. Update Sidebar (Widget) - DOM Manipulation
        if (this.widgetContainer) {
            const item = this.widgetContainer.querySelector(`.sidebar-item[data-user-id="${userId}"]`);
            if (item) {
                // Update Text
                const msgDiv = item.querySelector('.sidebar-last-msg');
                if (msgDiv) msgDiv.textContent = msg.message;

                // Update Unread Dot
                const dot = item.querySelector('.sidebar-unread');
                if (dot && conv) {
                    dot.style.display = (conv.unreadCount > 0) ? 'block' : 'none';
                }
            }
        }
    }
}



// Make globally available
window.ChatManager = ChatManager;
