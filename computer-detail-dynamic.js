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
        alert('Error al cargar la computadora');
        window.location.href = 'marketplace.html';
    }
}

function updateComputerInfo(computer) {
    // Update title, images, specs, etc.
    document.title = computer.name + ' - DeskShare';

    const mainImage = document.getElementById('mainImage');
    if (mainImage && computer.images && computer.images[0]) {
        mainImage.src = computer.images[0].url;
    }

    // Update specs if elements exist
    const priceEl = document.querySelector('.price');
    if (priceEl) {
        priceEl.textContent = '$' + computer.pricePerHour;
    }

    // Update any other elements dynamically
    // (This would be more complete with actual element IDs from computer-detail.html)
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

function initializeChat(computerId) {
    if (!socket) {
        console.error('Socket not initialized');
        return;
    }

    // Join computer room
    socket.emit('join-room', { computerId });

    // Load message history
    loadChatHistory(computerId);

    // Listen for new messages
    socket.on('new-message', (message) => {
        displayChatMessage(message);
    });
}

async function loadChatHistory(computerId) {
    try {
        const response = await apiRequest(`/chat/${computerId}/messages`);
        const messages = response.messages || response;

        messages.forEach(message => {
            displayChatMessage(message, false);
        });

        scrollChatToBottom();

    } catch (error) {
        console.error('Error loading chat:', error);
    }
}

function displayChatMessage(message, animate = true) {
    const chatContainer = document.getElementById('chatMessages');
    if (!chatContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = message.senderId === currentUser?.id ? 'message-sent' : 'message-received';

    messageEl.innerHTML = `
        <div class="message-content">${escapeHtml(message.text)}</div>
        <div class="message-time">${formatMessageTime(message.createdAt)}</div>
    `;

    chatContainer.appendChild(messageEl);

    if (animate) {
        scrollChatToBottom();
    }
}

function sendChatMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    if (!socket || !currentComputer) {
        alert('Chat no disponible');
        return;
    }

    socket.emit('send-message', {
        computerId: currentComputer.id,
        text
    });

    input.value = '';
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
