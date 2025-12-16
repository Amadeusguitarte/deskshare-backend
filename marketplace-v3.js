// ========================================
// Marketplace Dynamic Functionality V3
// Using 'Profile' Card Layout (Vertical + Glow)
// ========================================

let allComputers = [];
let currentFilters = {};

document.addEventListener('DOMContentLoaded', async () => {
    await loadMarketplaceComputers();
    setupFilters();
});

async function loadMarketplaceComputers(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.category && filters.category !== 'all') params.append('category', filters.category);
        if (filters.minPrice) params.append('minPrice', filters.minPrice);
        if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
        if (filters.gpu && filters.gpu !== 'all') params.append('gpu', filters.gpu);
        if (filters.ram && filters.ram !== 'all') params.append('minRam', filters.ram);
        if (filters.sort) params.append('sort', filters.sort);

        const response = await apiRequest('/computers?' + params.toString());
        allComputers = response.computers || response;

        renderComputers(allComputers);
    } catch (error) {
        console.error('Error loading computers:', error);
        document.getElementById('computerGrid').innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1 / -1;">Error al cargar computadoras. Intenta de nuevo.</p>';
    }
}

function renderComputers(computers) {
    const grid = document.getElementById('computerGrid');
    if (!grid) return;

    // Update count
    const countElement = document.getElementById('computerCount');
    if (countElement) {
        countElement.innerHTML = `${computers.length} computadoras disponibles`;
    }

    if (!computers || computers.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1 / -1; padding: 3rem;">No se encontraron computadoras con estos filtros.</p>';
        return;
    }

    grid.innerHTML = computers.map(computer => {
        // Image
        let imageUrl = 'assets/workstation_professional_1765782988095.png';
        if (computer.images && computer.images.length > 0) {
            imageUrl = computer.images[0].imageUrl || computer.images[0].url || imageUrl;
        }

        // Status
        const isAvailable = computer.status === 'active';
        const status = isAvailable ?
            '<span style="background: rgba(0, 255, 0, 0.2); color: #00ff00; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid rgba(0, 255, 0, 0.3);">● Disponible</span>' :
            '<span style="background: rgba(255, 165, 0, 0.2); color: #ffa500; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid rgba(255, 165, 0, 0.3);">● Ocupado</span>';

        // Reviews
        const rating = computer.user?.rating || 5.0;
        const reviewCount = computer.user?.reviewsCount || 0;

        // Card HTML - EXACT COPY of Profile Card Layout + "Ver Detalles" button
        return `
            <div class="computer-card glass-card" style="display: flex; flex-direction: column; height: 100%;">
                <div style="position: relative;">
                    <img src="${imageUrl}" alt="${computer.name}" class="computer-image" 
                        style="width: 100%; height: 220px; object-fit: cover; border-bottom: 1px solid var(--glass-border);">
                     <div style="position: absolute; top: 12px; right: 12px;">
                       ${status}
                    </div>
                </div>
                
                <div class="computer-info" style="flex: 1; display: flex; flex-direction: column; padding: 1.25rem;">
                    <!-- Title & Description Header -->
                    <div style="margin-bottom: 1rem;">
                        <h3 class="computer-title" style="margin: 0 0 0.5rem 0; font-size: 1.4rem; font-weight: 700;">${computer.name}</h3>
                         <div style="margin-top: 0.5rem;">
                             <span style="font-size: 0.75rem; color: var(--accent-purple); font-weight: 600; display: block; margin-bottom: 4px;">DESCRIPCIÓN</span>
                             <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                                 ${computer.description || 'Sin descripción disponible.'}
                             </p>
                         </div>
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
                                 <span>★</span> ${rating} <span style="font-size: 0.8rem; color: var(--text-muted);">(${reviewCount})</span>
                            </div>
                            <a href="computer-detail.html?id=${computer.id}" class="btn btn-primary" style="padding: 0.4rem 1.2rem; font-size: 0.9rem; text-decoration: none; display: inline-block;">
                                Ver Detalles
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function setupFilters() {
    const applyButton = document.getElementById('applyFilters');
    const resetButton = document.getElementById('resetFilters');
    const sortSelect = document.getElementById('sortFilter');
    const searchInput = document.getElementById('searchInput');

    if (resetButton) resetButton.addEventListener('click', resetFilters);
    if (sortSelect) sortSelect.addEventListener('change', () => applyFilters());
    if (searchInput) searchInput.addEventListener('keyup', () => applyFilters());

    // Add listeners to all selects
    document.querySelectorAll('select').forEach(select => {
        if (select.id !== 'sortFilter') {
            select.addEventListener('change', () => applyFilters());
        }
    });
}

function gatherFilters() {
    return {
        category: document.getElementById('categoryFilter')?.value,
        minPrice: document.getElementById('minPrice')?.value, // Assuming input
        maxPrice: document.getElementById('maxPrice')?.value, // Assuming input
        gpu: document.getElementById('gpuFilter')?.value,
        ram: document.getElementById('ramFilter')?.value,
        sort: document.getElementById('sortFilter')?.value
    };
}

function applyFilters() {
    let filters = gatherFilters();
    Object.keys(filters).forEach(key => {
        if (filters[key] === 'all' || filters[key] === '') delete filters[key];
    });
    currentFilters = filters;
    loadMarketplaceComputers(filters);
}

function resetFilters() {
    document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
    document.querySelectorAll('input').forEach(i => i.value = '');
    currentFilters = {};
    loadMarketplaceComputers();
}
