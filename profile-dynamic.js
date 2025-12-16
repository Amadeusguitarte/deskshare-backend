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

    div.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%;">
            <!-- Image Container -->
            <div style="position: relative; width: 100%; height: 220px; overflow: hidden;">
                <img src="${imageUrl}" alt="${computer.name}" loading="lazy"
                    style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;">
                <div style="position: absolute; top: 12px; right: 12px;">
                   ${status}
                </div>
            </div>
            
            <!-- Content Container -->
            <div style="padding: 1.25rem; flex: 1; display: flex; flex-direction: column;">
                
                <!-- Header -->
                <div style="margin-bottom: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <h3 style="font-size: 1.25rem; font-weight: 700; line-height: 1.3; margin: 0; color: var(--text-primary);">${computer.name}</h3>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 0.9rem; color: #fbbf24;">
                            <span>${ratingStar}</span>
                            <span style="font-weight: 600;">${rating}</span>
                            <span style="color: var(--text-muted);">(${reviewCount})</span>
                        </div>
                    </div>
                </div>

                <!-- Specs Grid (Fiverr/Airbnb style) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem; margin-bottom: 1.5rem; background: rgba(255,255,255,0.03); padding: 1rem; border-radius: var(--radius-sm);">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Procesador</span>
                        <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${computer.cpu || 'N/A'}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Tarjeta Gráfica</span>
                        <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${computer.gpu || 'N/A'}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">RAM</span>
                        <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${computer.ram ? computer.ram + 'GB' : 'N/A'}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Almacenamiento</span>
                        <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${computer.storage || 'N/A'}</span>
                    </div>
                </div>

                <!-- Footer (Price & Action) -->
                <div style="margin-top: auto; display: flex; items-align: center; justify-content: space-between; padding-top: 1rem; border-top: 1px solid var(--glass-border);">
                    <div>
                        <span style="font-size: 0.85rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Precio por hora</span>
                        <div style="display: flex; align-items: baseline; gap: 2px;">
                            <span style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">$${computer.pricePerHour}</span>
                            <span style="font-size: 0.9rem; color: var(--text-muted);">USD</span>
                        </div>
                    </div>
                    <button class="btn btn-secondary" onclick="editComputer(${computer.id})"
                        style="padding: 0.5rem 1.25rem; font-weight: 600; border-width: 1px;">
                        Gestionar
                    </button>
                </div>
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
