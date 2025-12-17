
// Profile Dynamic Logic
// Replicates marketplace card design for "My Computers"

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

    // BLOCK LOCALHOST URLs (Cause of 5s timeout delay)
    if (rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')) {
        return { url: FALLBACK_SVG, isFallback: true };
    }

    return { url: rawUrl, isFallback: false };
}

document.addEventListener('DOMContentLoaded', () => {
    loadMyComputers();
});

async function loadMyComputers() {
    const container = document.querySelector('#computersTab .grid');
    if (!container) return;

    try {
        if (!currentUser) return;

        // Fetch user's own computers (including pending)
        const authToken = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/computers/my`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load computers');
        }

        const data = await response.json();
        const myComputers = data.computers || data;

        console.log('Loaded my computers:', myComputers.length);

        // Check if user has any computers
        if (!myComputers || myComputers.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <div style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.5;">💻</div>
                    <h3 style="color: var(--text-secondary); margin-bottom: 0.5rem;">Aún no has publicado ninguna computadora</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 2rem;">Comparte tu PC y comienza a ganar dinero</p>
                    <a href="publish.html" class="btn btn-primary">+ Publicar Mi Primera PC</a>
                </div>
            `;
            return;
        }

        container.innerHTML = myComputers.map(computer => {
            const { url: imageUrl, isFallback } = getComputerImage(computer);

            const statusColors = {
                'active': 'var(--success-green)',
                'inactive': 'var(--error-red)',
                'maintenance': 'var(--warning-yellow)'
            };
            // Map backend status to UI text if needed, or use raw
            // Assuming backend uses 'active' but UI shows 'Disponible'? 
            // Let's use raw status or a mapper
            const statusMap = {
                'active': 'Disponible',
                'inactive': 'Ocupado',
                'maintenance': 'Mantenimiento'
            };

            const displayStatus = statusMap[computer.status] || computer.status || 'Desconocido';
            const statusColor = statusColors[computer.status] || 'var(--text-secondary)';

            return `
            <div class="computer-card glass-card" style="display: flex; flex-direction: column; overflow: hidden; padding: 0 !important;">
                <div style="position: relative; width: 100%; height: 220px; background-color: #222; background-image: url('${FALLBACK_SVG}'); background-size: cover; background-position: center;">
                    <img src="${imageUrl}" alt="${computer.name}" class="computer-image" 
                        style="width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity 0.3s ease-in-out;"
                        onload="this.style.opacity = 1"
                        onerror="this.style.opacity = 0; this.style.display = 'none'">
                        
                     ${computer.isApproved === false ? `
                     <div style="position: absolute; top: 12px; left: 12px; background: rgba(255, 193, 7, 0.95); padding: 6px 12px; border-radius: 6px; backdrop-filter: blur(4px); z-index: 10;">
                        <span style="font-size: 0.85rem; font-weight: 600; color: #000;">⏳ Pendiente de Aprobación</span>
                     </div>` : ''}
                     <div style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 4px; backdrop-filter: blur(4px); z-index: 10;">
                        <span style="width: 8px; height: 8px; background-color: ${statusColor}; border-radius: 50%; display: inline-block; margin-right: 6px;"></span>
                        <span style="font-size: 0.8rem; font-weight: 500; color: white;">${displayStatus}</span>
                    </div>
                </div>
                
                <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.3rem; font-weight: 700; color: white;">${computer.name}</h3>
                    
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${computer.description || 'Sin descripción disponible.'}
                    </p>

                    <div style="height: 1px; background: var(--glass-border); margin-bottom: 1rem; width: 100%;"></div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.5rem;">
                        <div>
                             <span style="font-size: 0.75rem; color: var(--accent-purple); display: block; margin-bottom: 2px;">Procesador</span>
                             <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${computer.cpu || 'N/A'}</span>
                        </div>
                        <div>
                             <span style="font-size: 0.75rem; color: var(--accent-purple); display: block; margin-bottom: 2px;">Gráfica</span>
                             <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${computer.gpu || 'N/A'}</span>
                        </div>
                         <div>
                             <span style="font-size: 0.75rem; color: var(--accent-purple); display: block; margin-bottom: 2px;">RAM</span>
                             <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">${computer.ram ? computer.ram + 'GB' : 'N/A'}</span>
                        </div>
                        <div>
                             <span style="font-size: 0.75rem; color: var(--accent-purple); display: block; margin-bottom: 2px;">Software</span>
                             <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; display: block;" title="${computer.softwareInstalled}">${computer.softwareInstalled || 'N/A'}</span>
                        </div>
                    </div>

                    <div style="margin-top: auto; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
                        <div class="computer-price">
                            <span class="price" style="font-size: 1.5rem; font-weight: 700; color: white;">$${computer.pricePerHour}</span>
                            <span class="price-unit" style="font-size: 0.9rem; color: var(--text-muted);">/hora</span>
                        </div>
                        <button onclick="manageComputer('${computer.id || computer._id}')" class="btn btn-secondary" style="padding: 0.5rem 1.25rem; font-size: 0.9rem; border-radius: 8px;">
                            Gestionar
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error('PROVILE LOAD ERROR:', error);
    } catch (error) {
        console.error('PROVILE LOAD ERROR:', error);
        // Fallback: show the raw error to the user for debugging
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--error-red);">
            <h3>Error al cargar computadoras</h3>
            <p>${error.message}</p>
            <small style="color: grey;">Si ves esto, envíalo al soporte.</small>
        </div>`;
    }
}

function manageComputer(id) {
    // For now, redirect to a manage page or show alert
    // window.location.href = `manage-computer.html?id=${id}`;
    alert('Funcionalidad de gestión en desarrollo');
}
