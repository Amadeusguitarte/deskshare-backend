// ========================================
// Marketplace Dynamic Functionality V3
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

        // Debug logging
        console.log('Rendering computers (V3):', allComputers);
        renderComputers(allComputers);
    } catch (error) {
        console.error('Error loading computers:', error);
        document.getElementById('computerGrid').innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1 / -1;">Error al cargar computadoras. Intenta de nuevo.</p>';
    }
}

function renderComputers(computers) {
    const grid = document.getElementById('computerGrid');
    if (!grid) return;

    // Update count always
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
            '<span style="display:inline-block; background: rgba(0, 255, 0, 0.15); color: #4ade80; padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.75rem; font-weight: 600; border: 1px solid rgba(74, 222, 128, 0.2);">● Disponible</span>' :
            '<span style="display:inline-block; background: rgba(255, 170, 0, 0.15); color: #fbbf24; padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.75rem; font-weight: 600; border: 1px solid rgba(251, 191, 36, 0.2);">● Ocupado</span>';

        // Reviews
        const rating = computer.user?.rating || 5.0;
        const reviewCount = computer.user?.reviewsCount || 0;

        return `
            <div class="glass-card computer-card" style="display: flex; flex-direction: column; height: 100%; overflow: hidden; transition: transform 0.2s, box-shadow 0.2s;">
                <!-- Image Wrapper -->
                <div style="position: relative; height: 220px; width: 100%;">
                    <img src="${imageUrl}" alt="${computer.name}" style="width: 100%; height: 100%; object-fit: cover;">
                    <div style="position: absolute; top: 12px; right: 12px; z-index: 10;">
                        ${status}
                    </div>
                    <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 60px; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);"></div>
                </div>
                
                <!-- Content -->
                <div style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column;">
                    
                    <!-- Title and Price Row -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <h3 style="font-size: 1.25rem; font-weight: 700; color: white; margin: 0; line-height: 1.3;">${computer.name}</h3>
                        <div style="text-align: right;">
                            <span style="display: block; font-size: 1.5rem; font-weight: 700; color: var(--primary-purple);">$${computer.pricePerHour}</span>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">/hora</span>
                        </div>
                    </div>

                    <!-- Rating -->
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                        <span style="color: #fbbf24;">★</span>
                        <span style="font-weight: 600; color: var(--text-primary);">${rating}</span>
                        <span style="color: var(--text-muted); font-size: 0.85rem;">(${reviewCount} reseñas)</span>
                    </div>

                    <!-- Divider -->
                    <div style="height: 1px; background: rgba(255,255,255,0.1); margin-bottom: 1rem;"></div>

                    <!-- Specs Grid with LABELS -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 1.5rem; margin-bottom: 1.5rem;">
                        <!-- CPU -->
                        <div>
                            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 2px;">Procesador</span>
                            <span style="font-size: 0.95rem; color: white; font-weight: 500;">${computer.cpu || 'N/A'}</span>
                        </div>
                        
                        <!-- RAM -->
                        <div>
                            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 2px;">Memoria RAM</span>
                            <span style="font-size: 0.95rem; color: white; font-weight: 500;">${computer.ram ? computer.ram + ' GB' : 'N/A'}</span>
                        </div>

                        <!-- GPU -->
                        <div>
                            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 2px;">Tarjeta Gráfica</span>
                            <span style="font-size: 0.95rem; color: white; font-weight: 500;">${computer.gpu || 'N/A'}</span>
                        </div>

                        <!-- Software (Full Width) -->
                        <div style="grid-column: 1 / -1;">
                            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); display: block; margin-bottom: 2px;">Software Incluido</span>
                            <span style="font-size: 0.9rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${computer.softwareInstalled || 'Ninguno'}</span>
                        </div>
                    </div>

                    <!-- Action Button -->
                    <div style="margin-top: auto;">
                        <a href="computer-detail.html?id=${computer.id}" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 0.75rem;">
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
    // Normalize 'all' to undefined
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
