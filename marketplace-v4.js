// ========================================
// Marketplace V4 - Matches Featured Computers Design
// ========================================

let allComputers = [];

const FALLBACK_SVG = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 200 200%27 fill=%27none%27%3E%3Crect width=%27200%27 height=%27200%27 fill=%27%23222%27/%3E%3Crect x=%2745%27 y=%2750%27 width=%27110%27 height=%2775%27 rx=%274%27 fill=%27%23444%27 stroke=%27%23666%27 stroke-width=%272%27/%3E%3Crect x=%2752%27 y=%2757%27 width=%2796%27 height=%2761%27 fill=%27%23333%27/%3E%3Crect x=%2785%27 y=%27125%27 width=%2730%27 height=%274%27 fill=%27%23444%27/%3E%3Crect x=%2770%27 y=%27129%27 width=%2760%27 height=%278%27 rx=%272%27 fill=%27%23555%27/%3E%3Ccircle cx=%27100%27 cy=%27133%27 r=%271.5%27 fill=%27%23888%27/%3E%3C/svg%3E";

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

// Global map to store images for carousel functionality
window.marketplaceImages = {};

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
        // Image handling logic
        let images = [FALLBACK_SVG];

        if (computer.images && computer.images.length > 0) {
            // Filter out bad localhosts
            const valid = computer.images.map(img => img.imageUrl || img.url).filter(url => url && !url.includes('localhost') && !url.includes('127.0.0.1'));
            if (valid.length > 0) {
                images = valid;
            }
        }

        // Store for carousel
        window.marketplaceImages[computer.id] = images;
        const currentImage = images[0];
        const hasMultiple = images.length > 1;

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
        <div class="computer-card" onclick="window.location.href='computer-detail.html?id=${computer._id || computer.id}'" style="cursor: pointer;">
            <div style="position: relative; height: 200px; overflow: hidden;" class="card-image-container">
                <img src="${currentImage}" 
                     alt="${computer.name}" 
                     class="computer-image"
                     id="img-${computer.id}" data-index="0"
                     style="width: 100%; height: 100%; object-fit: cover; background-color: #222; transition: transform 0.3s;"
                     onerror="this.onerror=null; this.src='${FALLBACK_SVG}';"
                >
                
                ${hasMultiple ? `
                    <button onclick="event.stopPropagation(); event.preventDefault(); nextCardImage('${computer.id}', -1)" style="position: absolute; top: 50%; left: 10px; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; opacity: 0.8; z-index: 10;">‹</button>
                    <button onclick="event.stopPropagation(); event.preventDefault(); nextCardImage('${computer.id}', 1)" style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; opacity: 0.8; z-index: 10;">›</button>
                    <div style="position: absolute; bottom: 10px; left: 0; right: 0; display: flex; justify-content: center; gap: 4px; pointer-events: none;">
                        ${images.map((_, idx) => `<div id="dot-${computer.id}-${idx}" style="width: 6px; height: 6px; border-radius: 50%; background: ${idx === 0 ? 'white' : 'rgba(255,255,255,0.4)'}; box-shadow: 0 1px 2px rgba(0,0,0,0.5);"></div>`).join('')}
                    </div>
                ` : ''}
            </div>

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

// Global function to handle carousel navigation
window.nextCardImage = function (computerId, direction) {
    const imgEl = document.getElementById(`img-${computerId}`);
    if (!imgEl) return;

    const images = window.marketplaceImages[computerId];
    if (!images || images.length <= 1) return;

    let currentIndex = parseInt(imgEl.dataset.index || '0');
    let newIndex = currentIndex + direction;

    if (newIndex >= images.length) newIndex = 0;
    if (newIndex < 0) newIndex = images.length - 1;

    // Update Image
    imgEl.src = images[newIndex];
    imgEl.dataset.index = newIndex;

    // Update Dots
    images.forEach((_, idx) => {
        const dot = document.getElementById(`dot-${computerId}-${idx}`);
        if (dot) {
            dot.style.background = (idx === newIndex) ? 'white' : 'rgba(255,255,255,0.4)';
        }
    });
};
