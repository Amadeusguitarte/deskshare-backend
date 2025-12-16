// ========================================
// Marketplace Dynamic Functionality
// ========================================

let allComputers = [];
let currentFilters = {};

document.addEventListener('DOMContentLoaded', async () => {
    await loadMarketplaceComputers();
    setupFilters();
});

async function loadMarketplaceComputers(filters = {}) {
    try {
        // Build query params
        const params = new URLSearchParams();
        if (filters.category) params.append('category', filters.category);
        if (filters.minPrice) params.append('minPrice', filters.minPrice);
        if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
        if (filters.gpu) params.append('gpu', filters.gpu);
        if (filters.ram) params.append('minRam', filters.ram);
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

    if (!grid) {
        console.error('Computer grid not found');
        return;
    }

    if (computers.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1 / -1;">No se encontraron computadoras con estos filtros.</p>';
        return;
    }

    // Update computer count
    const countElement = document.getElementById('computerCount');
    if (countElement) {
        countElement.innerHTML = `${computers.length} computadoras disponibles`;
    }

    grid.innerHTML = computers.map(computer => {
        // Image handling
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
        const ratingStar = '★';

        return `
            <div class="glass-card" style="display: flex; flex-direction: column; height: 100%; transition: transform 0.3s ease;">
                <!-- Image Container -->
                <div style="margin: 0.75rem 0.75rem 0 0.75rem; border-radius: var(--radius-lg); overflow: hidden; height: 200px; position: relative;">
                    <img src="${imageUrl}" alt="${computer.name}" loading="lazy"
                        style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;"
                        onerror="this.src='assets/workstation_professional_1765782988095.png'">
                    <div style="position: absolute; top: 10px; right: 10px;">
                       ${status}
                    </div>
                </div>
                
                <!-- Content Container -->
                <div style="padding: 1rem; flex: 1; display: flex; flex-direction: column;">
                    
                    <!-- Header -->
                    <div style="margin-bottom: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem;">
                            <h3 style="font-size: 1.2rem; font-weight: 700; line-height: 1.3; margin: 0; color: var(--text-primary);">${computer.name}</h3>
                            <div style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem; color: #fbbf24;">
                                <span>${ratingStar}</span>
                                <span style="font-weight: 600;">${rating}</span>
                                <span style="color: var(--text-muted);">(${reviewCount})</span>
                            </div>
                        </div>
                    </div>

                    <!-- Specs Grid -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 0.75rem; margin-bottom: 1rem; background: rgba(255,255,255,0.03); padding: 0.75rem; border-radius: var(--radius-sm);">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Procesador</span>
                            <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${computer.cpu || 'N/A'}</span>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Gráfica</span>
                            <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${computer.gpu || 'N/A'}</span>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">RAM</span>
                            <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${computer.ram ? computer.ram + 'GB' : 'N/A'}</span>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Almacenamiento</span>
                            <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${computer.storage || 'N/A'}</span>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="margin-top: auto; display: flex; items-align: center; justify-content: space-between; padding-top: 0.75rem; border-top: 1px solid var(--glass-border);">
                        <div>
                            <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Precio por hora</span>
                            <div style="display: flex; align-items: baseline; gap: 2px;">
                                <span style="font-size: 1.3rem; font-weight: 700; color: var(--text-primary);">$${computer.pricePerHour}</span>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">USD</span>
                            </div>
                        </div>
                        <a href="computer-detail.html?id=${computer.id}" class="btn btn-primary" 
                            style="padding: 0.4rem 1rem; font-weight: 600; font-size: 0.9rem; text-decoration: none; display: inline-flex; align-items: center;">
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
    const sortSelect = document.getElementById('sortBy');

    if (applyButton) {
        applyButton.addEventListener('click', applyFilters);
    }

    if (resetButton) {
        resetButton.addEventListener('click', resetFilters);
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentFilters.sort = e.target.value;
            loadMarketplaceComputers(currentFilters);
        });
    }
}

function applyFilters() {
    const filters = {
        category: document.getElementById('categoryFilter')?.value,
        minPrice: document.getElementById('minPrice')?.value,
        maxPrice: document.getElementById('maxPrice')?.value,
        gpu: document.getElementById('gpuFilter')?.value,
        ram: document.getElementById('ramFilter')?.value,
        sort: document.getElementById('sortBy')?.value
    };

    // Remove empty filters
    Object.keys(filters).forEach(key => {
        if (!filters[key] || filters[key] === 'all') delete filters[key];
    });

    currentFilters = filters;
    loadMarketplaceComputers(filters);
}

function resetFilters() {
    // Reset form
    document.querySelectorAll('#filterForm select, #filterForm input').forEach(input => {
        if (input.tagName === 'SELECT') {
            input.selectedIndex = 0;
        } else {
            input.value = '';
        }
    });

    currentFilters = {};
    loadMarketplaceComputers();
}
