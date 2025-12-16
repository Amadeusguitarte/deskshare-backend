// ========================================
// Marketplace Dynamic Functionality V3
// Using 'Profile' Card Layout (Vertical + Glow)
// ========================================

let allComputers = [];
let currentFilters = {};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('V3 SCRIPT LOADED - GRID LAYOUT');
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

    // Update count - FIX: Only update the number, not the text
    const countElement = document.getElementById('computerCount');
    if (countElement) {
        countElement.textContent = computers.length;
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
            '<span style="background: rgba(0, 255, 0, 0.2); color: #00ff00; padding: 0.25rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.75rem; border: 1px solid rgba(0, 255, 0, 0.3); font-weight: 600;">● Disponible</span>' :
            '<span style="background: rgba(255, 165, 0, 0.2); color: #ffa500; padding: 0.25rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.75rem; border: 1px solid rgba(255, 165, 0, 0.3); font-weight: 600;">● Ocupado</span>';

        // Reviews
        const rating = computer.user?.rating || 5.0;
        const reviewCount = computer.user?.reviewsCount || 0;

        // Card HTML - REFINED LAYOUT
        return `
            <div class="computer-card glass-card" style="display: flex; flex-direction: column; height: 100%;">
                <div style="position: relative;">
                    <img src="${imageUrl}" alt="${computer.name}" class="computer-image" 
                        style="width: 100%; height: 200px; object-fit: cover; border-bottom: 1px solid var(--glass-border);">
                     <div style="position: absolute; top: 12px; right: 12px;">
                       ${status}
                    </div>
                </div>
                
                <div class="computer-info" style="flex: 1; display: flex; flex-direction: column; padding: 1.25rem;">
                    <!-- Title & Header -->
                    <div style="margin-bottom: 1rem;">
                        <h3 class="computer-title" style="margin: 0 0 0.25rem 0; font-size: 1.3rem; font-weight: 700;">${computer.name}</h3>
                         <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                             <span style="color: #fbbf24; font-size: 0.9rem;">★ ${rating}</span>
                             <span style="color: var(--text-muted); font-size: 0.8rem;">(${reviewCount})</span>
                        </div>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.8em;">
                            ${computer.description || 'Sin descripción disponible.'}
                        </p>
                    </div>

                    <!-- Divider -->
                    <div style="height: 1px; background: var(--glass-border); margin-bottom: 1rem; width: 100%;"></div>

                    <!-- Structured Specs Grid -->
                    <div class="computer-specs" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 0.5rem; margin-bottom: 1.5rem;">
                        <div>
                             <span style="font-size: 0.7rem; color: var(--accent-purple); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Procesador</span>
                             <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${computer.cpu || 'N/A'}</span>
                        </div>
                        <div>
                             <span style="font-size: 0.7rem; color: var(--accent-purple); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Gráfica</span>
                             <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${computer.gpu || 'N/A'}</span>
                        </div>
                         <div>
                             <span style="font-size: 0.7rem; color: var(--accent-purple); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">RAM</span>
                             <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${computer.ram ? computer.ram + 'GB' : 'N/A'}</span>
                        </div>
                        <div>
                             <span style="font-size: 0.7rem; color: var(--accent-purple); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Software</span>
                             <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; display: block;" title="${computer.softwareInstalled}">${computer.softwareInstalled || 'N/A'}</span>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="computer-footer" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
                        <div class="computer-price">
                            <span class="price" style="font-size: 1.5rem; font-weight: 700; color: white;">$${computer.pricePerHour}</span>
                            <span class="price-unit" style="font-size: 0.85rem; color: var(--text-muted);">/hora</span>
                        </div>
                        <a href="computer-detail.html?id=${computer.id}" class="btn btn-primary" style="padding: 0.5rem 1.2rem; font-size: 0.9rem; border-radius: 8px;">
                            Ver Detalles
                        </a>
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
