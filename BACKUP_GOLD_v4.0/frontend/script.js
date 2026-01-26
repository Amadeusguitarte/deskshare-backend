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
            const errorMessage = data.details ? `${data.error}: ${data.details}` : (data.error || 'Request failed');
            throw new Error(errorMessage);
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

// Google OAuth login
async function loginWithGoogle() {
    try {
        // Load Google Identity Services
        if (!window.google) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);

            await new Promise((resolve) => {
                script.onload = resolve;
            });
        }

        // Initialize Google Sign-In
        window.google.accounts.id.initialize({
            client_id: '645815093848-q77jpkpk32fqo0v22fdlncc6f1mjc45f.apps.googleusercontent.com',
            callback: handleGoogleResponse
        });

        // Trigger the sign-in popup
        window.google.accounts.id.prompt();
    } catch (error) {
        console.error('Google login error:', error);
        alert('Error al iniciar sesión con Google');
    }
}

// Helper to decode JWT
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return {};
    }
}

// Handle Google OAuth response
async function handleGoogleResponse(response) {
    try {
        console.log('=== GOOGLE LOGIN DEBUG START ===');
        console.log('Raw Google response:', response);
        console.log('Google credential (JWT):', response.credential);

        // Decode Google Token immediately to get picture
        const googleUser = parseJwt(response.credential);
        console.log('Parsed Google user:', googleUser);

        const googlePicture = googleUser.picture;
        console.log('Extracted picture URL:', googlePicture);

        // BACKUP: Save Google picture locally in case backend loses it
        if (googlePicture) {
            localStorage.setItem('googleAvatar', googlePicture);
            console.log('✅ Saved to localStorage.googleAvatar');
        } else {
            console.error('❌ No picture in Google token!');
        }

        const data = await apiRequest('/auth/google', {
            method: 'POST',
            body: JSON.stringify({ idToken: response.credential })
        });

        console.log('Backend response:', data);
        console.log('Backend user object:', data.user);

        authToken = data.token;
        currentUser = data.user;

        // Force Google Picture if backend didn't provide one
        if (!currentUser.avatar && googlePicture) {
            currentUser.avatar = googlePicture;
            console.log('✅ Forced avatar from Google:', googlePicture);
        }

        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        console.log('Final currentUser saved to localStorage:', currentUser);
        console.log('=== GOOGLE LOGIN DEBUG END ===');

        initializeSocket();
        window.location.href = 'profile.html';
    } catch (error) {
        console.error('Google auth failed:', error);
        alert('Error al autenticar con Google: ' + error.message);
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

const GOOGLE_CLIENT_ID = '140142949138-750nr6507i1l0jqviu1ejc348prp8pj9.apps.googleusercontent.com';

async function loginWithGoogle() {
    try {
        // Check if Google SDK is loaded
        if (typeof google === 'undefined') {
            alert('Google SDK no está cargado. Recarga la página e intenta de nuevo.');
            return;
        }

        // Initialize Google Sign-In
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCallback
        });

        // Prompt for Google account
        google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                // Fallback to One Tap if prompt doesn't work
                console.log('Google One Tap not available, user may need to click button');
            }
        });

    } catch (error) {
        console.error('Google login failed:', error);
        alert('Error al iniciar sesión con Google: ' + error.message);
    }
}

async function handleGoogleCallback(response) {
    try {
        // Get ID token from Google
        const idToken = response.credential;

        console.log('Google login successful, sending to backend...');

        // Send to backend for verification
        const data = await apiRequest('/auth/google', {
            method: 'POST',
            body: JSON.stringify({ idToken })
        });

        // Save session
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        initializeSocket();

        // Check if coming from publish flow
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('redirect') === 'publish') {
            window.location.href = 'index.html?openPublish=true';
        } else {
            window.location.href = 'profile.html';
        }

    } catch (error) {
        console.error('Error processing Google login:', error);
        alert('Error al procesar login de Google: ' + error.message);
    }
}

// Make globally available
window.handleGoogleCallback = handleGoogleCallback;


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
    console.log('Legacy loadMessages disabled in script.js');
    return;
}

