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

    grid.innerHTML = computers.map(computer => {
        const imageUrl = computer.images && computer.images[0] ? computer.images[0].url : 'assets/workstation_professional_1765782988095.png';

        return `
        // Determine status based on multiple fields
        const isAvailable = computer.status === 'active';
        
        // Handle image URL
        let imageUrl = 'https://via.placeholder.com/400x300?text=No+Image';
        if (computer.images && computer.images.length > 0) {
            imageUrl = computer.images[0].imageUrl || computer.images[0].url || imageUrl;
        }

        return `
            < div class="computer-card glass-card" >
                <img src="${imageUrl}" alt="${computer.name}" class="computer-image" onerror="this.src='assets/workstation_professional_1765782988095.png'">
                    <span class="computer-badge">${computer.category || 'General'}</span>
                    <h3>${computer.name}</h3>
                    <p class="computer-description">${computer.description || 'Computadora de alto rendimiento'}</p>

                    <div class="computer-specs">
                        <span class="spec-badge">${computer.cpu || 'CPU'}</span>
                        <span class="spec-badge">${computer.gpu || 'GPU'}</span>
                        <span class="spec-badge">${computer.ram || '16'}GB RAM</span>
                    </div>

                    <div class="computer-footer">
                        <div class="computer-price">
                            <span class="price">$${computer.pricePerHour}</span>
                            <span class="price-unit">/hora</span>
                        </div>
                        <span class="availability ${isAvailable ? 'available' : 'busy'}">
                            ${isAvailable ? '● Disponible' : '● Ocupado'}
                        </span>
                    </div>

                    <a href="computer-detail.html?id=${computer.id}" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">
                        Ver Detalles
                    </a>
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
