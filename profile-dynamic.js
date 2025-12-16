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
        document.querySelector('[alt="Profile"]').src = user.avatarUrl || 'assets/user_avatar_1_1765783036666.png';

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

        // Update stats
        document.querySelectorAll('.glass-card')[0].querySelector('div[style*="font-size: 2rem"]').textContent = computers.length;

    } catch (error) {
        console.error('Error loading computers:', error);
    }
}

function createComputerCard(computer) {
    const div = document.createElement('div');
    div.className = 'glass-card';

    const status = computer.isAvailable ?
        '<span style="background: rgba(0, 255, 0, 0.2); color: #00ff00; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid rgba(0, 255, 0, 0.3);">● Activo</span>' :
        '<span style="background: rgba(255, 165, 0, 0.2); color: #ffa500; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid rgba(255, 165, 0, 0.3);">● Ocupado</span>';

    const imageUrl = computer.images && computer.images[0] ? computer.images[0].url : 'assets/workstation_professional_1765782988095.png';

    div.innerHTML = `
        <div style="display: flex; gap: 1.5rem;">
            <img src="${imageUrl}" alt="${computer.name}"
                style="width: 120px; height: 120px; object-fit: cover; border-radius: var(--radius-md);">
            <div style="flex: 1;">
                <h3 style="margin-bottom: 0.5rem; font-size: 1.2rem;">${computer.name}</h3>
                <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                    <span class="spec-badge" style="font-size: 0.75rem;">${computer.cpu || 'CPU'}</span>
                    <span class="spec-badge" style="font-size: 0.75rem;">${computer.gpu || 'GPU'}</span>
                    <span class="spec-badge" style="font-size: 0.75rem;">${computer.ram || 'RAM'}GB</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
                    <div>
                        <span class="price" style="font-size: 1.5rem;">$${computer.pricePerHour}</span>
                        <span class="price-unit">/hora</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-secondary" onclick="editComputer(${computer.id})"
                            style="padding: 0.5rem 1rem; font-size: 0.9rem;">Editar</button>
                        ${status}
                    </div>
                </div>
            </div>
        </div>
    `;

    return div;
}

async function loadUserBookings() {
    try {
        const response = await apiRequest('/bookings/my-bookings');
        const bookings = response.bookings || response;

        // Update earnings stat
        const totalEarnings = bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
        document.querySelectorAll('.glass-card')[1].querySelector('div[style*="font-size: 2rem"]').textContent = '$' + totalEarnings.toFixed(0);

        // Update hours stat
        const totalHours = bookings.reduce((sum, b) => sum + (b.actualDurationHours || 0), 0);
        document.querySelectorAll('.glass-card')[2].querySelector('div[style*="font-size: 2rem"]').textContent = totalHours.toFixed(0);

    } catch (error) {
        console.error('Error loading bookings:', error);
    }
}

function editComputer(id) {
    // TODO: Open edit modal
    alert('Edit functionality coming soon. Computer ID: ' + id);
}
