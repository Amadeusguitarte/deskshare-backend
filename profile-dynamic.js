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

    div.className = 'computer-card glass-card';
    div.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div style="position: relative;">
                <img src="${imageUrl}" alt="${computer.name}" class="computer-image" 
                    style="width: 100%; height: 220px; object-fit: cover; border-bottom: 1px solid var(--glass-border);">
                 <div style="position: absolute; top: 12px; right: 12px;">
                   ${status}
                </div>
            </div>
            
            <div class="computer-info" style="flex: 1; display: flex; flex-direction: column; padding: 1.25rem;">
                <!-- Title & Header -->
                <div style="margin-bottom: 1rem;">
                    <h3 class="computer-title" style="margin: 0 0 0.5rem 0; font-size: 1.4rem; font-weight: 700;">${computer.name}</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                         ${computer.description || 'Sin descripción disponible.'}
                    </p>
                </div>

                <!-- Divider -->
                <div style="height: 1px; background: var(--glass-border); margin-bottom: 1rem; width: 100%;"></div>

                <!-- Specs Header -->
                <h4 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin: 0 0 0.75rem 0; font-weight: 600;">Especificaciones</h4>

                <!-- Structured Specs Grid -->
                <div class="computer-info" style="flex: 1; display: flex; flex-direction: column; padding: 1.25rem;">
                    <!-- Title & Header -->
                    <div style="margin-bottom: 1rem;">
                        <h3 class="computer-title" style="margin: 0 0 0.5rem 0; font-size: 1.4rem; font-weight: 700;">${computer.name}</h3>
                        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                             ${computer.description || 'Sin descripción disponible.'}
                        </p>
                    </div>

                    <!-- Divider -->
                    <div style="height: 1px; background: var(--glass-border); margin-bottom: 1rem; width: 100%;"></div>

                    <!-- Specs Header -->
                    <h4 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin: 0 0 0.75rem 0; font-weight: 600;">Especificaciones</h4>

                    <!-- Structured Specs Grid -->
                    <div class="computer-specs" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.5rem;">
                        <div style="display: flex; flex-direction: column;">
                             <span style="font-size: 0.75rem; color: var(--accent-purple);">CPU</span>
                             <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${computer.cpu || 'N/A'}</span>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                             <span style="font-size: 0.75rem; color: var(--accent-purple);">GPU</span>
                             <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${computer.gpu || 'N/A'}</span>
                        </div>
                         <div style="display: flex; flex-direction: column;">
                             <span style="font-size: 0.75rem; color: var(--accent-purple);">RAM</span>
                             <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${computer.ram ? computer.ram + 'GB' : 'N/A'}</span>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                             <span style="font-size: 0.75rem; color: var(--accent-purple);">Software</span>
                             <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${computer.softwareInstalled || 'N/A'}</span>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="computer-footer" style="margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
                        <div class="computer-price">
                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 2px;">Precio</div>
                            <span class="price" style="font-size: 1.6rem;">$${computer.pricePerHour}</span>
                            <span class="price-unit">/hora</span>
                        </div>
                        <div style="text-align: right;">
                             <div class="rating" style="justify-content: flex-end; margin-bottom: 0.5rem;">
                                 <span>★</span> ${rating}
                            </div>
                            <button class="btn btn-secondary" onclick="editComputer(${computer.id})" style="padding: 0.4rem 1.2rem; font-size: 0.9rem;">
                                Gestionar
                            </button>
                        </div>
                    </div>
                </div>


                <!-- Footer -->
                <div class="computer-footer" style="margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
                    <div class="computer-price">
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 2px;">Precio</div>
                        <span class="price" style="font-size: 1.6rem;">$${computer.pricePerHour}</span>
                        <span class="price-unit">/hora</span>
                    </div>
                    <div style="text-align: right;">
                         <div class="rating" style="justify-content: flex-end; margin-bottom: 0.5rem;">
                             <span>★</span> ${rating}
                        </div>
                        <button class="btn btn-secondary" onclick="editComputer(${computer.id})" style="padding: 0.4rem 1.2rem; font-size: 0.9rem;">
                            Gestionar
                        </button>
                    </div>
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
