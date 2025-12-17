
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
        // Assuming global 'io' is available from socket.io script
        if (typeof io !== 'undefined') {
            this.socket = io(this.socketUrl);
            this.setupSocketEvents();
        } else {
            console.error('Socket.io not loaded');
        }

        // Determine if we are on the messages page or just need the widget
        this.messagesPageContainer = document.getElementById('messagesPageContainer');
        this.widgetContainer = document.getElementById('chatWidgetContainer');

        // Load initial data
        await this.loadConversations();

        // Render appropriate view
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
            console.log('New message received:', msg);
            this.handleNewMessage(msg);
        });

        this.socket.on('new-message', (msg) => {
            // Handle computer-specific room messages if needed
            // Usually treated same as private-message for the widget
            this.handleNewMessage(msg);
        });
    }

    handleNewMessage(msg) {
        // 1. Play sound?
        // 2. Update conversation list
        // 3. If conversation active, append message
        // 4. If not active, show notification badge

        // Refresh conversations to get latest order/unread count
        // Optimization: Manually update local state instead of full fetch
        this.loadConversations().then(() => {
            if (this.messagesPageContainer) {
                this.renderConversationsList();
                if (this.activeConversation &&
                    (this.activeConversation.otherUser.id === msg.senderId || this.activeConversation.otherUser.id === msg.receiverId)) {
                    this.renderMessages(this.activeConversation.messages); // Simplistic refresh
                    this.scrollToBottom();
                }
            } else {
                this.renderWidgetTabs();
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

            if (!response.ok) throw new Error('Failed to send');

            // Optimistic update done via socket event usually, 
            // but we can also manually append if network is slow
            return await response.json();
        } catch (error) {
            console.error('Send error:', error);
            alert('Error al enviar mensaje');
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
                        <!-- Messages go here -->
                        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-direction: column;">
                            <span style="font-size: 3rem; margin-bottom: 1rem;">💬</span>
                            <p>Tus conversaciones en un solo lugar</p>
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

        list.innerHTML = this.conversations.map(conv => {
            const user = conv.otherUser;
            const lastMsg = conv.messages[conv.messages.length - 1];
            const time = new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
                            ${lastMsg.senderId === this.currentUser.id ? 'Tú: ' : ''}${lastMsg.message}
                        </span>
                        ${conv.unreadCount > 0 ? `<span style="background: var(--accent-purple); color: white; font-size: 0.75rem; padding: 2px 6px; border-radius: 10px;">${conv.unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    async selectConversation(userId) {
        // Find local logic or fetch fresh
        const conv = this.conversations.find(c => c.otherUser.id === userId);
        const user = conv ? conv.otherUser : null; // Handle new chat case later

        if (!user) return; // TODO: Handle "New Chat"

        this.activeConversation = conv;
        this.renderConversationsList(); // Update active state

        // Load full history
        const messages = await this.loadHistory(user.id);
        this.activeConversation.messages = messages; // Update local cache

        // Update Header
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
                <button class="btn btn-secondary" style="padding: 0.5rem;">💰 Ofertar</button>
            </div>
        `;

        // Enable Input
        document.getElementById('inputArea').style.display = 'block';

        // Setup Submit Handler
        const form = document.getElementById('messageForm');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById('messageInput');
            const text = input.value;
            if (!text.trim()) return;

            input.value = '';
            await this.sendMessage(user.id, text);
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
        // TODO: Implement bottom tabs for global widget
        // See Implementation Plan
    }
}
