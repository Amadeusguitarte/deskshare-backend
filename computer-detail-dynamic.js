// ========================================
// Computer Detail & Booking Functionality
// ========================================

let currentComputer = null;
let currentBooking = null;

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

async function initializeChat(computerId) {
    if (window.chatManager) {
        // ChatManager handles the global socket connection
        // We just need to load the specific history for this computer context
        const ownerId = currentComputer.user.id;
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
                messages.forEach(msg => displayChatMessage(msg));
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
            window.chatManager.socket.on('private-message', (msg) => {
                if (msg.senderId === ownerId || msg.senderId === currentUser.id) {
                    displayChatMessage(msg);
                }
            });
            window.chatManager._detailListenerAttached = true;
        }
    }
}

function displayChatMessage(message) {
    const chatContainer = document.getElementById('chatMessages');
    if (!chatContainer) return;

    const isMe = message.senderId === currentUser.id;

    console.log('Displaying msg:', message);

    // 1. Strict ID Check
    if (message.id && chatContainer.querySelector(`[data-msg-id="${message.id}"]`)) {
        console.warn('Duplicate ID skipped:', message.id);
        return;
    }

    // 2. Memory-Based Deduplication (Signature Map)
    // Stronger than single variable, handles multiple rapid events
    if (!window.msgSignatures) window.msgSignatures = new Map();

    const msgText = (message.message || message.text || '').trim();
    // Signature: SenderID + Text (Ignore time in signature to catch echoes)
    const signature = `${message.senderId}:${msgText}`;
    const now = Date.now();

    // Clean old signatures (> 5 seconds)
    for (const [key, timestamp] of window.msgSignatures) {
        if (now - timestamp > 5000) window.msgSignatures.delete(key);
    }

    // Check if signature exists and is recent
    if (window.msgSignatures.has(signature)) {
        const lastTime = window.msgSignatures.get(signature);
        if (now - lastTime < 2000) {
            console.warn('Duplicate blocked by Signature Map:', signature);
            return;
        }
    }

    // Update signature
    window.msgSignatures.set(signature, now);



    const messageEl = document.createElement('div');
    if (message.id) messageEl.dataset.msgId = message.id; // Store ID
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
}

async function sendChatMessage() {
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

        // 1. Open widget FIRST so user sees something happening
        await window.chatManager.openChat(ownerId);

        // 2. Send message
        await window.chatManager.sendMessage(ownerId, text, currentComputer.id);

        // Note: We rely on Socket.io to update the UI (both widget and inline)
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
