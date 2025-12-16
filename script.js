// ========================================
// DeskShare - API Integration
// Connects frontend to real backend
// ========================================
// Configuration
// ========================================

const API_BASE_URL = 'https://deskshare-backend-production.up.railway.app/api';
const SOCKET_URL = 'https://deskshare-backend-production.up.railway.app';

// Auth token management
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

// Socket.io connection
let socket = null;

function initializeSocket() {
    if (typeof io !== 'undefined' && authToken) {
        socket = io(SOCKET_URL, {
            auth: { token: authToken }
        });

        socket.on('connect', () => {
            console.log('🟢 Socket connected');
        });

        socket.on('new-message', (message) => {
            handleNewMessage(message);
        });
    }
}

// Initialize socket on page load
if (authToken) {
    initializeSocket();
}

// ========================================
// API Helper Functions
// ========================================

async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ========================================
// Authentication Functions
// ========================================

async function login(email, password) {
    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        initializeSocket();
        return true;
    } catch (error) {
        console.error('Login failed:', error);
        throw error;
    }
}

async function register(userData) {
    try {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        // Auto-login after registration
        if (data.token) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            initializeSocket();
        }

        return true;
    } catch (error) {
        console.error('Registration failed:', error);
        throw error;
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    window.location.href = 'index.html';
}

function checkAuth() {
    return !!authToken && !!currentUser;
}

function redirectIfNotLoggedIn() {
    if (!checkAuth()) {
        window.location.href = 'login.html';
    }
}

function redirectIfLoggedIn() {
    if (checkAuth()) {
        window.location.href = 'profile.html';
    }
}

// ========================================
// Google OAuth
// ========================================

async function loginWithGoogle() {
    // TODO: Implement Google OAuth
    // For now, show instructions
    alert(
        'Google OAuth está en desarrollo.\n\n' +
        'Para implementarlo completamente:\n' +
        '1. Crear proyecto en Google Cloud Console\n' +
        '2. Habilitar Google Sign-In API\n' +
        '3. Configurar OAuth credentials\n' +
        '4. Agregar dominio autorizado\n\n' +
        'Por ahora, usa email/password.'
    );

    /* Full implementation would be:
    try {
        // Initialize Google Sign-In
        await gapi.auth2.getAuthInstance().signIn();
        const googleUser = gapi.auth2.getAuthInstance().currentUser.get();
        const idToken = googleUser.getAuthResponse().id_token;
        
        // Send to backend
        const response = await apiRequest('/auth/google', {
            method: 'POST',
            body: JSON.stringify({ idToken })
        });
        
        // Save session
        authToken = response.token;
        currentUser = response.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        initializeSocket();
        window.location.href = 'profile.html';
    } catch (error) {
        console.error('Google login failed:', error);
        alert('Error al iniciar sesión con Google');
    }
    */
}

// ========================================
// Navbar Auth State Management
// ========================================

function updateNavbarAuthState() {
    const isLoggedIn = checkAuth();

    // Show/hide elements based on auth state
    document.querySelectorAll('.auth-only').forEach(el => {
        el.style.display = isLoggedIn ? 'block' : 'none';
    });

    document.querySelectorAll('.guest-only').forEach(el => {
        el.style.display = isLoggedIn ? 'none' : 'block';
    });
}

// Update navbar on page load
document.addEventListener('DOMContentLoaded', () => {
    updateNavbarAuthState();
});

// Make Google login globally available
window.loginWithGoogle = loginWithGoogle;


function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    if (socket) socket.disconnect();
    window.location.href = 'index.html';
}

// ========================================
// Computer Functions
// ========================================

async function loadComputers(filters = {}) {
    try {
        const queryParams = new URLSearchParams(filters).toString();
        const data = await apiRequest(`/computers?${queryParams}`);

        displayComputers(data.computers);
        return data;
    } catch (error) {
        console.error('Failed to load computers:', error);
    }
}

function displayComputers(computers) {
    const grid = document.getElementById('computerGrid');
    if (!grid) return;

    grid.innerHTML = '';

    computers.forEach(computer => {
        const card = createComputerCard(computer);
        grid.appendChild(card);
    });
}

function createComputerCard(computer) {
    const card = document.createElement('div');
    card.className = 'computer-card fade-in';
    card.onclick = () => window.location.href = `computer-detail.html?id=${computer.id}`;

    const stars = '★'.repeat(Math.floor(computer.user.rating)) + '☆'.repeat(5 - Math.floor(computer.user.rating));
    const primaryImage = computer.images.find(img => img.isPrimary)?.imageUrl ||
        computer.images[0]?.imageUrl ||
        'assets/hero_background_1765783023163.png';

    card.innerHTML = `
    <img src="${primaryImage}" alt="${computer.name}" class="computer-image" onerror="this.src='assets/hero_background_1765783023163.png'">
    <div class="computer-info">
      <h3 class="computer-title">${computer.name}</h3>
      <div class="computer-specs">
        ${computer.cpu ? `<span class="spec-badge">${computer.cpu.substring(0, 15)}</span>` : ''}
        ${computer.gpu ? `<span class="spec-badge">${computer.gpu.substring(0, 15)}</span>` : ''}
        ${computer.ram ? `<span class="spec-badge">${computer.ram}GB RAM</span>` : ''}
      </div>
      <p style="color: var(--text-secondary); font-size: 0.95rem; margin: 0.5rem 0;">
        ${computer.description?.substring(0, 80) || ''}...
      </p>
      <div class="computer-price">
        <div>
          <span class="price">$${computer.pricePerHour}</span>
          <span class="price-unit">/hora</span>
        </div>
        <div class="rating">
          ${stars} <span style="margin-left: 0.3rem;">(${computer.user.reviewsCount})</span>
        </div>
      </div>
    </div>
  `;

    return card;
}

