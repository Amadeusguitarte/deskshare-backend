
class ChatManager {
    constructor(currentUser, socketUrl) {
        window.chatManagerInstance = this; // Make instance globally available for inline handlers
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
        this.stagedFiles = new Map(); // Init here explicitly
        this.isSending = false; // Lock for double-send prevention

        // UI Elements
        this.widgetContainer = null;
        this.messagesPageContainer = null;

        // Base API URL
        // If socketUrl is 'https://backend.app', API is usually 'https://backend.app/api'
        // If socketUrl is '/', API is '/api'
        this.baseUrl = this.socketUrl.endsWith('/') ? `${this.socketUrl}api` : `${this.socketUrl}/api`;
        if (this.baseUrl.includes('//api')) this.baseUrl = this.baseUrl.replace('//api', '/api'); // Sanity check

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

        // CSS Injection for Typing Animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes typingAnimation {
                0%, 100% { transform: translateY(0); opacity: 0.6; }
                50% { transform: translateY(-4px); opacity: 1; }
            }
            .typing-dot { display: block; }
        `;
        document.head.appendChild(style);

        // Determine context
        this.messagesPageContainer = document.getElementById('messagesPageContainer');
        this.widgetContainer = document.getElementById('chatWidgetContainer');

        // Load data
        await this.loadConversations();

        // Check Online Status (Now that we have users)
        if (this.socket && this.conversations.length > 0) {
            const ids = this.conversations.map(c => c.otherUser.id);
            this.socket.emit('check-status', { userIds: ids });
        }

        // Render
        if (this.messagesPageContainer) {
            this.renderFullPage();
        } else {
            // FIX: Do not render widget if we are on the messages page but container detection failed for some reason,
            // or if we just want to be extra safe.
            if (!window.location.href.includes('messages.html')) {
                this.renderWidget();
            }
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

        // Listeners for Online Status
        this.socket.on('user-online', ({ userId }) => {
            this.updateUserStatus(userId, true);
        });

        this.socket.on('user-offline', ({ userId }) => {
            this.updateUserStatus(userId, false);
        });

        this.socket.on('users-status', (statuses) => {
            Object.keys(statuses).forEach(uid => {
                this.updateUserStatus(uid, statuses[uid]);
            });
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

        // AUTO-OPEN & FLASH logic
        if (msg.senderId !== this.currentUser.id) {
            // SOUND
            this.playSound();

            // TAB NOTIFICATION (Blink Title)
            this.startTitleBlink(conv.otherUser.name);

            // AUTO-OPEN LOGIC (Improved)
            // If sender is NOT in minimized list, ensure it's in openConversationIds
            if (!this.minimizedConversations.has(msg.senderId)) {
                if (!this.openConversationIds.includes(msg.senderId)) {
                    this.openConversationIds.push(msg.senderId);
                }
            } else {
                // If minimized, DO NOT remove from minimized, DO NOT expand.
                // The renderWidgetTabs call below will update the badge.
                // We make sure it is in openConversationIds so it renders at all (minimized)
                if (!this.openConversationIds.includes(msg.senderId)) {
                    this.openConversationIds.push(msg.senderId);
                }
            }
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
                // SURGICAL UPDATE FIX: Prevent destroying input focus
                // Identify the correct "Partner" ID used for the Tab
                const partnerId = (msg.senderId === this.currentUser.id) ? msg.receiverId : msg.senderId;

                const tab = document.getElementById(`chat-tab-${partnerId}`);
                if (tab) {
                    this.updateMessagesAreaOnly(partnerId);
                    // Only update online status if it's the partner sending
                    if (partnerId === msg.senderId) {
                        this.updateUserStatus(partnerId, this.conversations.find(c => c.otherUser.id == partnerId)?.otherUser?.isOnline);
                    }
                } else {
                    this.renderWidgetTabs();
                }

                // Add FLASH Class after render
                if (msg.senderId !== this.currentUser.id) {
                    setTimeout(() => {
                        const tab = document.getElementById(`chat-tab-${msg.senderId}`);
                        if (tab) {
                            tab.classList.remove('flash-animation'); // reset
                            void tab.offsetWidth; // trigger reflow
                            tab.classList.add('flash-animation');

                            // PERSISTENT FLASH: Stays until input focus (handled in handleInputFocus)
                        }
                    }, 50);
                }
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

        // Ensure container doesn't overflow
        this.messagesPageContainer.style.overflow = 'hidden';

        this.messagesPageContainer.innerHTML = `
            <div class="chat-layout" style="display: grid; grid-template-columns: 400px 1fr; height: 100%; gap: 1.5rem; padding: 2rem; padding-bottom: 2rem; box-sizing: border-box;">
                <!--Sidebar -->
                <div class="chat-sidebar glass-card" style="display: flex; flex-direction: column; height: 100%;">
                    <div style="padding: 1rem; border-bottom: 1px solid var(--glass-border);">
                        <h2 style="margin: 0; font-size: 1.5rem;">Mensajes</h2>
                        <input type="text" placeholder="Buscar..." style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); padding: 0.5rem; width: 100%; margin-top: 1rem; border-radius: 8px; color: white;">
                    </div>
                    <div id="conversationsList" style="flex: 1; overflow-y: auto; padding: 1rem;">
                        <!-- Conversations go here -->
                    </div>
                </div>

                <!--Chat Area-->
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
                        <input type="file" id="fullPageFileInput" style="display: none;" multiple accept="image/*,application/pdf,.doc,.docx,.zip">
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
                                    <citation>M22 2L11 13</citation>
                                    <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
                                </svg>
                            </button>
                    </form>

                    <!-- Staging Area for File -->
                    <div id="fullPageStaging" style="display: none; padding-top: 10px;"></div>
                </div>
            </div>
            </div >
            `;

        this.renderConversationsList();

        // Init Full Page Emoji Picker
        const emojiBtn = document.getElementById('fullPageEmojiBtn');
        if (emojiBtn && window.EmojiButton) {
            this.picker = new EmojiButton({
                theme: 'dark',
                autoHide: false,
                position: 'top-end'
            });
            const input = document.getElementById('messageInput');

            this.picker.on('emoji', selection => {
                input.value += selection.emoji;
                input.focus();
            });

            emojiBtn.addEventListener('click', () => {
                this.picker.togglePicker(emojiBtn);
            });
        }
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
            <div class="conversation-item ${this.activeConversation && this.activeConversation.otherUser.id == user.id ? 'active' : ''}"
        onclick="chatManager.selectConversation('${user.id}')"
        style="display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; cursor: pointer; transition: background 0.2s; margin-bottom: 6px; background: ${this.activeConversation && this.activeConversation.otherUser.id == user.id ? 'rgba(255,255,255,0.1)' : 'transparent'};">
            
            <!-- Avatar with Status Dot (Facebook Style) -->
            <div style="position: relative; width: 48px; height: 48px; flex-shrink: 0;">
                <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" onerror="this.src='assets/default-avatar.svg'" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                ${user.isOnline ? `
                <div style="
                    position: absolute;
                    bottom: 2px;
                    right: 2px;
                    width: 12px;
                    height: 12px;
                    background: #4ade80;
                    border-radius: 50%;
                    border: 2px solid #1a1a1a; /* Dark border to separate from avatar */
                    box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
                "></div>` : ''}
                <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                    <!-- Row 1: Name, Time & Badge -->
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: baseline; gap: 8px; overflow: hidden; flex: 1;">
                            <span style="font-weight: 600; color: white; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${user.name || 'Usuario'}</span>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap;">${time}</span>
                        </div>
                        ${conv.unreadCount > 0 ? `<span style="background: var(--accent-purple); color: white; font-size: 0.75rem; font-weight: bold; min-width: 20px; height: 20px; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 0 6px; margin-left: 8px; flex-shrink: 0;">${conv.unreadCount}</span>` : ''}
                    </div>
                    
                    <!-- Row 2: Message Preview -->
                    <div style="display: flex; justify-content: flex-start; align-items: center;">
                        <span style="font-size: 0.85rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                            ${lastMsg ? (lastMsg.senderId === this.currentUser.id ? 'Tú: ' : '') + (lastMsg.message || (lastMsg.fileUrl ? (lastMsg.fileType === 'image' ? '📷 Foto' : '📄 Archivo') : '')) : 'Nuevo chat'}
                        </span>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    }

    async selectConversation(userId) {
        // Loose equality to handle '5' vs 5 from HTML attributes
        let conv = this.conversations.find(c => c.otherUser.id == userId);
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

        document.getElementById('inputArea').style.display = 'block';

        // Re-init Staging Logic for Full Page
        const stagingArea = document.getElementById('fullPageStaging');
        const fileInput = document.getElementById('fullPageFileInput');
        let stagedFile = null;

        if (fileInput) {
            fileInput.value = ''; // Reset
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // Validate (5MB)
                if (file.size > 5 * 1024 * 1024) {
                    alert('El archivo es demasiado grande (Máx 5MB)');
                    return;
                }

                stagedFile = file;
                const isImage = file.type.startsWith('image/');

                stagingArea.style.display = 'block';
                stagingArea.innerHTML = `
            <div style="background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 10px; border: 1px solid var(--glass-border);">
                ${isImage ?
                        `<img src="${URL.createObjectURL(file)}" style="width: 30px; height: 30px; border-radius: 4px; object-fit: cover;">` :
                        `<span style="font-size: 1.2rem;">📄</span>`
                    }
                        <span style="font-size: 0.9rem; color: white; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
                        <button type="button" id="removeStagedBtn" style="background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 1.1rem; margin-left: 5px;">×</button>
                    </div>
            `;

                document.getElementById('removeStagedBtn').onclick = () => {
                    stagedFile = null;
                    fileInput.value = '';
                    stagingArea.innerHTML = '';
                    stagingArea.style.display = 'none';
                };
            };
        }

        // FOCUS FIX: Focus input immediately after selection
        setTimeout(() => {
            const msgInput = document.getElementById('messageInput');
            if (msgInput) {
                msgInput.focus();
                msgInput.click(); // Force active
            }
            // Mark read immediately when selecting conversation
            if (this.activeConversation) {
                const userId = this.activeConversation.otherUser.id;
                this.handleInputFocus(userId);
            }
        }, 100);

        const form = document.getElementById('messageForm');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById('messageInput');
            const text = input.value;

            if (!text.trim() && !stagedFile) return;

            // Handle File Upload if present
            let fileUrl = null;
            let fileType = null;

            if (stagedFile) {
                // Optimistic UI for Upload? No, wait for it.
                try {
                    const uploadData = await this.uploadFile(userId, stagedFile); // Reuse logic? Need confirm it returns URL
                    // Actually existing uploadFile method does everything. Let's create a Helper or just use Cloudinary logic directly if needed.
                    // Wait, existing uploadFile is specific to Widgets? 
                    // Let's check renderChatTab's uploadFile... it's `uploadFile(userId, file)` -> returns {url, type}

                    const uploadRes = await this.uploadFile(userId, stagedFile);
                    fileUrl = uploadRes.url;
                    fileType = uploadRes.type;

                } catch (err) {
                    console.error('Upload failed', err);
                    alert('Error al subir archivo');
                    return;
                }
            }

            input.value = '';

            // Send Message (using update sendMiniMessage which now supports attachments)
            // But wait, sendMiniMessage is for widgets? No, it's just a method name.
            // Let's use `sendMessage` for consistency? No, sendMessage doesn't support files in previous signature?
            // Let's double check sendMessage vs sendMiniMessage. 
            // `sendMessage(receiverId, text, computerId = null)` vs `sendMiniMessage(receiverId, text, fileUrl, fileType)`
            // We should use `sendMiniMessage` logic or update `sendMessage` to support files. 
            // Since `sendMiniMessage` was updated in previous steps to support files, let's use that one or alias it.
            // ACTUALLY, checking `sendMessage` (line 293), it DOES NOT support files yet.
            // `sendMiniMessage` (line 1434) DOES support files. 
            // So we call `sendMiniMessage`.

            if (this.isSending) return;
            this.isSending = true;

            // ABSOLUTE IMMEDIACY: Clear and Opt-Update BEFORE network
            input.value = '';
            // Clear Staging
            stagedFile = null;
            if (fileInput) fileInput.value = '';
            if (stagingArea) {
                stagingArea.innerHTML = '';
                stagingArea.style.display = 'none';
            }
            // Optimistic UI
            const newMsg = {
                id: 'temp-' + Date.now(),
                senderId: this.currentUser.id,
                message: text,
                fileUrl,
                fileType,
                createdAt: new Date().toISOString()
            };

            this.activeConversation.messages.push(newMsg);
            this.renderMessages(this.activeConversation.messages); // Re-render full list
            this.scrollToBottom();

            // Refocus Immediately
            const msgInput = document.getElementById('messageInput');
            if (msgInput) msgInput.focus();

            try {
                await this.sendMiniMessage(user.id, text, fileUrl, fileType);
            } finally {
                this.isSending = false;
            }
        };

        this.renderMessages(messages);
        this.scrollToBottom();
    }

    renderMessages(messages) {
        messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const area = document.getElementById('messagesArea');
        if (!area) return;

        // Use the Shared Render Logic
        area.innerHTML = this.renderMessageHTML(messages, this.activeConversation.otherUser);
    }

    scrollToBottom() {
        const area = document.getElementById('messagesArea');
        if (area) area.scrollTop = area.scrollHeight;
    }

    // ===========================================
    // View Logic - Global Widget
    // ===========================================
    renderWidget() {
        // STRICT BLOCK: Never render widget on messages.html
        if (window.location.href.includes('messages.html') || document.getElementById('messagesPageContainer')) {
            return;
        }

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
                        <div id="widget-list-item-${conv.otherUser.id}" onclick="chatManager.openChat(${conv.otherUser.id})" style="padding: 10px; border-bottom: 1px solid #333; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.2s;" onmouseover="this.style.background='#222'" onmouseout="this.style.background='transparent'">
                            <img src="${conv.otherUser.avatarUrl || 'assets/default-avatar.svg'}" onerror="this.src='assets/default-avatar.svg'" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                            <div style="flex:1; overflow:hidden;">
                                <div style="font-weight: 500; font-size: 0.9rem; color: white; display: flex; align-items: center; gap: 6px;">
                                    ${conv.otherUser.name}
                                    <div class="list-status-dot" style="width: 8px; height: 8px; background: #4ade80; border-radius: 50%; display: ${conv.otherUser.isOnline ? 'block' : 'none'}; box-shadow: 0 0 5px #4ade80;"></div>
                                </div>
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
                // OVERRIDE: Use cssText to forcefully reset styles and apply "Pill" shape
                el.style.cssText = `
                    display: flex !important;
                    position: absolute !important;
                    top: -4px !important;
                    right: -4px !important;
                    background: var(--error-red, #ef4444) !important;
                    color: white !important;
                    border: 2px solid white !important;
                    border-radius: 10px !important;
                    min-width: 18px !important;
                    height: 18px !important;
                    padding: 0 4px !important;
                    font-size: 10px !important;
                    font-weight: bold !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-sizing: border-box !important;
                    width: auto !important;
                    z-index: 100 !important;
                `;
                el.innerText = count > 99 ? '99+' : count;
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
        const minIcon = isMin ? '' : '−';

        // SORT MESSAGES: Oldest -> Newest
        const sortedMessages = (conv.messages || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const unreadCount = conv.unreadCount || 0;

        // Ensure "Desconectado" never appears. Use empty string.
        const statusText = user.isOnline ? 'En línea' : '';
        const statusColor = user.isOnline ? '#4ade80' : 'transparent';

        return `
            <div id="${tabId}" class="chat-tab expanded ${unreadCount > 0 ? 'flash-animation' : ''}" style="width: 300px; height: ${height}; background: #1a1a1a; border: 1px solid var(--glass-border); border-bottom: none; border-radius: ${borderRadius}; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; box-shadow: 0 -5px 20px rgba(0,0,0,0.5); font-family: 'Outfit', sans-serif; margin-right: 10px; transition: height 0.3s ease, border-radius 0.3s ease;">
                 <!--HEADER -->
                <div style="padding: 10px 12px; background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer; height: 50px; box-sizing: border-box;" onclick="window.safeMinimize(${user.id})">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <!-- AVATAR CONTAINER (RELATIVE) -->
                    <div style="position: relative; width: 32px; height: 32px;">
                        <img src="${user.avatarUrl || 'assets/default-avatar.svg'}" onerror="this.src='assets/default-avatar.svg'" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                        
                        <!-- STATUS DOT (ABSOLUTE) -->
                        ${user.isOnline ? `
                        <div style="
                            position: absolute;
                            bottom: 0;
                            right: 0;
                            width: 10px;
                            height: 10px;
                            background: #4ade80;
                            border-radius: 50%;
                            border: 2px solid #2a2a2a; /* Matches header dark bg */
                            box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
                        "></div>
                        ` : ''}
                    </div>

                    <div style="display: flex; flex-direction: column; justify-content: center;">
                         <span style="font-size: 0.95rem; font-weight: 600; color: white; line-height: 1;">${user.name || 'Usuario'}</span>
                         <span class="user-status-text" style="font-size: 0.7rem; color: ${user.isOnline ? '#4ade80' : '#888'}; line-height: 1; margin-top: 3px;">${statusText}</span>
                    </div>
                </div>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        ${unreadCount > 0 ? `<span class="unread-badge" style="background: var(--error-red, #ef4444); color: white; border-radius: 12px; padding: 2px 8px; font-size: 0.75rem; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.3); min-width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">${unreadCount}</span>` : ''}
                        <span class="minimize-icon" style="color: #aaa; font-size: 1.4rem; font-weight: 400; line-height: 0.6; padding-bottom: 4px;" title="Minimizar">${minIcon}</span>
                        <span onclick="event.stopPropagation(); window.safeCloseTab(${user.id})" style="color: #aaa; font-size: 1.2rem; line-height: 1;" title="Cerrar">×</span>
                    </div>
                </div>
                
                <!--MESSAGES AREA-->
                <div id="msg-area-${user.id}" class="mini-messages-area" style="flex: 1; overflow-y: auto; padding: 12px; font-size: 0.9rem; display: flex; flex-direction: column; gap: 8px;">
                    ${this.renderMessageHTML(sortedMessages, user)}
                    
                    ${this.typingUsers.has(user.id) ? `
                        <div style="display: flex; justify-content: flex-start; margin-bottom: 8px;">
                            <div style="background: #333; padding: 8px 12px; border-radius: 12px; border-bottom-left-radius: 4px; display: flex; align-items: center; gap: 3px; width: fit-content;">
                                <span class="typing-dot" style="width: 5px; height: 5px; background: #888; border-radius: 50%; animation: typingAnimation 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></span>
                                <span class="typing-dot" style="width: 5px; height: 5px; background: #888; border-radius: 50%; animation: typingAnimation 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></span>
                                <span class="typing-dot" style="width: 5px; height: 5px; background: #888; border-radius: 50%; animation: typingAnimation 1.4s infinite ease-in-out both;"></span>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <!--FOOTER -->
            <div class="chat-footer" style="padding: 12px; border-top: 1px solid #333; background: #222; display: flex; flex-direction: column; gap: 8px;">

                <!-- STAGING AREA (Preview) -->
                <div id="chat-staging-${user.id}" style="display: none; padding: 8px; background: #333; border-radius: 8px; margin-bottom: 4px; align-items: center; justify-content: space-between;">
                    <div id="chat-staging-content-${user.id}" style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                        <!-- Content injected by JS -->
                    </div>
                    <button onclick="chatManager.clearStaging(${user.id})" style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 1.2em;">&times;</button>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                    <!-- Attach Icon -->
                    <button onclick="window.safeTriggerUpload(${user.id})" style="background: none; border: none; cursor: pointer; color: #888; padding: 4px; display: flex; align-items: center; transition: color 0.2s;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                    </button>

                    <!-- Input Container -->
                    <div style="flex-grow: 1; position: relative; display: flex; align-items: center;">
                        <input type="text" placeholder="Escribe un mensaje..." autocomplete="off"
                            id="chat-input-${user.id}"
                            onfocus="window.safeHandleFocus(${user.id})"
                            onkeypress="if(event.key === 'Enter') { window.safeSendStagedMessage(${user.id}); } else { window.safeEmitTyping(${user.id}); }"
                            style="width: 100%; padding: 10px 36px 10px 12px; border: 1px solid #444; border-radius: 20px; outline: none; font-size: 0.9rem; background: #333; color: white; transition: border-color 0.2s;">

                            <!-- Emoji Icon -->
                            <button onclick="window.safeToggleEmoji(this, ${user.id})" style="position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #888; display: flex; align-items: center;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                            </button>
                    </div>

                    <!-- Send Icon -->
                    <button onclick="window.safeSendStagedMessage(${user.id})"
                        style="background: none; border: none; cursor: pointer; color: var(--accent-purple); padding: 4px; display: flex; align-items: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
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

            // Important: When expanding, enforce scroll to bottom AND focus input
            if (!newMin) {
                // Use the robust helper
                this.tryFocusInput(userId);
            }
        } else {
            // Fallback if DOM element missing (rare in this flow)
            this.renderWidgetTabs();
        }
    }

    // Updated toggleTab with Surgical DOM Update
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
                const currentMsgs = conv.messages || [];
                const mergedMap = new Map();

                // 1. Add Fetched (DB) Messages
                fetchedMsgs.forEach(m => mergedMap.set(String(m.id), m));

                // 2. Add Local (Optimistic) Messages
                currentMsgs.forEach(m => {
                    const id = String(m.id);
                    if (!mergedMap.has(id)) {
                        mergedMap.set(id, m);
                    }
                });

                // 3. Convert back to array
                conv.messages = Array.from(mergedMap.values());

                // CRITICAL FIX: Surgical Update
                // Do NOT call renderWidgetTabs() here. It destroys the input focus.
                this.updateMessagesAreaOnly(userId);
            }
        });

        // Initial Render (Creates the DOM)
        this.renderWidgetTabs();

        // Immediate Focus Attempt (Will succeed since DOM is created above)
        this.tryFocusInput(userId);
    }

    // New Helper: Focus Input Logic
    tryFocusInput(userId) {
        // Retry logic to ensure DOM is ready
        let attempts = 0;
        const attemptFocus = () => {
            const input = document.getElementById(`chat-input-${userId}`);
            if (input) {
                input.focus();
                input.click(); // Force active

                // Only mark read if we actually have focus (prevents phantom reads)
                if (document.activeElement === input) {
                    this.handleInputFocus(userId);
                }

                this.scrollToBottom(userId);
            } else {
                attempts++;
                if (attempts < 5) setTimeout(attemptFocus, 200);
            }
        };
        setTimeout(attemptFocus, 100);
    }

    // New Helper: Updates ONLY the message list div, leaving Input/Header intact
    updateMessagesAreaOnly(userId) {
        const msgArea = document.getElementById(`msg-area-${userId}`);
        const conv = this.conversations.find(c => c.otherUser.id == userId);
        if (msgArea && conv) {
            // Sort
            const sortedMessages = (conv.messages || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            // Update HTML
            msgArea.innerHTML = this.renderMessageHTML(sortedMessages, conv.otherUser);
            // Append Typing Indicator if needed
            if (this.typingUsers.has(userId)) {
                // Animated Typing Indicator
                msgArea.innerHTML += `
                    <div style="display: flex; justify-content: flex-start; margin-bottom: 8px;">
                        <div style="background: #333; padding: 8px 12px; border-radius: 12px; border-bottom-left-radius: 4px; display: flex; align-items: center; gap: 3px; width: fit-content;">
                            <span class="typing-dot" style="width: 5px; height: 5px; background: #888; border-radius: 50%; animation: typingAnimation 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></span>
                            <span class="typing-dot" style="width: 5px; height: 5px; background: #888; border-radius: 50%; animation: typingAnimation 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></span>
                            <span class="typing-dot" style="width: 5px; height: 5px; background: #888; border-radius: 50%; animation: typingAnimation 1.4s infinite ease-in-out both;"></span>
                        </div>
                    </div>`;
            }
            // Scroll
            this.scrollToBottom(userId);
        } else {
            // Fallback if area doesn't exist (shouldn't happen if tab is open)
            // But be careful not to infinite loop
            console.warn('Message area not found for surgical update, skipping.');
        }
    }

    // Updated scrollToBottom with Multi-Tick Force Scroll
    scrollToBottom(userId) {
        if (userId && this.minimizedConversations.has(userId)) return;

        const area = userId ? document.getElementById(`msg-area-${userId}`) : document.getElementById('messagesArea');
        if (area) {
            // 1. Immediate Scroll
            area.scrollTop = area.scrollHeight;
            if (area.style.opacity === '0') area.style.opacity = '1';

            // 2. Post-Render Scroll (catches layout shifts)
            setTimeout(() => {
                if (area) area.scrollTop = area.scrollHeight;
            }, 50);

            // 3. Image Reflow Scroll (catches fast-loading images)
            setTimeout(() => {
                if (area) area.scrollTop = area.scrollHeight;
            }, 300);
        }
    }

    closeTab(userId) {
        this.openConversationIds = this.openConversationIds.filter(id => id !== userId);
        this.minimizedConversations.delete(userId); // Cleanup
        this.renderWidgetTabs();
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
        // [Phase AV] Full Page Redirection Logic
        // If we are on the messages page, do NOT open a widget tab. 
        // Instead, switch the main view to this conversation.
        if (this.messagesPageContainer) {
            if (this.conversations.length === 0) await this.loadConversations();
            this.selectConversation(userId);

            // Also, ensure the header dropdown (if open) is closed
            // This is usually handled by the onclick event in ui-global.js, but good to be safe
            return;
        }

        // Standard Widget Mode
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

        // UX: Auto-Focus Input
        setTimeout(() => {
            const tab = document.getElementById(`chat-tab-${userId}`);
            if (tab) {
                const input = tab.querySelector('input');
                if (input) {
                    input.focus();
                    this.scrollToBottom(userId);
                }
            }
        }, 100);
    }

    updateUserStatus(userId, isOnline) {
        // Update data
        const conv = this.conversations.find(c => c.otherUser.id == userId);
        if (conv) {
            conv.otherUser.isOnline = isOnline;
        }

        // Update UI (Full Page)
        if (this.messagesPageContainer && this.activeConversation && this.activeConversation.otherUser.id == userId) {
            const headerStatus = document.querySelector('#chatHeader .header-status-text');
            const headerDot = document.querySelector('#chatHeader .header-status-dot');

            if (headerStatus) {
                headerStatus.textContent = isOnline ? 'En línea' : '';
                headerStatus.style.color = isOnline ? '#4ade80' : '#999';
            }
            if (headerDot) {
                headerDot.style.display = isOnline ? 'block' : 'none';
            }
        }

        // Update UI (Full Page List Item)
        const listDot = document.getElementById(`list-status-dot-${userId}`);
        if (listDot) {
            listDot.style.display = isOnline ? 'block' : 'none';
        }

        // Update UI (Widget Tab) - Rerender just the header if possible or full tab
        const tabHeader = document.querySelector(`#chat-tab-${userId} .user-status-text`);
        const statusDot = document.querySelector(`#chat-tab-${userId} .status-dot`);

        if (tabHeader) {
            tabHeader.textContent = isOnline ? 'En línea' : '';
            tabHeader.style.color = isOnline ? '#4ade80' : 'transparent';
        }
        if (statusDot) {
            statusDot.style.background = isOnline ? '#4ade80' : 'transparent';
            statusDot.style.boxShadow = isOnline ? '0 0 5px #4ade80' : 'none';
        }

        // Update UI (Widget List Item)
        const widgetListDot = document.querySelector(`#widget-list-item-${userId} .list-status-dot`);
        if (widgetListDot) {
            widgetListDot.style.display = isOnline ? 'block' : 'none';
        }
    }

    playSound() {
        // Simple distinct beep
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            // Nice notification chime
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);

            osc.type = 'sine';
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
            console.error("Audio error", e);
        }
    }

    // Helper for Input Focus (Read Receipt + Stop Flash + Stop Title Blink)
    handleInputFocus(userId) {
        // 1. Mark Read
        const conv = this.conversations.find(c => c.otherUser.id == userId);
        if (conv) {
            if (conv.unreadCount > 0) {
                conv.unreadCount = 0;
                this.socket.emit('mark-read', { senderId: this.currentUser.id, receiverId: userId });
                // Re-render to clear badge
                this.renderWidgetTabs();
            }
        }

        // 2. Stop Flash
        const tab = document.getElementById(`chat-tab-${userId}`);
        if (tab) {
            tab.classList.remove('flash-animation');
        }

        // 3. Stop Title Blink
        this.stopTitleBlink();
    }

    startTitleBlink(userName) {
        if (this.titleInterval) clearInterval(this.titleInterval);

        let isOriginal = false;
        const originalTitle = "DeskShare - Alquila Computadoras Potentes";
        const newTitle = `💬 Nuevo mensaje de ${userName} `;

        this.titleInterval = setInterval(() => {
            document.title = isOriginal ? newTitle : originalTitle;
            isOriginal = !isOriginal;
        }, 1000);
    }

    stopTitleBlink() {
        if (this.titleInterval) {
            clearInterval(this.titleInterval);
            this.titleInterval = null;
            document.title = "DeskShare - Alquila Computadoras Potentes";
        }
    }

    // ==========================================
    // Attachments Logic (Phase B)
    // ==========================================

    // ==========================================
    // File Upload & Staging (Phase D)
    // ==========================================
    triggerFileUpload(userId) {
        // Create hidden input dynamically if not exists
        let input = document.getElementById(`file-input-${userId}`);
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.id = `file-input-${userId}`;
            input.style.display = 'none';
            // Accept Images and Docs. Enable Multiple!
            input.accept = 'image/*,.pdf,.doc,.docx,.zip,.txt';
            input.multiple = true;
            document.body.appendChild(input);

            input.onchange = (e) => {
                if (e.target.files.length > 0) {
                    // Loop through all selected files
                    Array.from(e.target.files).forEach(file => {
                        this.uploadFile(userId, file);
                    });
                }
                input.value = ''; // Reset
            };
        }
        input.click();
    }

    async uploadFile(userId, file) {
        if (!file) return;

        // Optimistic UI feedback could go here (e.g. spinner)
        const btn = document.querySelector(`#chat-tab-${userId} .chat-footer button`);
        if (btn) btn.style.opacity = '0.5';

        try {
            const token = localStorage.getItem('authToken');
            const formData = new FormData();
            formData.append('file', file);

            // 1. Upload
            const res = await fetch(`${API_BASE_URL}/chat/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server Error: ${res.status} `);
            }
            const data = await res.json();

            // 2. STAGE THE FILE (Do not send yet)
            // Lazy Init safety check
            if (!this.stagedFiles) this.stagedFiles = new Map();

            // Get existing or init array
            let currentStaged = this.stagedFiles.get(userId) || [];
            // Ensure it's an array (migration safety from Phase D)
            if (!Array.isArray(currentStaged)) currentStaged = [currentStaged];

            currentStaged.push({
                fileUrl: data.fileUrl,
                fileType: data.fileType,
                fileName: file.name
            });
            this.stagedFiles.set(userId, currentStaged);

            // 3. Update UI
            this.renderStagingArea(userId);

            // Focus input
            const chatInput = document.getElementById(`chat-input-${userId}`);
            if (chatInput) chatInput.focus();

            return { url: data.fileUrl, type: data.fileType, name: file.name };

        } catch (error) {
            console.error('Upload Error:', error);
            alert(`Error subiendo archivo: ${error.message} `);
        } finally {
            if (btn) btn.style.opacity = '1';
        }
    }

    renderStagingArea(userId) {
        const stagingArea = document.getElementById(`chat-staging-${userId}`);
        const stagingContent = document.getElementById(`chat-staging-content-${userId}`);
        const files = this.stagedFiles.get(userId) || [];

        if (!files.length) {
            if (stagingArea) stagingArea.style.display = 'none';
            return;
        }

        if (stagingArea && stagingContent) {
            stagingArea.style.display = 'flex';
            stagingContent.innerHTML = ''; // Clear current
            stagingContent.style.overflowX = 'auto'; // Horizontal scroll

            files.forEach((file, index) => {
                const thumb = document.createElement('div');
                thumb.style.cssText = 'position: relative; display: inline-block; margin-right: 8px; flex-shrink: 0;';

                let innerHTML = '';
                if (file.fileType === 'image') {
                    innerHTML = `<img src="${file.fileUrl}" style="height: 60px; width: 60px; object-fit: cover; border-radius: 8px; border: 1px solid #555;">`;
                } else {
                    innerHTML = `
            <div style="height: 60px; width: 60px; background: #444; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px solid #555;">
                            📄
                        </div>`;
                }

                // Add Close Button (X)
                innerHTML += `
            <div onclick="chatManager.removeStagedFile(${userId}, ${index})" style="position: absolute; top: -6px; right: -6px; background: #333; border: 1px solid #555; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: white; font-size: 12px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.5);">&times;</div>
                `;

                thumb.innerHTML = innerHTML;
                stagingContent.appendChild(thumb);
            });
        }
    }

    removeStagedFile(userId, index) {
        let files = this.stagedFiles.get(userId) || [];
        if (files.length > index) {
            files.splice(index, 1);
            this.stagedFiles.set(userId, files);
            this.renderStagingArea(userId);
        }
    }

    clearStaging(userId) {
        this.stagedFiles.delete(userId);
        this.renderStagingArea(userId); // Update UI after clearing
    }

    async sendStagedMessage(userId) {
        const input = document.getElementById(`chat-input-${userId}`);
        if (!input) return;

        const text = input.value.trim();

        // Lock check
        if (this.isSending) return;
        this.isSending = true;

        try {
            // 1. CAPTURE STATE (Before Clearing)
            // Safety check
            if (!this.stagedFiles) this.stagedFiles = new Map();
            let staged = this.stagedFiles.get(userId);
            // Deep copy or reference is fine since we just read.
            if (staged && !Array.isArray(staged)) staged = [staged]; // Safety

            // 2. CHECK IF ANYTHING TO SEND
            if (!text && (!staged || staged.length === 0)) {
                this.isSending = false;
                return;
            }

            // 3. CLEAR UI (Absolute Immediacy)
            input.value = '';
            this.clearStaging(userId);
            input.focus();

            // 4. PROCESS UPLOAD (Using captured 'staged')
            // Logic: Send text with FIRST file, then send remaining files

            if (staged && staged.length > 0) {
                // Message 1: Text + File 1
                await this.sendMiniMessage(userId, text, staged[0].fileUrl, staged[0].fileType);

                // Remaining files
                for (let i = 1; i < staged.length; i++) {
                    await this.sendMiniMessage(userId, "", staged[i].fileUrl, staged[i].fileType);
                }
            } else {
                // Just text
                await this.sendMiniMessage(userId, text);
            }

        } finally {
            this.isSending = false;
        }
    }

    // Shared Message Rendering for Full Page & Widget
    renderMessageHTML(sortedMessages, user) {
        const groups = [];
        let currentGroup = [];

        // Identify the ID of the very last message sent by ME in the entire list
        let lastMyMsgId = null;
        for (let i = sortedMessages.length - 1; i >= 0; i--) {
            if (sortedMessages[i].senderId === this.currentUser.id) {
                lastMyMsgId = sortedMessages[i].id;
                break;
            }
        }

        sortedMessages.forEach((msg, idx) => {
            const isImage = msg.fileUrl && msg.fileType === 'image';
            const prevMsg = idx > 0 ? sortedMessages[idx - 1] : null;
            const isSameSender = prevMsg && prevMsg.senderId === msg.senderId;
            const isPrevImage = prevMsg && prevMsg.fileUrl && prevMsg.fileType === 'image';

            // Time Break Check
            const timeDiff = prevMsg ? (new Date(msg.createdAt) - new Date(prevMsg.createdAt)) : 0;
            // Standard Break: 10 mins
            let isTimeBreak = timeDiff > 10 * 60 * 1000;

            // Strict Image Break: 2 seconds (prevents accumulation of separate sends)
            if (isImage && isPrevImage && timeDiff > 2 * 1000) {
                isTimeBreak = true;
            }

            if (!prevMsg || !isSameSender || (isImage !== isPrevImage) || isTimeBreak) {
                if (currentGroup.length > 0) groups.push(currentGroup);
                currentGroup = [msg];
            } else {
                currentGroup.push(msg);
            }
        });
        if (currentGroup.length > 0) groups.push(currentGroup);

        return groups.map(group => {
            const firstMsg = group[0];
            const isMe = firstMsg.senderId === this.currentUser.id;
            const isImageGroup = firstMsg.fileUrl && firstMsg.fileType === 'image';

            // Calculate showRead for the group (based on the last message in the group)
            let showRead = false;
            const lastMsgInGroup = group[group.length - 1];
            if (lastMsgInGroup.senderId === this.currentUser.id && lastMsgInGroup.isRead) {
                const realIdx = sortedMessages.indexOf(lastMsgInGroup);
                const newerMyMsg = sortedMessages.slice(realIdx + 1).some(m => m.senderId === this.currentUser.id);
                if (!newerMyMsg) showRead = true;
            }

            // 1. IMAGE COLLAGE LOGIC
            if (isImageGroup) {
                const count = group.length;
                let gridContainerStyle = `
        display: grid;
        gap: 2px;
        background: transparent;
        border-radius: 18px;
        overflow: hidden;
        width: 100%;
        max-width: 220px;
        `;

                if (count === 1) {
                    return `
            <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 4px;">
                <div onclick="event.stopPropagation(); window.chatManagerInstance.openLightbox('${group[0].fileUrl}', '${user.id}')"
                    style="cursor: zoom-in; position: relative; max-width: 200px; width: 80%;">
                    <img src="${group[0].fileUrl}" alt="Imagen" style="border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); width: 100%; object-fit: cover;">
                </div>
                 ${isMe && lastMsgInGroup.id === lastMyMsgId ? `<div style="font-size: 0.7rem; color: #aaa; margin-top: 2px; text-align: right; width: 100%; margin-right: 2px;">${showRead ? 'Visto' : `Enviado ${this.getRelativeTime(new Date(firstMsg.createdAt))}`}</div>` : ''}
            </div>
            `;
                }

                if (count === 2) {
                    gridContainerStyle += 'grid-template-columns: 1fr 1fr; aspect-ratio: 2/1;';
                } else {
                    gridContainerStyle += 'grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr;';
                }

                const imagesHtml = group.map((msg) => `
            <div onclick="event.stopPropagation(); window.chatManagerInstance.openLightbox('${msg.fileUrl}', '${user.id}')"
        style="cursor: pointer; position: relative; overflow: hidden; height: 100%; width: 100%; min-height: 70px; aspect-ratio: 1/1;">
            <img src="${msg.fileUrl}" alt="Imagen" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
        `).join('');

                return `
            <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 4px;">
                <div style="${gridContainerStyle}">
                    ${imagesHtml}
                </div>
                 ${isMe && lastMsgInGroup.id === lastMyMsgId ? `<div style="font-size: 0.7rem; color: #aaa; margin-top: 2px; text-align: right; width: 100%; margin-right: 2px;">${showRead ? 'Visto' : `Enviado ${this.getRelativeTime(new Date(firstMsg.createdAt))}`}</div>` : ''}
            </div>
            `;
            }

            // 2. STANDARD TEXT/FILE MESSAGES
            return group.map((msg) => {
                const isMe = msg.senderId === this.currentUser.id;
                // showRead is already calculated for the group, but we might want per-message if needed.
                let msgShowRead = false;
                if (isMe && msg.isRead) {
                    const realIdx = sortedMessages.indexOf(msg);
                    const newerMyMsg = sortedMessages.slice(realIdx + 1).some(m => m.senderId === this.currentUser.id);
                    if (!newerMyMsg) msgShowRead = true;
                }

                let contentHtml = '';
                // File (Non-Image)
                if (msg.fileUrl && msg.fileType !== 'image') {
                    const cleanName = msg.fileUrl.split('/').pop().split('?')[0].replace(/^\d+-/, '') || 'Documento';
                    contentHtml += `
            <div style="margin-bottom: 6px;">
                <div onclick="window.chatManagerInstance.downloadFileSecure('${msg.fileUrl}', '${cleanName}')" style="
                                display: flex; align-items: center; gap: 12px; cursor: pointer;
                                background: #242526; padding: 10px 14px; 
                                border-radius: 18px; text-decoration: none; color: white; 
                                border: 1px solid rgba(255,255,255,0.05); 
                                max-width: 220px; transition: background 0.2s;
                            ">
                    <div style="
                                    background: rgba(255,255,255,0.1); width: 40px; height: 40px; 
                                    border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
                                ">
                        <span style="font-size: 1.2em;">📄</span>
                    </div>
                    <div style="display: flex; flex-direction: column; overflow: hidden; width: 100%;">
                        <span style="
                                        font-size: 0.85em; font-weight: 600; 
                                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
                                        display: block; width: 100%;
                                    ">${cleanName}</span>
                    </div>
                </div>
            </div>
            `;
                }

                if (msg.message && msg.message.trim()) {
                    contentHtml += `<div>${msg.message.replace(/\n/g, '<br>')}</div>`;
                }

                const isStandAlone = msg.fileUrl && (!msg.message || !msg.message.trim());
                const bubbleBg = isStandAlone ? 'transparent' : (isMe ? 'var(--accent-purple)' : '#333');
                const bubblePad = isStandAlone ? '0' : '8px 12px';

                const msgDate = new Date(msg.createdAt);
                const prevMsgOverall = sortedMessages[sortedMessages.indexOf(msg) - 1];
                const timeDiff = prevMsgOverall ? (msgDate - new Date(prevMsgOverall.createdAt)) : Infinity;
                const showTimeHeader = timeDiff > 10 * 60 * 1000; // 10 minutes

                const timeStr = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

                let timeHeader = '';
                if (group.indexOf(msg) === 0 && showTimeHeader) {
                    timeHeader = `
            <div style="width: 100%; text-align: center; margin: 12px 0 4px 0; opacity: 0.6;">
                <span style="background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; color: #ccc;">
                    ${timeStr}
                </span>
            </div>
            `;
                }

                let statusHtml = '';
                if (isMe && msg.id === lastMyMsgId) {
                    let statusText = '';
                    let statusColor = '#666';

                    if (msgShowRead) {
                        statusText = 'Visto';
                        statusColor = '#aaa';
                    } else {
                        statusText = `Enviado ${this.getRelativeTime(new Date(msg.createdAt))}`;
                        statusColor = '#666';
                    }

                    statusHtml = `
            <div style="font-size: 0.7rem; color: ${statusColor}; margin-top: 2px; text-align: right; width: 100%; margin-right: 2px;">
                ${statusText}
            </div>
            `;
                }

                return `
                    ${timeHeader}
        <div class="message-bubble ${isMe ? 'me' : 'them'}" style="
                         align-self: ${isMe ? 'flex-end' : 'flex-start'}; 
                         max-width: 85%; 
                         margin-bottom: 2px; 
                         display: flex; 
                         flex-direction: column; 
                         align-items: ${isMe ? 'flex-end' : 'flex-start'};
                    ">
            <div style="
                             background: ${bubbleBg}; 
                             padding: ${bubblePad}; 
                             border-radius: 18px; 
                             border-bottom-${isMe ? 'right' : 'left'}-radius: 4px; 
                             color: white; 
                             line-height: 1.4; 
                             font-size: 0.95rem; 
                             word-break: break-word;
                             min-width: 60px;
                        ">
                ${contentHtml}
            </div>
            ${statusHtml}
        </div>
        `;
            }).join('');
        }).join('');
    }

    getRelativeTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHrs / 24);

        if (diffMins < 1) return 'hace un momento';
        if (diffMins < 60) return `hace ${diffMins} min`;
        if (diffHrs < 24) return `hace ${diffHrs} h`;
        if (diffDays === 1) return 'ayer';
        return `hace ${diffDays} días`;
    }

    // Updated send method to support attachments + Optimistic UI
    async sendMiniMessage(receiverId, text, fileUrl = null, fileType = null) {
        try {
            if (!text && !fileUrl) return;

            // 1. OPTIMISTIC UPDATE (Absolute Immediacy)
            const tempId = 'temp-' + Date.now();
            const tempMsg = {
                id: tempId,
                senderId: this.currentUser.id,
                receiverId: receiverId,
                message: text,
                fileUrl: fileUrl,
                fileType: fileType,
                createdAt: new Date().toISOString(),
                isRead: false,
                isTemp: true
            };

            const conv = this.conversations.find(c => c.otherUser.id == receiverId);
            if (conv) {
                if (!conv.messages) conv.messages = [];
                conv.messages.push(tempMsg);

                // Update Last Message snippet
                conv.lastMessage = tempMsg;

                // Render Immediately
                if (window.location.href.includes('messages.html')) {
                    // Full Page Update
                    const area = document.getElementById('messagesArea');
                    if (area) {
                        area.innerHTML = this.renderMessageHTML(conv.messages, conv.otherUser);
                        area.scrollTop = area.scrollHeight;
                    }
                } else {
                    // Widget Update
                    if (this.updateMessagesAreaOnly) {
                        this.updateMessagesAreaOnly(receiverId);
                    } else {
                        // Fallback logic if method missing in this version
                        const area = document.getElementById(`msg-area-${receiverId}`);
                        if (area) {
                            area.innerHTML = this.renderMessageHTML(conv.messages, conv.otherUser);
                            area.scrollTop = area.scrollHeight;
                        }
                    }
                }
            }

            // 2. NETWORK REQUEST
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${this.baseUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    receiverId,
                    message: text,
                    fileUrl: fileUrl,
                    fileType: fileType
                })
            });

            if (!res.ok) throw new Error('Failed to send');

            const { message } = await res.json();

            // 3. RECONCILE (Replace Temp with Real)
            if (conv) {
                const idx = conv.messages.findIndex(m => m.id === tempId);
                if (idx !== -1) {
                    conv.messages[idx] = message; // Swap
                    // Re-render to show "Sent" status (check marks) instead of temp state
                    if (window.location.href.includes('messages.html')) {
                        const area = document.getElementById('messagesArea');
                        if (area) area.innerHTML = this.renderMessageHTML(conv.messages, conv.otherUser);
                    } else {
                        if (this.updateMessagesAreaOnly) this.updateMessagesAreaOnly(receiverId);
                    }
                }
            }

        } catch (error) {
            console.error('Send Error:', error);
            // Optional: Mark temp message as failed (red)
        }
    }

    // Helper: Force Download via Blob (Bypass Cloudinary 401 on transformed raw files)
    async downloadFile(url, filename) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback
            window.open(url, '_blank');
        }
    }

    // ==========================================
    // Helper: Standard Download (Reverted to Safe Mode)
    // Complex fetch/injection approaches caused 401s due to Signature Mismatches on Cloudinary
    downloadFileSecure(url, filename) {
        // Just open the original signed URL. 
        // If it opens in a new tab (PDF Viewer), user can save from there.
        // We cannot inject fl_attachment client-side without invalidating the signature.
        window.open(url, '_blank');
    }

    // Lightbox Logic (Phase F)
    // ==========================================
    // ==========================================
    // Lightbox Logic (Phase G - Carousel)
    // ==========================================
    openLightbox(currentUrl, userId) {
        // 1. Get all images in conversation
        let conversation = this.conversations.find(c => c.otherUser.id == userId);
        // If not found in active list, try to find in messagesPageContainer or fallback
        // Fallback: Scan DOM if needed, but state is better. 
        // If "conversation" object isn't fully sync'd, we might relying on what's tracked.
        // Assuming 'this.conversations' is up to date or we can filter from 'messages' in UI?
        // Let's use the DOM-rendered images to be 100% sync with what the user sees.

        const allImages = Array.from(document.querySelectorAll(`#msg-area-${userId} img[alt="Imagen"]`)).map(img => img.src);
        let currentIndex = allImages.indexOf(currentUrl);
        if (currentIndex === -1) {
            // Fallback if URL mismatch (e.g. query params)
            currentIndex = allImages.findIndex(src => src.includes(currentUrl) || currentUrl.includes(src));
        }
        if (currentIndex === -1) {
            // Just show single if not found in list
            allImages.push(currentUrl);
            currentIndex = 0;
        }

        let lightbox = document.getElementById('chat-lightbox');
        if (lightbox) lightbox.remove(); // Re-create to ensure clean state

        lightbox = document.createElement('div');
        lightbox.id = 'chat-lightbox';
        lightbox.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.95); z-index: 10000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            user-select: none; opacity: 0; transition: opacity 0.2s;
        `;
        document.body.appendChild(lightbox);

        // --- RENDER FUNCTION ---
        const renderContent = () => {
            lightbox.innerHTML = '';

            // Close Button
            const closeBtn = document.createElement('div');
            closeBtn.innerHTML = '&times;';
            closeBtn.style.cssText = `
                position: absolute; top: 10px; right: 20px; color: #fff; font-size: 40px; 
                cursor: pointer; z-index: 10002; opacity: 0.8;
            `;
            closeBtn.onclick = () => close();
            lightbox.appendChild(closeBtn);

            // Container for Main Image + Arrows
            const mainContainer = document.createElement('div');
            mainContainer.style.cssText = `
                flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; position: relative;
            `;

            // Prev Arrow
            if (allImages.length > 1) {
                const prevBtn = document.createElement('div');
                prevBtn.innerHTML = '&#10094;';
                prevBtn.style.cssText = `
                    position: absolute; left: 20px; color: white; font-size: 50px; cursor: pointer; z-index: 10001; opacity: 0.7;
                `;
                prevBtn.onclick = (e) => { e.stopPropagation(); navigate(-1); };
                mainContainer.appendChild(prevBtn);
            }

            // Image
            const img = document.createElement('img');
            img.src = allImages[currentIndex];
            img.style.cssText = `
                max-width: 90%; max-height: 80vh; border-radius: 4px; 
                box-shadow: 0 0 30px rgba(0,0,0,0.5); transition: transform 0.2s;
            `;
            mainContainer.appendChild(img);

            // Next Arrow
            if (allImages.length > 1) {
                const nextBtn = document.createElement('div');
                nextBtn.innerHTML = '&#10095;';
                nextBtn.style.cssText = `
                    position: absolute; right: 20px; color: white; font-size: 50px; cursor: pointer; z-index: 10001; opacity: 0.7;
                `;
                nextBtn.onclick = (e) => { e.stopPropagation(); navigate(1); };
                mainContainer.appendChild(nextBtn);
            }
            lightbox.appendChild(mainContainer);

            // Thumbnails Strip
            if (allImages.length > 1) {
                const strip = document.createElement('div');
                strip.style.cssText = `
                    height: 80px; width: 100%; background: rgba(0,0,0,0.5); 
                    display: flex; align-items: center; justify-content: center; gap: 10px; 
                    overflow-x: auto; padding: 10px; box-sizing: border-box;
                `;

                allImages.forEach((src, idx) => {
                    const thumb = document.createElement('img');
                    thumb.src = src;
                    const isActive = idx === currentIndex;
                    thumb.style.cssText = `
                        height: 50px; width: 50px; object-fit: cover; border-radius: 4px; cursor: pointer; 
                        border: 2px solid ${isActive ? 'var(--accent-purple)' : 'transparent'};
                        opacity: ${isActive ? '1' : '0.6'}; transition: all 0.2s;
                    `;
                    thumb.onclick = (e) => { e.stopPropagation(); currentIndex = idx; renderContent(); };
                    strip.appendChild(thumb);
                });
                lightbox.appendChild(strip);
            }

            // Click BG to close
            lightbox.onclick = (e) => {
                if (e.target === lightbox || e.target === mainContainer) close();
            };
        };

        // --- HELPERS ---
        const navigate = (dir) => {
            currentIndex += dir;
            if (currentIndex < 0) currentIndex = allImages.length - 1;
            if (currentIndex >= allImages.length) currentIndex = 0;
            renderContent();
        };

        const close = () => {
            lightbox.style.opacity = '0';
            setTimeout(() => lightbox.remove(), 200);
            document.removeEventListener('keydown', keyHandler);
        };

        const keyHandler = (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowLeft') navigate(-1);
            if (e.key === 'ArrowRight') navigate(1);
        };
        document.addEventListener('keydown', keyHandler);

        // Init
        renderContent();
        requestAnimationFrame(() => lightbox.style.opacity = '1');
    }

    // ==========================================
    // Emoji Picker Logic (Inline - No Dependencies)
    // ==========================================
    toggleEmojiPicker(triggerBtn, userId) {
        // Close if open
        const existing = document.getElementById(`emoji-picker-${userId}`);
        if (existing) {
            existing.remove();
            return;
        }

        // Create Picker
        const picker = document.createElement('div');
        picker.id = `emoji-picker-${userId}`;
        picker.style.cssText = `
            position: absolute;
            bottom: 60px;
            right: 10px;
            background: #222;
            border: 1px solid #444;
            border-radius: 8px;
            padding: 10px;
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 5px;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            max-height: 200px;
            overflow-y: auto;
            /* Scrollbar Style */
            scrollbar-width: thin;
            scrollbar-color: #555 #222;
        `;

        // Webkit Scrollbar style injection (inline)
        const style = document.createElement('style');
        style.textContent = `
            #emoji-picker-${userId}::-webkit-scrollbar { width: 6px; }
            #emoji-picker-${userId}::-webkit-scrollbar-track { background: #222; }
            #emoji-picker-${userId}::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
        `;
        picker.appendChild(style);

        const emojis = [
            '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
            '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
            '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
            '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
            '👍', '👎', '👋', '🙌', '👏', '🤝', '🙏', '💪', '❤️', '💔'
        ];

        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.style.cssText = 'cursor: pointer; font-size: 1.2rem; padding: 2px; text-align: center;';
            span.onmouseover = () => span.style.background = '#333';
            span.onmouseout = () => span.style.background = 'transparent';
            span.onclick = () => {
                const input = document.getElementById(`chat-input-${userId}`);
                if (input) {
                    input.value += emoji;
                    input.focus();
                }
                // Keep open or close? Usually close
                // picker.remove(); 
            };
            picker.appendChild(span);
        });

        // Close on click outside
        const closeHandler = (e) => {
            if (!picker.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);

        // Append to footer or body? Footer is safer for positioning
        triggerBtn.parentElement.parentElement.style.position = 'relative';
        triggerBtn.parentElement.parentElement.appendChild(picker);
    }

    // Surgical Update for Widgets (Does not look at input)
    updateMessagesAreaOnly(userId) {
        const msgArea = document.getElementById(`msg-area-${userId}`);
        const conv = this.conversations.find(c => c.otherUser.id == userId);
        if (msgArea && conv) {
            // Sort
            const sortedMessages = (conv.messages || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            // Update HTML
            msgArea.innerHTML = this.renderMessageHTML(sortedMessages, conv.otherUser);
            // Append Typing Indicator if needed
            if (this.typingUsers.has(userId)) {
                msgArea.innerHTML += `
                    <div style="display: flex; justify-content: flex-start;">
                        <span style="background: #333; color: #888; padding: 8px 12px; border-radius: 12px; font-size: 0.8rem; font-style: italic;">
                            Escribiendo...
                        </span>
                    </div>`;
            }
            // Scroll
            this.scrollToBottom(userId);
        }
    }

    tryFocusInput(userId) {
        const input = document.getElementById(`chat-input-${userId}`);
        if (input) {
            input.focus();
            // optional: move cursor to end
        }
    }

}

// Make globally available
window.ChatManager = ChatManager;
// Compatibility override for legacy inline handlers
if (typeof window.chatManager === 'undefined') {
    // If instantiated elsewhere, align it.
    // Ideally script.js does 'window.chatManager = new ChatManager()'
}

// ==========================================
// SAFE GLOBAL REFERENCERS (The Fix)
// ==========================================
window.safeTriggerUpload = (userId) => {
    if (window.chatManager) window.chatManager.triggerFileUpload(userId);
    else console.error('ChatManager instance not found');
};

window.safeToggleEmoji = (btn, userId) => {
    if (window.chatManager) window.chatManager.toggleEmojiPicker(btn, userId);
    else console.error('ChatManager instance not found');
};

window.safeOpenLightbox = (url, userId) => {
    if (window.chatManager) window.chatManager.openLightbox(url, userId);
    else if (window.chatManagerInstance) window.chatManagerInstance.openLightbox(url, userId);
};

window.safeSendStagedMessage = (userId) => {
    if (window.chatManager) window.chatManager.sendStagedMessage(userId);
    else console.error('ChatManager not found for send');
};

window.safeHandleFocus = (userId) => {
    if (window.chatManager) window.chatManager.handleInputFocus(userId);
};

window.safeEmitTyping = (userId) => {
    if (window.chatManager) window.chatManager.emitTyping(userId);
};

window.safeMinimize = (userId) => {
    if (window.chatManager) window.chatManager.toggleMinimize(userId);
};

window.safeCloseTab = (userId) => {
    if (window.chatManager) window.chatManager.closeTab(userId);
};

// Final Aliasing
window.chatManagerInstance = window.chatManager;

