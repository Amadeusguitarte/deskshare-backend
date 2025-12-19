// ========================================
// Computer Detail & Booking Functionality
// ========================================
// NEW: Strict Memory-Based Deduplication (Faster & More Reliable than DOM Query)
window.visibleMessageIds = new Set();

let currentComputer = null;
let currentBooking = null; // Restore needed variable, remove duplicate currentUser

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const computerId = urlParams.get('id');

    if (!computerId) {
        alert('ID de computadora no válido');
        window.location.href = 'marketplace.html';
        return;
    }

    await loadComputerDetails(computerId);

    if (checkAuth()) {
        initializeChat(computerId);
    }
});

async function loadComputerDetails(computerId) {
    try {
        const response = await apiRequest(`/computers/${computerId}`);
        currentComputer = response.computer || response;

        // Update page content
        updateComputerInfo(currentComputer);

    } catch (error) {
        console.error('Error loading computer:', error);
        alert(`Error al cargar la computadora: ${error.message}`);
        // Keep on page to see error, or redirect after delay?
        // window.location.href = 'marketplace.html'; 
    }
}

function updateComputerInfo(computer) {
    // Update title, images, specs, etc.
    document.title = computer.name + ' - DeskShare';

    const mainImage = document.getElementById('mainImage');
    if (mainImage) {
        let imageUrl = 'assets/workstation_professional_1765782988095.png';
        if (computer.images && computer.images.length > 0) {
            imageUrl = computer.images[0].imageUrl || computer.images[0].url || imageUrl;
        }
        mainImage.src = imageUrl;

        // Populate thumbnails
        // Populate thumbnails
        // Try to find container directly first, or via child
        let thumbnailContainer = document.querySelector('.thumbnail-grid') || (document.querySelector('.thumbnail-image') ? document.querySelector('.thumbnail-image').parentNode : null);

        if (thumbnailContainer) {
            thumbnailContainer.innerHTML = '';
            // If images array exists, populate it
            if (computer.images && computer.images.length > 0) {
                computer.images.forEach(img => {
                    const thumbUrl = img.imageUrl || img.url;
                    const imgEl = document.createElement('img');
                    imgEl.src = thumbUrl;
                    imgEl.className = 'thumbnail-image';
                    imgEl.style.cursor = 'pointer'; // Ensure it looks clickable
                    imgEl.onclick = () => changeMainImage(thumbUrl);
                    thumbnailContainer.appendChild(imgEl);
                });
            }
        }
    }

    // Update Text Fields
    setTextContent('computerTitle', computer.name);
    setTextContent('computerDescription', computer.description);
    setTextContent('computerPrice', '$' + computer.pricePerHour);

    // Update Specs
    setTextContent('specCpu', computer.cpu);
    setTextContent('specGpu', computer.gpu);
    setTextContent('specRam', (computer.ram ? computer.ram + 'GB' : '-'));
    setTextContent('specStorage', (computer.storage ? computer.storage + 'GB' : '-')); // Handle conversion if generic
    setTextContent('specOs', computer.os);
    setTextContent('specInternet', computer.internetSpeed);

    // Handle Software Section (Hide for now as it's not in DB)
    const softwareSection = document.getElementById('softwareSection');
    if (softwareSection) {
        if (computer.software && computer.software.length > 0) {
            softwareSection.style.display = 'block';
            // TODO: Populate list
        } else {
            softwareSection.style.display = 'none';
        }
    }

    // Update User Info
    if (computer.user) {
        setTextContent('hostName', computer.user.name);
        setTextContent('hostMemberSince', 'Miembro desde ' + new Date(computer.user.createdAt || Date.now()).getFullYear());

        const avatarEl = document.getElementById('hostAvatar');
        if (avatarEl) {
            avatarEl.src = computer.user.avatarUrl || 'assets/default-avatar.png';
        }
    }

    // Update Chat Host Info (if visible initially)
    const chatHostName = document.querySelector('.chat-header h4');
    if (chatHostName && computer.user) chatHostName.textContent = computer.user.name;

    const chatHostAvatar = document.getElementById('chatHostAvatar');
    if (chatHostAvatar && computer.user) {
        chatHostAvatar.src = computer.user.avatarUrl || 'assets/default-avatar.png';
    }

}

