
// Profile Dynamic Logic
// Replicates marketplace card design for "My Computers"

document.addEventListener('DOMContentLoaded', () => {
    loadMyComputers();
});

async function loadMyComputers() {
    const container = document.querySelector('#computersTab .grid');
    if (!container) return;

    try {
        // Mock data for now (since backend might not have user's computers yet)
        // In production: const computers = await apiRequest('/users/me/computers');
        // Using mock based on user screenshot context or similar structure
        const computers = [
            {
                id: '1',
                name: 'sdfa',
                description: 'fdsf',
                cpu: '45',
                gpu: '564654',
                ram: '4545',
                status: 'Disponible',
                pricePerHour: 3,
                images: [{ imageUrl: 'assets/hero_background_1765783023163.png' }], // Use placeholder if needed
                softwareInstalled: 'N/A'
            },
            // Add more mocks if needed to fill grid
        ];

        if (computers.length === 0) {
            container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary);">No tienes computadoras publicadas aún.</p>';
            return;
        }

        container.innerHTML = computers.map(computer => {
            const imageUrl = computer.images && computer.images.length > 0
                ? computer.images[0].imageUrl
                : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23555'%3E%3Cg transform='scale(0.3) translate(28,28)'%3E%3Cpath d='M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z'/%3E%3C/g%3E%3C/svg%3E";

            const statusColors = {
                'Disponible': 'var(--success-green)',
                'Ocupado': 'var(--error-red)',
                'Mantenimiento': 'var(--warning-yellow)'
            };
            const statusColor = statusColors[computer.status] || 'var(--text-secondary)';

            return `
            <div class="computer-card glass-card" style="display: flex; flex-direction: column; overflow: hidden; padding: 0 !important;">
                <div style="position: relative;">
                    <img src="${imageUrl}" alt="${computer.name}" class="computer-image" 
                        style="width: 100%; height: 220px; object-fit: cover; display: block; background: var(--bg-secondary);">
                     <div style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 4px; backdrop-filter: blur(4px);">
                        <span style="width: 8px; height: 8px; background-color: ${statusColor}; border-radius: 50%; display: inline-block; margin-right: 6px;"></span>
                        <span style="font-size: 0.8rem; font-weight: 500; color: white;">${computer.status || 'Desconocido'}</span>
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
                            <span class="price-unit" style="font-size: 0.9rem; color: var(--text-muted);"/&gt;/hora</span>
                        </div>
                        <button onclick="manageComputer('${computer.id}')" class="btn btn-secondary" style="padding: 0.5rem 1.25rem; font-size: 0.9rem; border-radius: 8px;">
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
    alert(`Gestionar computadora ${id} (Funcionalidad pendiente)`);
    // window.location.href = `manage-computer.html?id=${id}`;
}
