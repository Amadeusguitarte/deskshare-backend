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
    console.log('openAddComputerModal called!');

    // Check if user is logged in
    const token = localStorage.getItem('authToken');
    console.log('Auth token:', token ? 'EXISTS' : 'MISSING');

    if (!token) {
        // Redirect to register with return URL
        console.log('No token, redirecting to register...');
        window.location.href = 'register.html?redirect=publish';
        return;
    }

    console.log('Checking if modal exists...');
    const existingModal = document.getElementById('addComputerModal');
    console.log('Existing modal:', existingModal);

    // Load modal if not loaded
    if (!existingModal) {
        console.log('Modal not found, loading...');
        loadAddComputerModal();
        // Wait a bit for modal to load
        setTimeout(() => {
            const modal = document.getElementById('addComputerModal');
            console.log('After timeout, modal is:', modal);
            if (modal) {
                console.log('Adding .show class to modal');
                modal.classList.add('show');
            } else {
                console.error('Modal still not found after loading!');
            }
        }, 500);
    } else {
        console.log('Modal found, adding .show class');
        existingModal.classList.add('show');
        console.log('Modal classes:', existingModal.className);
    }
}

// Setup \"Publicar PC\" buttons
function setupPublishButtons() {
    console.log('Setting up Publicar PC buttons...');

    // Find all \"Publicar PC\" buttons/links
    const links = document.querySelectorAll('a[href="#"]');
    console.log(`Found ${links.length} links with href="#"`);

    links.forEach(link => {
        if (link.textContent.includes('Publicar PC')) {
            console.log('Found Publicar PC button:', link);
            link.onclick = (e) => {
                e.preventDefault();
                console.log('Publicar PC clicked!');
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

    // Check if should auto-open publish modal  
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openPublish') === 'true') {
        // Wait a bit for everything to load
        setTimeout(() => {
            openAddComputerModal();
        }, 500);
    }
}

// Execute setup immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPublishButtons);
} else {
    setupPublishButtons();
}

// Make functions globally available
window.openAddComputerModal = openAddComputerModal;
window.loadAddComputerModal = loadAddComputerModal;