function setTextContent(id, text) {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
}

async function createBookingAndPay() {
    if (!checkAuth()) {
        alert('Debes iniciar sesión para hacer un booking');
        window.location.href = 'login.html?redirect=computer-detail.html?id=' + currentComputer.id;
        return;
    }

    if (currentComputer.userId === currentUser.id) {
        alert('No puedes rentar tu propia computadora');
        return;
    }

    const estimatedHours = prompt(' ¿Cuántas horas planeas usar la PC?', '2');
    if (!estimatedHours) return;

    try {
        // Create booking
        const bookingData = {
            computerId: currentComputer.id,
            priceAgreed: currentComputer.pricePerHour,
            estimatedHours: parseInt(estimatedHours)
        };

        const response = await apiRequest('/bookings', {
            method: 'POST',
            body: JSON.stringify(bookingData)
        });

        currentBooking = response.booking;

        // TODO: Integrate Stripe payment
        // For now, just confirm
        const confirmed = confirm(
            `Booking creado!\n\n` +
            `Total estimado: $${(currentComputer.pricePerHour * estimatedHours).toFixed(2)}\n\n` +
            `¿Proceder al inicio de sesión remota?`
        );

        if (confirmed) {
            // Start session
            await startRemoteSession(currentBooking.id);
        }

    } catch (error) {
        alert('Error al crear booking: ' + error.message);
    }
}

async function startRemoteSession(bookingId) {
    try {
        const response = await apiRequest(`/bookings/${bookingId}/start`, {
            method: 'POST'
        });

        // Redirect to remote access page
        window.location.href = `remote-access.html?bookingId=${bookingId}`;

    } catch (error) {
        alert('Error al iniciar sesión: ' + error.message);
    }
}

// ========================================
// Chat Functionality
// ========================================

// ========================================
// Chat Functionality (Integrated with ChatManager)
// ========================================

// Hijack the global handleNewMessage from script.js to prevent double appending
// and force everything through our Deduplication Logic
window.handleNewMessage = function (message) {
    if (message.computerId === currentComputer?.id || message.computerId == currentComputer?.id) {
        // Route to our smart display
        displayChatMessage(message);
    }
};

async function waitForChatManagerReady() {
    return new Promise((resolve) => {
        if (window.chatManager && typeof window.chatManager.loadHistory === 'function') {
            return resolve();
        }
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (window.chatManager && typeof window.chatManager.loadHistory === 'function') {
                clearInterval(interval);
                resolve();
            } else if (attempts > 50) { // 5s timeout
                console.warn('ChatManager timed out');
                clearInterval(interval);
                resolve(); // Proceed anyway (might fail but better than hanging)
            }
        }, 100);
    });
}

