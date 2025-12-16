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
            <div class="glass-card" style="display: flex; gap: 1.5rem; padding: 1rem; align-items: flex-start; height: auto;">
                <!-- Image (Left) -->
                <div style="flex-shrink: 0; width: 220px; height: 160px; border-radius: var(--radius-md); overflow: hidden; position: relative;">
                    <img src="${imageUrl}" alt="${computer.name}" loading="lazy"
                        style="width: 100%; height: 100%; object-fit: cover;"
                        onerror="this.src='assets/workstation_professional_1765782988095.png'">
                    <div style="position: absolute; top: 8px; left: 8px;">
                       ${status}
                    </div>
                </div>
                
                <!-- Content (Right) -->
                <div style="flex: 1; min-width: 0;">
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <div>
                             <h3 style="font-size: 1.4rem; margin: 0; color: var(--text-primary); line-height: 1.2;">${computer.name}</h3>
                             <div style="display: flex; align-items: center; gap: 4px; font-size: 0.9rem; color: #fbbf24; margin-top: 4px;">
                                <span>${ratingStar}</span>
                                <span style="font-weight: 600;">${rating}</span>
                                <span style="color: var(--text-muted);">(${reviewCount})</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); display: block;">$${computer.pricePerHour}</span>
                            <span style="font-size: 0.85rem; color: var(--text-muted);">/hora</span>
                        </div>
                    </div>

                    <!-- Description -->
                    <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 1rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${computer.description || 'Sin descripción disponible.'}
                    </p>

                    <!-- Specs List -->
                    <div style="display: flex; flex-wrap: wrap; gap: 1.5rem; font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 1rem; padding-top: 0.5rem; border-top: 1px solid var(--glass-border);">
                        <div><strong style="color: var(--text-primary);">CPU:</strong> ${computer.cpu || 'N/A'}</div>
                        <div><strong style="color: var(--text-primary);">GPU:</strong> ${computer.gpu || 'N/A'}</div>
                        <div><strong style="color: var(--text-primary);">RAM:</strong> ${computer.ram ? computer.ram + 'GB' : 'N/A'}</div>
                        <div style="flex: 1;"><strong style="color: var(--text-primary);">Software:</strong> ${computer.softwareInstalled || 'N/A'}</div>
                    </div>

                    <!-- Action -->
                    <div style="text-align: right;">
                        <a href="computer-detail.html?id=${computer.id}" class="btn btn-primary" 
                            style="padding: 0.5rem 1.5rem; font-weight: 600; font-size: 0.95rem; text-decoration: none; display: inline-flex; align-items: center;">
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
