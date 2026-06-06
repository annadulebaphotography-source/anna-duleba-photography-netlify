(function () {
    const pagesByFile = {
        'newborn.html': 'newborn',
        'babybauch.html': 'babybauch',
        'familie.html': 'familie',
        'kinderfotografie.html': 'kinderfotografie',
        'frauenfotografie.html': 'frauenfotografie',
    };

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        }[char]));
    }

    function render(root, items) {
        if (!Array.isArray(items) || !items.length) return;
        root.innerHTML = items
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((item) => `
                <div class="faq-item">
                    <h3>${escapeHtml(item.question)}</h3>
                    <p>${escapeHtml(item.answer)}</p>
                </div>
            `)
            .join('');
    }

    function createRoot(page) {
        const main = document.querySelector('main');
        if (!main) return null;
        const section = document.createElement('section');
        section.className = 'content-section adp-faq-cms-section';
        section.innerHTML = `
            <div class="content-wrapper">
                <div class="content-frame">
                    <div class="content-card">
                        <h2 class="section-heading">Häufige Fragen</h2>
                        <div class="faq-list" data-faq-root="${escapeHtml(page)}"></div>
                    </div>
                </div>
            </div>`;
        const gallery = document.getElementById('galerie');
        main.insertBefore(section, gallery || null);
        return section.querySelector('[data-faq-root]');
    }

    async function loadAndRender(root, page) {
        if (!page) return;
        try {
            const response = await fetch(`/api/faqs/${encodeURIComponent(page)}`, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) return;
            const items = await response.json();
            if (!items.length) return;
            const target = root || createRoot(page);
            if (target) render(target, items);
        } catch {
            // Keep static fallback FAQ when API is unavailable.
        }
    }

    const roots = Array.from(document.querySelectorAll('[data-faq-root]'));
    if (roots.length) {
        roots.forEach((root) => loadAndRender(root, root.dataset.faqRoot));
        return;
    }

    const file = window.location.pathname.split('/').pop() || '';
    loadAndRender(null, pagesByFile[file]);
}());
