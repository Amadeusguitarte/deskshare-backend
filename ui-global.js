// ========================================  
// Global UI Functions
// Handles modal loading and button events
// ========================================

// Load add computer modal dynamically
function loadAddComputerModal() {
    if (document.getElementById('addComputerModal')) {
        return; // Already loaded
    }

    fetch('add-computer-modal.html')
        .then(r => r.text())
        .then(html => {
            // Create container for modal
            const container = document.createElement('div');
            container.innerHTML = html;
            document.body.appendChild(container.firstElementChild);
        })
        .catch(err => {
            console.error('Error loading modal:', err);
        });
}

// Open add computer modal
function openAddComputerModal() {
    if (!checkAuth || !checkAuth()) {
        alert('Debes iniciar sesión para publicar una computadora');
        window.location.href = 'login.html';
        return;
    }

    // Load modal if not loaded
    if (!document.getElementById('addComputerModal')) {
        loadAddComputerModal();
        // Wait a bit for modal to load
        setTimeout(() => {
            document.getElementById('addComputerModal')?.classList.add('show');
        }, 500);
    } else {
        document.getElementById('addComputerModal').classList.add('show');
    }
}

// Setup "Publicar PC" buttons
document.addEventListener('DOMContentLoaded', () => {
    // Find all "Publicar PC" buttons/links
    document.querySelectorAll('a[href="#"]').forEach(link => {
        if (link.textContent.includes('Publicar PC')) {
            link.onclick = (e) => {
                e.preventDefault();
                openAddComputerModal();
            };
        }
    });

    // Also setup by class if exists
    document.querySelectorAll('.btn-publish-pc').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            openAddComputerModal();
        };
    });
});

// Make functions globally available
window.openAddComputerModal = openAddComputerModal;
window.loadAddComputerModal = loadAddComputerModal;
