
// ========================================
// Marketplace V4 - Matches Featured Computers Design
// ========================================

let allComputers = [];
const FALLBACK_SVG = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 200 200%27 fill=%27none%27%3E%3Crect width=%27200%27 height=%27200%27 fill=%27%23222%27/%3E%3Crect x=%2745%27 y=%2750%27 width=%27110%27 height=%2775%27 rx=%274%27 fill=%27%23444%27 stroke=%27%23666%27 stroke-width=%272%27/%3E%3Crect x=%2752%27 y=%2757%27 width=%2796%27 height=%2761%27 fill=%27%23333%27/%3E%3Crect x=%2785%27 y=%27125%27 width=%2730%27 height=%274%27 fill=%27%23444%27/%3E%3Crect x=%2770%27 y=%27129%27 width=%2760%27 height=%278%27 rx=%272%27 fill=%27%23555%27/%3E%3Ccircle cx=%27100%27 cy=%27133%27 r=%271.5%27 fill=%27%23888%27/%3E%3C/svg%3E";

function getComputerImage(computer) {
    if (!computer.images || !Array.isArray(computer.images) || computer.images.length === 0) {
        return { url: FALLBACK_SVG, isFallback: true };
    }

    const firstImage = computer.images[0];
    if (!firstImage) {
        return { url: FALLBACK_SVG, isFallback: true };
    }
    const rawUrl = firstImage.imageUrl || firstImage.url;

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim().match(/^https?:\/\//)) {
        return { url: FALLBACK_SVG, isFallback: true };
    }

    if (rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')) {
        return { url: FALLBACK_SVG, isFallback: true };
    }

    return { url: rawUrl, isFallback: false };
}

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

    grid.innerHTML = computers.map(computer => {
        // Generate spec badges
        const specBadges = [
            computer.cpu,
            computer.gpu,
            computer.ram ? computer.ram + 'GB RAM' : null,
            computer.storage
        ].filter(Boolean).map(spec =>
            `<span class="spec-badge">${spec}</span>`
        ).join('');

        // Rating
        const rating = computer.rating || 5;
        const reviewCount = computer.reviewCount || 0;
        const stars = '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '★' : '☆').repeat(5 - Math.floor(rating));

        return `
        <div class="computer-card" onclick="window.location.href='computer-detail.html?id=${computer._id || computer.id}'">
            ${renderCardImageCarousel(computer)}
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

function renderCardImageCarousel(computer) {
    const images = computer.images && computer.images.length > 0 ? computer.images : [];

    // CASE 1: No images -> Fallback
    if (images.length === 0) {
        return `
        <div class="image-wrapper" style="position: relative; width: 100%; height: 200px; background-color: #222; background-image: url('${FALLBACK_SVG}'); background-size: cover; background-position: center;">
        </div>`;
    }

    // CASE 2: Single Image
    if (images.length === 1) {
        const { url: imageUrl } = getComputerImage(computer);
        return `
        <div class="image-wrapper" style="position: relative; width: 100%; height: 200px; background-color: #222; background-image: url('${FALLBACK_SVG}'); background-size: cover; background-position: center;">
            <img src="${imageUrl}" alt="${computer.name}" 
                 class="computer-image" 
                 style="width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.3s ease-in-out; background-color: #222;"
                 onload="this.style.opacity = 1"
                 onerror="this.style.opacity = 0; this.style.display = 'none'"
            >
        </div>`;
    }

    // CASE 3: Carousel
    const slides = images.map((img) => {
        const rawUrl = img.imageUrl || img.url;
        if (!rawUrl || rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')) {
            return FALLBACK_SVG;
        }
        return rawUrl;
    });

    const carouselId = `carousel-${computer.id || computer._id || Math.random().toString(36).substr(2, 9)}`;

    // Only the first slide is active initially
    // We add background-color: #222 to each slide item to COVER the underlying SVG when opaque
    return `
    <div class="image-wrapper carousel-container" id="${carouselId}" data-current-index="0" data-total="${slides.length}" 
         style="position: relative; width: 100%; height: 200px; background-color: #222; background-image: url('${FALLBACK_SVG}'); background-size: cover; background-position: center; overflow: hidden; isolate: isolate;">
        
        ${slides.map((url, idx) => `
            <div class="carousel-slide-item ${idx === 0 ? 'active' : ''}" 
                 style="position: absolute; top:0; left:0; width:100%; height:100%; transition: opacity 0.3s ease; opacity: ${idx === 0 ? 1 : 0}; pointer-events: none; background-color: #222;">
                <img src="${url}" 
                     style="width: 100%; height: 100%; object-fit: cover;"
                >
            </div>
        `).join('')}

        <!-- Arrows -->
        <button class="carousel-btn prev" onclick="event.preventDefault(); event.stopPropagation(); moveCarousel('${carouselId}', -1)" 
                style="position: absolute; left: 5px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; z-index: 10;">
            ❯
        </button>
        <button class="carousel-btn next" onclick="event.preventDefault(); event.stopPropagation(); moveCarousel('${carouselId}', 1)" 
                style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; z-index: 10;">
            ❯
        </button>

         <style>
            #${carouselId}:hover .carousel-btn { opacity: 1 !important; }
        </style>
    </div>
    `;
}

window.moveCarousel = function (carouselId, direction) {
    const container = document.getElementById(carouselId);
    if (!container) return;

    const total = parseInt(container.dataset.total);
    let current = parseInt(container.dataset.currentIndex);

    // Toggle off current
    const slides = container.querySelectorAll('.carousel-slide-item');
    if (slides[current]) slides[current].style.opacity = '0';

    // Calculate next
    current = (current + direction + total) % total;
    container.dataset.currentIndex = current;

    // Toggle on next
    if (slides[current]) slides[current].style.opacity = '1';
};