async function initializeChat(computerId) {
    await waitForChatManagerReady();

    if (window.chatManager) {
        // ChatManager handles the global socket connection
        // We just need to load the specific history for this computer context
        const ownerId = currentComputer.user.id;
        try {
            const messages = await window.chatManager.loadHistory(ownerId);

            const chatContainer = document.getElementById('chatMessages');
            if (chatContainer) {
                // New Interaction: Clicking the right column chat opens the bottom widget
                chatContainer.style.cursor = 'pointer';
                chatContainer.onclick = function () {
                    if (window.chatManager) {
                        window.chatManager.openChat(ownerId);
                    }
                };

                if (messages.length > 0) {
                    chatContainer.innerHTML = ''; // Clear placeholder
                    // Client-side Sort (Oldest -> Newest) to ensure correct order
                    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    console.log(`Loaded ${messages.length} messages for Detail View`);

                    messages.forEach(msg => {
                        if (msg.id) window.visibleMessageIds.add(String(msg.id)); // Sync History to Set (String forced)
                        displayChatMessage(msg);
                    });
                    scrollChatToBottom();
                } else {
                    // Ensure placeholder is visible (optional, or just leave as is)
                    if (!chatContainer.querySelector('.message-received')) {
                        chatContainer.innerHTML = `
                            <div class="message message-received" style="font-style: italic; opacity: 0.7;">
                                <p style="margin: 0;">Inicia una conversación con el anfitrión...</p>
                            </div>
                        `;
                    }
                }

                // Prevent duplicate listeners (Global Guard)
                if (window.chatManager._detailListenerAttached) {
                    return;
                }
            }

            // Re-using the socket from ChatManager is best
            if (window.chatManager.socket) {
                // Remove any previous listener to be safe? 
                // Hard to remove anonymous lambda, but _detailListenerAttached protects us once.

                window.chatManager.socket.on('private-message', (msg) => {
                    if (msg.senderId === ownerId || msg.senderId === currentUser?.id || msg.receiverId === ownerId) {
                        displayChatMessage(msg);
                    }
                });

                // GLOBAL SYNC: Listen for messages from ChatManager (Widget)
                // This ensures messages sent via Widget appear here immediately
                window.addEventListener('chat:sync', (e) => {
                    const msg = e.detail;
                    if (msg.senderId === ownerId || msg.senderId === currentUser?.id || msg.receiverId === ownerId) {
                        displayChatMessage(msg);
                    }
                });

                window.chatManager._detailListenerAttached = true;
            }
        } catch (e) {
            console.error("Error init chat history", e);
        }
    }
}

function displayChatMessage(message) {
    const chatContainer = document.getElementById('chatMessages');
    if (!chatContainer) return;

    const isMe = message.senderId === currentUser.id;

    console.log('Displaying msg:', message);

    // 1. Strict ID Check (Memory Set + DOM Backup)
    if (message.id) {
        const msgId = String(message.id); // Force String for reliable Set check

        // Check Memory Set First (Fastest)
        if (window.visibleMessageIds.has(msgId)) {
            console.warn('Duplicate ID blocked by Memory Set:', msgId);
            return;
        }
        // Double Check DOM just in case (e.g. reload or race)
        const existingEl = chatContainer.querySelector(`[data-msg-id="${msgId}"]`);
        if (existingEl) {
            console.warn('Duplicate ID blocked by DOM Query:', msgId);
            window.visibleMessageIds.add(msgId); // Sync Set
            return;
        }
        // If clean, add to Set
        window.visibleMessageIds.add(msgId);
    }

    const msgText = String(message.message || message.text || '').trim();
    if (!msgText) return;

    // --- DEDUPLICATION LOGIC ---

    // 1. Signature Generation
    const dedupSignature = `${message.senderId}:${msgText}`;
    const now = Date.now();

    // 2. Memory Guard (Race Condition Protection)
    // Instantly blocks rapid-fire duplicates before they hit the DOM
    if (!window.msgSignatures) window.msgSignatures = new Map();

    // Cleanup old signatures
    for (const [key, timestamp] of window.msgSignatures) {
        if (now - timestamp > 5000) window.msgSignatures.delete(key);
    }

    if (window.msgSignatures.has(dedupSignature)) {
        const lastTime = window.msgSignatures.get(dedupSignature);
        // RELAXED DEDUP: Only block for 800ms (Machine Speed).
        // Allows Human Speed (>1s) to send identical messages intentionally.
        if (now - lastTime < 800) {
            console.warn('Duplicate blocked by Memory Guard (Race):', dedupSignature);
            return;
        }
    }
    window.msgSignatures.set(dedupSignature, now);

    // 3. DOM Guard (Persistence Protection) - REMOVED for Repeat/Teleport logic
    // We Rely purely on the 800ms Memory Map for Echo Protection.
    // This allows sending "7" then "7" again after 1 second.

    // Removed legacy Text Scan to allow identical messages if Hash is different (or timed out)



    const messageEl = document.createElement('div');
    if (message.id) messageEl.dataset.msgId = message.id; // Store ID
    // CRITICAL: Store Deduplication Hash for strict blocking
    messageEl.dataset.dedupHash = dedupSignature;
    if (message.id) messageEl.dataset.msgId = message.id; // CRITICAL FOR DEDUP

    messageEl.className = isMe ? 'message-sent' : 'message-received';
    // Match styles from CSS or inline
    messageEl.style.cssText = isMe ?
        'align-self: flex-end; background: var(--accent-purple); color: white; padding: 8px 12px; border-radius: 12px; border-bottom-right-radius: 2px; margin-bottom: 8px; max-width: 80%;' :
        'align-self: flex-start; background: rgba(255,255,255,0.1); color: white; padding: 8px 12px; border-radius: 12px; border-bottom-left-radius: 2px; margin-bottom: 8px; max-width: 80%;';

    messageEl.innerHTML = `
        <div class="message-content">${escapeHtml(message.message || message.text)}</div>
        <div class="message-time" style="font-size: 0.7em; opacity: 0.7; text-align: right; margin-top: 4px;">${formatMessageTime(message.createdAt)}</div>
    `;

    chatContainer.appendChild(messageEl);
    scrollChatToBottom();

    // BIDIRECTIONAL SCROLL: Wake up the Widget too!
    if (window.chatManager && typeof window.chatManager.scrollToBottom === 'function') {
        const otherId = (message.senderId === currentUser.id) ? message.receiverId : message.senderId;
        // Small delay to ensure widget renders if it's receiving same event
        setTimeout(() => window.chatManager.scrollToBottom(otherId), 50);
    }
}

