// ========================================
// Marketplace V4 - Matches Featured Computers Design
// ========================================

let allComputers = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadMarketplaceComputers();
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

    const countElement = document.getElementById('computerCount');
    if (countElement) {
        countElement.textContent = computers.length;
    }

    if (!computers || computers.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1 / -1; padding: 3rem;">No se encontraron computadoras con estos filtros.</p>';
        return;
    }

    // MATCHING THE DESIGN FROM index.html "Computadoras Destacadas"
    grid.innerHTML = computers.map(computer => {
        // Image handling
        let imageUrl = 'assets/workstation_professional_1765782988095.png';
        if (computer.images && computer.images.length > 0) {
            imageUrl = computer.images[0].imageUrl || computer.images[0].url || imageUrl;
        }

        // Generate spec badges (LIKE THE FEATURED CARDS)
        const specBadges = [
            computer.cpu,
            computer.gpu,
            computer.ram ? computer.ram + 'GB RAM' : null,
            computer.storage
        ].filter(Boolean).map(spec =>
            `<span class="spec-badge">${spec}</span>`
        ).join('');

        // Rating (use existing or default to 5 stars with 0 reviews)
        const rating = computer.rating || 5;
        const reviewCount = computer.reviewCount || 0;
        const stars = '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '★' : '☆').repeat(5 - Math.floor(rating));

        return `
        <div class="computer-card" onclick="window.location.href='computer-detail.html?id=${computer._id || computer.id}'">
            <img src="${imageUrl}" alt="${computer.name}" class="computer-image">
            <div class="computer-info">
                <h3 class="computer-title">${computer.name}</h3>
                <div class="computer-specs">
                    ${specBadges}
                </div>
                <p style="color: var(--text-secondary); font-size: 0.95rem; margin: 0.5rem 0;">
                    ${computer.description || 'Equipo de alto rendimiento disponible'}
                </p>
                <div class="computer-price">
                    <div>
                        <span class="price">$${computer.pricePerHour}</span>
                        <span class="price-unit">/hora</span>
                    </div>
                    <div class="rating">
                        ${stars} <span style="margin-left: 0.3rem;">(${reviewCount})</span>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');
}
