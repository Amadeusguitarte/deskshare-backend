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
        // Image handling with SVG fallback
        let imageUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' fill='none'%3E%3Crect width='200' height='200' fill='%23222'/%3E%3Cpath d='M60 70h80v40H60z' fill='%23444'/%3E%3Crect x='70' y='80' width='60' height='25' fill='%23666'/%3E%3Ccircle cx='100' cy='135' r='3' fill='%23888'/%3E%3Crect x='50' y='110' width='100' height='3' fill='%23444'/%3E%3Crect x='85' y='113' width='30' height='20' fill='%23333'/%3E%3C/svg%3E";

        if (computer.images && Array.isArray(computer.images) && computer.images.length > 0) {
            const firstImage = computer.images[0];
            if (firstImage && (firstImage.imageUrl || firstImage.url)) {
                imageUrl = firstImage.imageUrl || firstImage.url;
            }
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
