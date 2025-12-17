// ========================================
// Admin Panel Script
// Manages computer approval and deletion
// ========================================

const API_BASE_URL = 'https://deskshare-backend-production.up.railway.app/api';

const FALLBACK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' fill='none'%3E%3Crect width='200' height='200' fill='%23222'/%3E%3Crect x='45' y='50' width='110' height='75' rx='4' fill='%23444' stroke='%23666' stroke-width='2'/%3E%3Crect x='52' y='57' width='96' height='61' fill='%23333'/%3E%3Crect x='85' y='125' width='30' height='4' fill='%23444'/%3E%3Crect x='70' y='129' width='60' height='8' rx='2' fill='%23555'/%3E%3Ccircle cx='100' cy='133' r='1.5' fill='%23888'/%3E%3C/svg%3E";

function getComputerImage(computer) {
    if (!computer.images || !Array.isArray(computer.images) || computer.images.length === 0) {
        return { url: FALLBACK_SVG, isFallback: true };
    }

    const firstImage = computer.images[0];
    const rawUrl = firstImage.imageUrl || firstImage.url;

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim().match(/^https?:\/\//)) {
        return { url: FALLBACK_SVG, isFallback: true };
    }

    return { url: rawUrl, isFallback: false };
}

// Check admin auth on load
window.addEventListener('DOMContentLoaded', () => {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = 'admin-login.html';
        return;
    }

    loadAllComputers();
});

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = 'admin-login.html';
});

// Load all computers (pending + approved)
async function loadAllComputers() {
    try {
        const adminToken = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE_URL}/admin/computers`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch computers');
        }

        const data = await response.json();
        displayComputers(data.computers);
    } catch (error) {
        console.error('Error loading computers:', error);
        if (error.message.includes('401') || error.message.includes('403')) {
            // Token expired or invalid
            localStorage.removeItem('adminToken');
            window.location.href = 'admin-login.html';
        }
    }
}

// Display computers
function displayComputers(computers) {
    const pending = computers.filter(c => !c.isApproved);
    const approved = computers.filter(c => c.isApproved);

    document.getElementById('pendingCount').textContent = pending.length;
    document.getElementById('approvedCount').textContent = approved.length;
    document.getElementById('totalCount').textContent = computers.length;

    renderComputerList('pendingList', pending, true);
    renderComputerList('approvedList', approved, false);
}

// Render computer list
function renderComputerList(containerId, computers, isPending) {
    const container = document.getElementById(containerId);

    if (computers.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <p>No hay computadoras ${isPending ? 'pendientes' : 'aprobadas'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = computers.map(computer => {
        const { url: imageUrl, isFallback } = getComputerImage(computer);
        return `
        <div class="computer-card" data-id="${computer.id}">
            <div class="card-image">
                <img src="${imageUrl}" alt="${computer.name}"${!isFallback ? ` onerror="this.src='${FALLBACK_SVG}'"` : ''}>
                ${isPending ? '<span class="status-badge pending">Pendiente</span>' : '<span class="status-badge approved">Aprobado</span>'}
            </div>
            <div class="card-content">
                <h3>${computer.name}</h3>
                <div class="computer-specs">
                    <span title="CPU"><i>💻</i> ${computer.cpu || 'N/A'}</span>
                    <span title="GPU"><i>🎮</i> ${computer.gpu || 'N/A'}</span>
                    <span title="RAM"><i>🧠</i> ${computer.ram}GB</span>
                </div>
                <div class="computer-owner">
                    <img src="${computer.user.avatarUrl || 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27%23555%27%3E%3Cpath d=%27M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z%27/%3E%3C/svg%3E'}" alt="${computer.user.name}">
                    <span>${computer.user.name || computer.user.email}</span>
                </div>
                <div class="card-actions">
                    ${isPending ? `
                        <button class="btn-approve" onclick="approveComputer(${computer.id})">
                            ✅ Aprobar
                        </button>
                    ` : ''}
                    <button class="btn-delete" onclick="deleteComputer(${computer.id})">
                        🗑️ Eliminar
                    </button>
                </div>
            </div>
        </div>
        </div>
        `;
    }).join('');
}

// Approve computer
async function approveComputer(id) {
    if (!confirm('¿Aprobar esta computadora?')) return;

    try {
        const adminToken = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE_URL}/admin/computers/${id}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to approve');
        }

        // Reload list
        loadAllComputers();
        alert('Computadora aprobada exitosamente');
    } catch (error) {
        console.error('Error approving computer:', error);
        alert('Error al aprobar la computadora');
    }
}

// Delete computer
async function deleteComputer(id) {
    if (!confirm('¿Eliminar esta computadora permanentemente?')) return;

    try {
        const adminToken = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE_URL}/admin/computers/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete');
        }

        // Reload list
        loadAllComputers();
        alert('Computadora eliminada exitosamente');
    } catch (error) {
        console.error('Error deleting computer:', error);
        alert('Error al eliminar la computadora');
    }
}

// Tab switching
function switchTab(tab) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    // Add active to clicked tab
    event.target.classList.add('active');

    // Hide all sections
    document.querySelectorAll('.computers-section').forEach(s => s.style.display = 'none');
    // Show selected section
    document.getElementById(`${tab}Section`).style.display = 'block';
}
