
// Profile Dynamic Logic
// Replicates marketplace card design for "My Computers"

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
    });

    // FALLBACK: Show computers without owner if no matches found
    let computersToShow = myComputers;
    let showingFallback = false;

    if (myComputers.length === 0 && allComputers.length > 0) {
        const computersWithoutOwner = allComputers.filter(c => !c.owner || c.owner === '');
        if (computersWithoutOwner.length > 0) {
            computersToShow = computersWithoutOwner;
            showingFallback = true;
        }
    }

    if (computersToShow.length === 0) {
        // Show computers in grid
        if (myComputers.length === 0) {
            container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary);">No se encontraron computadoras asociadas a tu cuenta actual.</p>';
            return;
        }

        container.innerHTML = myComputers.map(computer => {
            // Robust image handling with SVG fallback
            let imageUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' fill='none'%3E%3Crect width='200' height='200' fill='%23222'/%3E%3Cpath d='M60 70h80v40H60z' fill='%23444'/%3E%3Crect x='70' y='80' width='60' height='25' fill='%23666'/%3E%3Ccircle cx='100' cy='135' r='3' fill='%23888'/%3E%3Crect x='50' y='110' width='100' height='3' fill='%23444'/%3E%3Crect x='85' y='113' width='30' height='20' fill='%23333'/%3E%3C/svg%3E";

            // Try to get image from computer data
            if (computer.images && Array.isArray(computer.images) && computer.images.length > 0) {
                const firstImage = computer.images[0];
                if (firstImage && (firstImage.imageUrl || firstImage.url)) {
                    imageUrl = firstImage.imageUrl || firstImage.url;
                }
            }
            // Check all possible image url properties
            imageUrl = computer.images[0].imageUrl || computer.images[0].url || imageUrl;
        }

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
                <div style="position: relative;">
                    <img src="${imageUrl}" alt="${computer.name}" class="computer-image" 
                        style="width: 100%; height: 220px; object-fit: cover; display: block; background: var(--bg-secondary);">
                     ${computer.isApproved === false ? `
                     <div style="position: absolute; top: 12px; left: 12px; background: rgba(255, 193, 7, 0.95); padding: 6px 12px; border-radius: 6px; backdrop-filter: blur(4px);">
                        <span style="font-size: 0.85rem; font-weight: 600; color: #000;">⏳ Pendiente de Aprobación</span>
                     </div>` : ''}
                     <div style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 4px; backdrop-filter: blur(4px);">
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
    console.error('Error loading my computers:', error);
    container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--error-red);">Error al cargar computadoras.</p>';
}
}

function manageComputer(id) {
    // For now, redirect to a manage page or show alert
    // window.location.href = `manage-computer.html?id=${id}`;
    alert('Funcionalidad de gestión en desarrollo');
}
