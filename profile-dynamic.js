
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

        // Fetch all computers
        // We filter client-side to ensure we match the backend owner object or ID
        const response = await apiRequest('/computers');
        const allComputers = response.computers || response;

        // Filter by current user ID using String conversion to be safe
        const myComputers = allComputers.filter(comp => {
            if (!comp.owner) return false;

            // Handle populated owner object or direct ID string
            const ownerId = typeof comp.owner === 'object' ? (comp.owner._id || comp.owner.id) : comp.owner;
            const currentUserId = currentUser._id || currentUser.id;

            // Strict string comparison to avoid ObjectId/String mismatches
            return String(ownerId) === String(currentUserId);
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
            // DIAGNOSTIC INFO FOR USER
            const currentId = currentUser._id || currentUser.id;
            const sampleOwners = allComputers.slice(0, 3).map(c => typeof c.owner === 'object' ? (c.owner._id || c.owner.id) : c.owner).join(', ');

            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 2rem; background: rgba(255,255,255,0.05); border-radius: 12px;">
                    <p style="margin-bottom: 1rem; font-size: 1.1rem;">No se encontraron computadoras asociadas a tu cuenta actual.</p>
                    <div style="font-family: monospace; font-size: 0.8rem; color: #888; text-align: left; display: inline-block; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px;">
                        <strong>Diagnóstico:</strong><br>
                        Tu ID de Usuario: ${currentId}<br>
                        IDs encontrados en sistema: ${sampleOwners || 'Ninguno'}<br>
                        Total computadoras cargadas: ${allComputers.length}
                    </div>
                </div>`;
            return;
        }

        // Add disclaimer if showing fallback computers
        if (showingFallback) {
            const disclaimer = document.createElement('div');
            disclaimer.style.cssText = 'grid-column: 1 / -1; background: rgba(255,165,0,0.1); border: 1px solid rgba(255,165,0,0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; color: #ffa500;';
            disclaimer.innerHTML = '<strong>⚠️ Nota:</strong> Estas computadoras no tienen dueño asignado en la base de datos. Si no son tuyas, contacta al administrador.';
            container.insertBefore(disclaimer, container.firstChild);
        }

        // Add warning if showing fallback
        let warningHtml = '';
        if (showingFallback) {
            warningHtml = `<div style="grid-column: 1 / -1; background: rgba(255,165,0,0.1); border: 1px solid rgba(255,165,0,0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; color: #ffa500;">
                <strong>⚠️ Nota:</strong> Estas computadoras no tienen dueño asignado. Nuevas publicaciones ya no tendrán este problema.
            </div>`;
        }

        container.innerHTML = warningHtml + computersToShow.map(computer => {
            // Robust image handling
            let imageUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23555'%3E%3Cg transform='scale(0.3) translate(28,28)'%3E%3Cpath d='M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z'/%3E%3C/g%3E%3C/svg%3E";

            if (computer.images && computer.images.length > 0) {
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