function displayMessages(messages) {
    console.log('Legacy displayMessages disabled in script.js');
    return;
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

// Marketplace page - DISABLED: Now handled by marketplace-dynamic.js
// if (document.getElementById('computerGrid')) {
//     loadComputers();

//     // Set up filters
//     const searchInput = document.getElementById('searchInput');
//     const categoryFilter = document.getElementById('categoryFilter');
//     const priceFilter = document.getElementById('priceFilter');

//     if (searchInput) {
//         searchInput.addEventListener('input', debounce(() => {
//             const filters = gatherFilters();
//             loadComputers(filters);
//         }, 500));
//     }

//     if (categoryFilter) {
//         categoryFilter.addEventListener('change', () => {
//             const filters = gatherFilters();
//             loadComputers(filters);
//         });
//     }
// }

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

// DISABLED: Modern logic moved to computer-detail-dynamic.js to prevent race conditions
// if (computerId && document.getElementById('chatMessages')) {
//    loadComputerDetails(computerId);
//    loadMessages(computerId);
//    joinComputerRoom(computerId);
// }

async function loadComputerDetails(id) {
    try {
        const data = await apiRequest(`/computers/${id}`);
        const computer = data.computer;

        // Update browser title
        document.title = `${computer.name} - DeskShare`;

        // 1. Populate Images
        const mainImage = document.getElementById('mainImage');
        if (mainImage) {
            let primaryParams = computer.images.find(img => img.isPrimary) || computer.images[0];
            mainImage.src = primaryParams?.imageUrl || 'assets/hero_background_1765783023163.png';
            mainImage.alt = computer.name;
        }

        // Handle Thumbnails (Only if > 1 image)
        const thumbnailRow = document.getElementById('thumbnailRow');
        if (thumbnailRow) {
            thumbnailRow.innerHTML = ''; // Clear existing

            if (computer.images && computer.images.length > 1) {
                computer.images.slice(0, 3).forEach(img => {
                    const thumb = document.createElement('div');
                    thumb.className = 'glass-card';
                    thumb.style.cssText = 'padding: 0; overflow: hidden; height: 100px; cursor: pointer; opacity: 0.7; transition: opacity 0.3s;';
                    thumb.onmouseover = () => { mainImage.src = img.imageUrl; thumb.style.opacity = '1'; };
                    thumb.onmouseout = () => { thumb.style.opacity = '0.7'; };

                    thumb.innerHTML = `<img src="${img.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
                    thumbnailRow.appendChild(thumb);
                });
            } else {
                thumbnailRow.style.display = 'none'; // Hide container completely
            }
        }

        // 2. Populate Text Info
        // Note: You need to add IDs to these elements in HTML first, but for now I'll use placeholders 
        // assuming standard IDs might exist or will be added. 
        // Based on typical structure:
        const titleEl = document.querySelector('h1'); // Assuming h1 is title
        if (titleEl) titleEl.textContent = computer.name;

        // ... This part is tricky without seeing IDs in HTML file fully. 
        // I will focus on the user request: Images and spacing.

        console.log('Computer loaded:', computer);
    } catch (error) {
        console.error('Failed to load computer:', error);
    }
}

// Mobile menu toggle
function toggleMobileMenu() {
    const navLinks = document.getElementById('navLinks');
    navLinks?.classList.toggle('active');
}


// ========================================
// Auth Helper Functions
// ========================================

function checkAuth() {
    return !!authToken && !!currentUser;
}

function redirectIfNotLoggedIn() {
    if (!checkAuth()) {
        window.location.href = 'login.html';
        return true;
    }
    return false;
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    authToken = null;
    currentUser = null;
    if (socket) {
        socket.disconnect();
    }
    window.location.href = 'index.html';
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

// ========================================
// UI Helper Functions
// ========================================

function updateAuthHeader() {
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

    const isLoggedIn = !!localStorage.getItem('authToken');
    const profileLink = Array.from(navLinks.querySelectorAll('a')).find(a => a.textContent.includes('Mi Perfil') || a.href.includes('profile.html'));

    // Find "Publicar PC" link to handle auth check on click
    const publishLink = Array.from(navLinks.querySelectorAll('a')).find(a => a.textContent.includes('Publicar PC'));

    if (isLoggedIn) {
        if (profileLink) {
            // SAFEGUARD: Don't overwrite if it contains an image or svg (Avatar/Icon)
            if (!profileLink.innerHTML.includes('<img') && !profileLink.innerHTML.includes('<svg')) {
                profileLink.textContent = 'Mi Perfil';
            }
            profileLink.href = 'profile.html';
        }
    } else {
        if (profileLink) {
            // SAFEGUARD: Don't overwrite if it contains an image or svg
            if (!profileLink.innerHTML.includes('<img') && !profileLink.innerHTML.includes('<svg')) {
                profileLink.textContent = 'Iniciar Sesión';
            }
            profileLink.href = 'login.html';
        }

        // Optional: Intercept Publish PC to redirect to login if not logged in
        if (publishLink) {
            publishLink.onclick = (e) => {
                e.preventDefault();
                window.location.href = 'login.html?redirect=publish.html';
            };
        }
    }
}

// Load User Profile Data
function loadUserProfile() {
    // Only run on profile page
    if (!document.getElementById('profileName')) return;

    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    const nameEl = document.getElementById('profileName');
    const memberSinceEl = document.getElementById('memberSince');
    const avatarEl = document.getElementById('profileAvatar');
    const defaultIconEl = document.getElementById('profileIcon');

    if (nameEl) nameEl.textContent = currentUser.name || 'Usuario';
    if (memberSinceEl) {
        // Use createdAt or fallback to "Hoy" instead of hardcoded year
        // If user just registered, createdAt might be missing in some auth flows, so default to Now
        const dateStr = currentUser.createdAt || new Date().toISOString();
        const date = new Date(dateStr).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        memberSinceEl.textContent = `Miembro desde: ${date}`;
    }

    // Try to load avatar from any available source
    const avatarUrl = currentUser.avatar || currentUser.avatarUrl || currentUser.picture || currentUser.image || currentUser.photoUrl || localStorage.getItem('googleAvatar');

    if (avatarEl && avatarUrl) {
        avatarEl.src = avatarUrl;
        avatarEl.style.display = 'block';
        // If image loads successfully, hide the icon
        avatarEl.onload = () => {
            if (defaultIconEl) defaultIconEl.style.display = 'none';
        };
        // If image fails, show icon and hide img
        avatarEl.onerror = () => {
            avatarEl.style.display = 'none';
            if (defaultIconEl) defaultIconEl.style.display = 'block';
        };
    } else {
        // No URL available - hide img, show icon
        if (avatarEl) avatarEl.style.display = 'none';
        if (defaultIconEl) defaultIconEl.style.display = 'block';
    }
}

// Run auth check and profile load on load
document.addEventListener('DOMContentLoaded', () => {
    updateAuthHeader();
    loadUserProfile();
});
