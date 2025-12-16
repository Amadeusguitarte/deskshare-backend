// ========================================  
// Global UI Functions
// Handles button events for publish page
// ========================================

// Redirect to publish page
function openAddComputerModal() {
    console.log('Redirecting to publish page...');

    // Check if user is logged in
    const token = localStorage.getItem('authToken');

    if (!token) {
        window.location.href = 'register.html?redirect=publish';
        return;
    }

    // Redirect to dedicated publish page
    window.location.href = 'publish.html';
}

// Setup "Publicar PC" buttons
function setupPublishButtons() {
    console.log('Setting up Publicar PC buttons...');

    // Find all "Publicar PC" buttons/links
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
}

// Execute setup immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPublishButtons);
} else {
    setupPublishButtons();
}

// Make functions globally available
window.openAddComputerModal = openAddComputerModal;
