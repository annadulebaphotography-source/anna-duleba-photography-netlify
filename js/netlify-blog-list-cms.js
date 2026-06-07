(function () {
    if (!/\/pages\/blog(?:\.html)?$/i.test(location.pathname.replace(/\/+$/, '')) && !/\/blog\/?$/i.test(location.pathname)) return;

    let toolbar = null;
    let createPanel = null;

    function slugify(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    function delay(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    async function waitForPublishedPost(slug, statusElement) {
        const checkPath = `/pages/blog-${slug}.html`;
        const editUrl = `${checkPath}?edit=1&v=${Date.now()}`;
        for (let attempt = 1; attempt <= 24; attempt += 1) {
            statusElement.textContent = `Artykul zapisany. Czekam na deploy Netlify (${attempt}/24)...`;
            await delay(8000);
            try {
                const response = await fetch(`${checkPath}?v=${Date.now()}`, { cache: 'no-store' });
                const text = await response.text();
                if (response.ok && !/Seite nicht gefunden|Page not found|Not Found/i.test(text)) {
                    statusElement.innerHTML = `Artykul jest gotowy: <a href="${escapeHtml(editUrl)}">${escapeHtml(editUrl)}</a>`;
                    return editUrl;
                }
            } catch (error) {
                // Netlify can briefly answer with cache/network errors during deploy.
            }
        }
        statusElement.innerHTML = `Artykul zapisany, ale Netlify jeszcze publikuje. Sprobuj za chwile: <a href="${escapeHtml(editUrl)}">${escapeHtml(editUrl)}</a>`;
        return editUrl;
    }

    async function submitNewPost(fields, statusElement) {
        const title = fields.title.trim();
        if (!title) {
            statusElement.textContent = 'Tytul jest wymagany.';
            return;
        }
        const submitButton = statusElement.closest('.adp-blog-create-dialog')?.querySelector('[data-create-submit]');
        if (submitButton) submitButton.disabled = true;
        setStatus('Tworze nowy artykul...');
        statusElement.textContent = 'Tworze nowy artykul...';
        const response = await fetch('/__cms/blog-posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                slug: slugify(title),
                category: fields.category.trim() || 'blog',
                metaDescription: fields.metaDescription.trim(),
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.post) {
            statusElement.textContent = data.error || 'Nie udalo sie utworzyc bloga.';
            setStatus('Blog CMS');
            if (submitButton) submitButton.disabled = false;
            return;
        }
        setStatus('Artykul utworzony. Poczekaj na deploy Netlify.');
        await waitForPublishedPost(data.post.slug, statusElement);
    }

    function ensureCreatePanel() {
        if (createPanel) return createPanel;
        createPanel = document.createElement('div');
        createPanel.className = 'adp-local-image-panel';
        createPanel.innerHTML = `
            <div class="adp-local-image-panel__dialog adp-blog-create-dialog">
                <button type="button" class="adp-local-image-panel__close" data-create-close>&times;</button>
                <strong>Nowy artykul bloga</strong>
                <label>Tytul<input data-create-title></label>
                <label>Kategoria<input data-create-category></label>
                <label>Opis SEO / podtytul<textarea rows="5" data-create-description></textarea></label>
                <p class="adp-local-image-panel__status" data-create-status></p>
                <div class="adp-local-image-panel__actions">
                    <button type="button" data-create-submit>Utworz artykul</button>
                </div>
            </div>`;
        document.body.appendChild(createPanel);
        createPanel.addEventListener('click', (event) => {
            if (event.target === createPanel || event.target.closest('[data-create-close]')) createPanel.classList.remove('is-open');
        });
        createPanel.querySelector('[data-create-submit]').addEventListener('click', () => {
            submitNewPost({
                title: createPanel.querySelector('[data-create-title]').value,
                category: createPanel.querySelector('[data-create-category]').value,
                metaDescription: createPanel.querySelector('[data-create-description]').value,
            }, createPanel.querySelector('[data-create-status]'));
        });
        return createPanel;
    }

    function createPost() {
        const panel = ensureCreatePanel();
        panel.querySelector('[data-create-title]').value = '';
        panel.querySelector('[data-create-category]').value = 'newborn';
        panel.querySelector('[data-create-description]').value = '';
        panel.querySelector('[data-create-status]').textContent = '';
        panel.classList.add('is-open');
        window.setTimeout(() => panel.querySelector('[data-create-title]').focus(), 30);
    }

    function setStatus(message) {
        const status = toolbar?.querySelector('[data-blog-list-status]');
        if (status) status.textContent = message;
    }

    function ensureToolbar() {
        if (toolbar) return toolbar;
        document.querySelector('.adp-local-cms-launcher')?.remove();
        toolbar = document.createElement('div');
        toolbar.className = 'adp-local-cms-toolbar adp-blog-list-cms-toolbar';
        toolbar.innerHTML = `
            <span data-blog-list-status>Blog CMS</span>
            <button type="button" data-create-blog>+ Dodaj artykul</button>
            <button type="button" data-close-blog-cms>Zamknij</button>`;
        document.body.appendChild(toolbar);
        toolbar.querySelector('[data-create-blog]').addEventListener('click', createPost);
        toolbar.querySelector('[data-close-blog-cms]').addEventListener('click', () => {
            toolbar.remove();
            toolbar = null;
            window.localStorage.removeItem('adpBlogListCmsVisible');
            ensureLauncher();
        });
        return toolbar;
    }

    function ensureLauncher() {
        if (toolbar || document.querySelector('.adp-local-cms-launcher')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'adp-local-cms-launcher';
        button.textContent = 'CMS';
        button.addEventListener('click', () => {
            window.localStorage.setItem('adpBlogListCmsVisible', '1');
            ensureToolbar();
        });
        document.body.appendChild(button);
    }

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'e') ensureToolbar();
    });

    if (new URLSearchParams(window.location.search).has('edit') || window.localStorage.getItem('adpBlogListCmsVisible') === '1') {
        ensureToolbar();
    } else {
        ensureLauncher();
    }
}());