function scrollChatToBottom() {
    const chatContainer = document.getElementById('chatMessages');
    if (chatContainer && chatContainer.lastElementChild) {
        // INSTANT SCROLL ("Teleport")
        chatContainer.lastElementChild.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
}

// Make available globally for button click
window.sendChatMessage = async function () {
    const input = document.getElementById('messageInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    // Use ChatManager to send
    input.value = ''; // Optimistic clear

    const waitForChat = () => new Promise((resolve, reject) => {
        // 1. Ready immediately?
        if (window.chatManager && typeof window.chatManager.openChat === 'function') {
            return resolve();
        }

        console.log('ChatManager not ready, waiting...');

        // 2. Try to init if global function exists but manager doesn't
        if (typeof initGlobalChat === 'function' && !window.chatManager) {
            const currentUser = JSON.parse(localStorage.getItem('currentUser'));
            if (currentUser) initGlobalChat(currentUser);
        }

        // 3. Poll for it
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (window.chatManager && typeof window.chatManager.openChat === 'function') {
                clearInterval(interval);
                resolve();
            } else if (attempts > 50) { // 5 seconds
                clearInterval(interval);
                reject(new Error('ChatManager unavailable after 5s'));
            }
        }, 100);
    });

    try {
        await waitForChat();

        const ownerId = currentComputer.user.id;

        // 1. Open widget FIRST
        await window.chatManager.openChat(ownerId);

        // 2. Send message & Get Result
        const responseMsg = await window.chatManager.sendMessage(ownerId, text, currentComputer.id);

        // UNIFIED OPTIMISTIC UPDATE:
        // Use the response from ChatManager (which might be the real msg or a temp one)
        // to immediately update our Inline View.
        if (responseMsg) {
            console.log('Optimistic Update:', responseMsg);
            displayChatMessage(responseMsg);
            // Ensure Widget also gets it if it didn't already
            window.chatManager.handleNewMessage(responseMsg);
        }
        // to avoid duplicate messages.

    } catch (err) {
        console.error('Error sending message:', err);
        alert('Error al enviar mensaje: ' + err.message);
    }
}



function scrollChatToBottom() {
    const chatContainer = document.getElementById('chatMessages');
    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Helper functions
function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions globally available
window.createBookingAndPay = createBookingAndPay;
window.sendChatMessage = sendChatMessage;
window.scrollChatToBottom = scrollChatToBottom;
