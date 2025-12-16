// ========================================
// Profile Page Dynamic Functionality
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Redirect if not logged in
    redirectIfNotLoggedIn();
    try {
        await loadUserProfile();
        await loadUserComputers();
        await loadUserBookings();
    } catch (error) {
        console.error('Error loading profile:', error);
    }
});
async function loadUserProfile() {
    try {
        const response = await apiRequest('/users/me');
        const user = response.user || response;
        // Update profile header
        document.querySelector('h1').textContent = user.name;

        // Update avatar
        const avatarImg = document.getElementById('profileAvatar');
        const avatarIcon = document.getElementById('profileIcon');
        if (user.avatarUrl) {
            avatarImg.src = user.avatarUrl;
            avatarImg.style.display = 'block';
            avatarIcon.style.display = 'none';
        }

        const memberSince = new Date(user.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'long' });
        document.querySelector('p[style*="color: var(--text-secondary)"]').textContent = `Miembro desde ${memberSince}`;
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}
async function loadUserComputers() {
    try {
        const response = await apiRequest('/computers?userId=' + currentUser.id);
        const computers = response.computers || response;
        const container = document.querySelector('#computersTab .grid');
        container.innerHTML = '';
        if (computers.length === 0) {
            container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary);">No tienes computadoras publicadas aún.</p>';
            return;
        }
        computers.forEach(computer => {
            const card = createComputerCard(computer);
            container.appendChild(card);
        });
        // Update stats - target the dashboard stats grid specifically
        const statsCards = document.querySelectorAll('.grid.grid-3 > .glass-card');
        if (statsCards.length >= 1) {
            statsCards[0].querySelector('div[style*="font-size: 2rem"]').textContent = computers.length;
        }
    } catch (error) {
        console.error('Error loading computers:', error);
    }
}
function createComputerCard(computer) {
    const div = document.createElement('div');
    div.className = 'glass-card';
    const isAvailable = computer.status === 'active' && (!computer.bookings || computer.bookings.length === 0);
    const status = isAvailable ?
        '<span style="background: rgba(0, 255, 0, 0.2); color: #00ff00; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid rgba(0, 255, 0, 0.3);">● Disponible</span>' :
        '<span style="background: rgba(255, 165, 0, 0.2); color: #ffa500; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid rgba(255, 165, 0, 0.3);">● Ocupado</span>';

    // Fix image URL handling - prioritize imageUrl from new backend logic
    let imageUrl = 'assets/workstation_professional_1765782988095.png';
    if (computer.images && computer.images.length > 0) {
        if (computer.images[0].imageUrl) imageUrl = computer.images[0].imageUrl;
        else if (computer.images[0].url) imageUrl = computer.images[0].url;
    }
    // Format reviews
    const rating = computer.user?.rating || 5.0;
    const reviewCount = computer.user?.reviewsCount || 0;
    const ratingStar = '★';

    div.className = 'computer-card glass-card'; // Ensure class for hover effect
    div.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div style="position: relative;">
                <img src="${imageUrl}" alt="${computer.name}" class="computer-image" 
                    style="width: 100%; height: 200px; object-fit: cover; border-bottom: 1px solid var(--glass-border);">
                 <div style="position: absolute; top: 10px; right: 10px;">
                   ${status}
                </div>
            </div>
            
            <div class="computer-info" style="flex: 1; display: flex; flex-direction: column; padding: 1.25rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <h3 class="computer-title" style="margin: 0; font-size: 1.3rem;">${computer.name}</h3>
                </div>

                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${computer.description || 'Sin descripción disponible.'}
                </p>

                <div class="computer-specs" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;">
                    <span class="spec-badge">CPU: ${computer.cpu || 'N/A'}</span>
                    <span class="spec-badge">GPU: ${computer.gpu || 'N/A'}</span>
                    <span class="spec-badge">RAM: ${computer.ram ? computer.ram + 'GB' : 'N/A'}</span>
                </div>

                <div class="computer-footer" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
                    <div class="computer-price">
                        <span class="price">$${computer.pricePerHour}</span>
                        <span class="price-unit">/hora</span>
                    </div>
                    <div class="rating">
                         <span>★</span> ${rating}
                    </div>
                </div>
                 <button class="btn btn-secondary" onclick="editComputer(${computer.id})"
                    style="width: 100%; margin-top: 1rem; padding: 0.5rem;">
                    Gestionar
                </button>
            </div>
        </div>
    `;
    return div;
}

function editComputer(id) {
    // Placeholder for edit functionality
    alert('Editar computadora ' + id);
}
async function loadUserBookings() {
    try {
        const response = await apiRequest('/bookings/my-bookings');
        const bookings = response.bookings || response;

        // Target the dashboard stats grid specifically
        const statsCards = document.querySelectorAll('.grid.grid-3 > .glass-card');

        // Update earnings stat (second card)
        const totalEarnings = bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
        if (statsCards.length >= 2) {
            statsCards[1].querySelector('div[style*="font-size: 2rem"]').textContent = '$' + totalEarnings.toFixed(0);
        }

        // Update hours stat (third card)
        const totalHours = bookings.reduce((sum, b) => sum + (b.actualDurationHours || 0), 0);
        if (statsCards.length >= 3) {
            statsCards[2].querySelector('div[style*="font-size: 2rem"]').textContent = totalHours.toFixed(0);
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
    }
}
function editComputer(id) {
    // TODO: Open edit modal
    alert('Edit functionality coming soon. Computer ID: ' + id);
}