// ========================================
// Chat Functions (Real-time)
// ========================================

function joinComputerRoom(computerId) {
    if (socket) {
        socket.emit('join-computer-room', computerId);
    }
}

async function sendMessageAPI(receiverId, computerId, message) {
    if (!authToken) {
        alert('Please login to send messages');
        return;
    }

    try {
        const data = await apiRequest('/chat', {
            method: 'POST',
            body: JSON.stringify({
                receiverId,
                computerId,
                message
            })
        });

        return data.message;
    } catch (error) {
        alert('Failed to send message: ' + error.message);
    }
}

async function loadMessages(computerId) {
    if (!authToken) return;

    try {
        const data = await apiRequest(`/chat/${computerId}`);
        displayMessages(data.messages);
    } catch (error) {
        console.error('Failed to load messages:', error);
    }
}

function displayMessages(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = '';

    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const isSent = msg.senderId === currentUser?.id;
        messageDiv.className = `message ${isSent ? 'message-sent' : 'message-received'}`;

        const time = new Date(msg.createdAt).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageDiv.innerHTML = `
      <p style="margin: 0;">${msg.message}</p>
      <small style="color: rgba(255,255,255,${isSent ? '0.8' : '0.6'}); font-size: 0.75rem; margin-top: 0.3rem; display: block;">${time}</small>
    `;

        container.appendChild(messageDiv);
    });

    container.scrollTop = container.scrollHeight;
}

function handleNewMessage(message) {
    if (!currentUser) return;

    const container = document.getElementById('chatMessages');
    if (!container) return;

    const messageDiv = document.createElement('div');
    const isSent = message.senderId === currentUser.id;
    messageDiv.className = `message ${isSent ? 'message-sent' : 'message-received'}`;

    const time = new Date(message.createdAt).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
    <p style="margin: 0;">${message.message}</p>
    <small style="color: rgba(255,255,255,${isSent ? '0.8' : '0.6'}); font-size: 0.75rem; margin-top: 0.3rem; display: block;">${time}</small>
  `;

    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

// ========================================
// Booking Functions
// ========================================

async function createBooking(computerId, priceAgreed) {
    if (!authToken) {
        alert('Please login to create a booking');
        window.location.href = 'login.html'; // You'd need to create this
        return;
    }

    try {
        const data = await apiRequest('/bookings', {
            method: 'POST',
            body: JSON.stringify({
                computerId,
                priceAgreed
            })
        });

        return data.booking;
    } catch (error) {
        alert('Failed to create booking: ' + error.message);
    }
}

async function startSession(bookingId) {
    try {
        const data = await apiRequest(`/bookings/${bookingId}/start`, {
            method: 'POST'
        });

        return data;
    } catch (error) {
        alert('Failed to start session: ' + error.message);
    }
}

// ========================================
// Page-Specific Initializations
// ========================================

// Marketplace page
if (document.getElementById('computerGrid')) {
    loadComputers();

    // Set up filters
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const priceFilter = document.getElementById('priceFilter');

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            const filters = gatherFilters();
            loadComputers(filters);
        }, 500));
    }

    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            const filters = gatherFilters();
            loadComputers(filters);
        });
    }
}

function gatherFilters() {
    const filters = {};

    const search = document.getElementById('searchInput')?.value;
    if (search) filters.search = search;

    const category = document.getElementById('categoryFilter')?.value;
    if (category && category !== 'all') filters.category = category;

    const price = document.getElementById('priceFilter')?.value;
    if (price && price !== 'all') {
        const [min, max] = price.split('-');
        if (min) filters.minPrice = min;
        if (max && max !== '+') filters.maxPrice = max;
    }

    return filters;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Computer detail page
const urlParams = new URLSearchParams(window.location.search);
const computerId = urlParams.get('id');

if (computerId && document.getElementById('chatMessages')) {
    // Load computer details
    loadComputerDetails(computerId);
    // Load chat messages
    loadMessages(computerId);
    // Join socket room
    joinComputerRoom(computerId);
}

async function loadComputerDetails(id) {
    try {
        const data = await apiRequest(`/computers/${id}`);
        // Display computer details (you'd populate the existing HTML)
        console.log('Computer loaded:', data.computer);
    } catch (error) {
        console.error('Failed to load computer:', error);
    }
}

// Mobile menu toggle
function toggleMobileMenu() {
    const navLinks = document.getElementById('navLinks');
    navLinks?.classList.toggle('active');
}

// Update UI based on auth state
function updateUIForAuthState() {
    const loginButtons = document.querySelectorAll('.btn-login');
    const profileButtons = document.querySelectorAll('.btn-profile');

    if (currentUser) {
        loginButtons.forEach(btn => btn.style.display = 'none');
        profileButtons.forEach(btn => {
            btn.style.display = 'inline-block';
            btn.textContent = currentUser.name || 'Profile';
        });
    }
}

updateUIForAuthState();

console.log('🟣 DeskShare loaded with real backend integration!');
console.log('🔗 API URL:', API_BASE_URL);
console.log('👤 Current user:', currentUser);
