(function () {
    const articleMatch = location.pathname.match(/\/pages\/blog-([^/]+)\.html$/i)
        || location.pathname.match(/\/blog\/([^/]+)\/?$/i);
    if (!articleMatch) return;

    const slug = articleMatch[1];
    let posts = [];
    let post = null;
    let editing = false;
    let toolbar = null;
    let imagePanel = null;

    function uid() {
        return (crypto.randomUUID && crypto.randomUUID()) || `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function publicUrl(value) {
        const path = String(value || '').trim();
        if (!path) return '';
        if (/^(https?:|data:|\/)/i.test(path)) return path;
        const prefix = location.pathname.includes('/pages/') ? '../' : '/';
        return `${prefix}${path.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '')}`;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    function setStatus(message) {
        const status = toolbar?.querySelector('[data-blog-cms-status]');
        if (status) status.textContent = message;
    }

    function blockHtml(block) {
        const id = block.id || uid();
        if (!block.id) block.id = id;
        if (block.type === 'h2') {
            return `<h2 data-blog-block="${id}" data-blog-type="h2" data-blog-field="text">${escapeHtml(block.text)}</h2>`;
        }
        if (block.type === 'h3') {
            return `<h3 data-blog-block="${id}" data-blog-type="h3" data-blog-field="text">${escapeHtml(block.text)}</h3>`;
        }
        if (block.type === 'paragraph') {
            return `<p data-blog-block="${id}" data-blog-type="paragraph" data-blog-field="text">${escapeHtml(block.text)}</p>`;
        }
        if (block.type === 'list') {
            const items = (block.items || []).map((item) => `<li data-blog-list-item>${escapeHtml(item)}</li>`).join('');
            return `<ul data-blog-block="${id}" data-blog-type="list">${items}</ul>`;
        }
        if (block.type === 'link') {
            return `<p data-blog-block="${id}" data-blog-type="link"><a class="btn-secondary" href="${escapeHtml(block.href || '#')}" data-blog-field="text">${escapeHtml(block.text)}</a></p>`;
        }
        if (block.type === 'image') {
            const src = publicUrl(block.src);
            return `
                <figure class="blog-article-image" data-blog-block="${id}" data-blog-type="image">
                    <img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt)}" data-blog-image-field="src">
                    <figcaption data-blog-field="caption">${escapeHtml(block.caption)}</figcaption>
                </figure>`;
        }
        return '';
    }

    function findArticleCard() {
        return document.querySelector('.content-card.blog-article') || document.querySelector('.content-card');
    }

    function renderPost() {
        const card = findArticleCard();
        if (!card || !post) return;
        const hero = publicUrl(post.heroImage);
        const blocks = (post.blocks || []).map(blockHtml).join('\n');
        card.classList.add('blog-article');
        card.innerHTML = `
            <p class="section-label" data-blog-post-field="category">${escapeHtml(post.category || 'Blog')}</p>
            <h1 class="main-title" data-blog-post-field="title">${escapeHtml(post.title)}</h1>
            <p class="subtitle" data-blog-post-field="metaDescription">${escapeHtml(post.metaDescription || '')}</p>
            ${hero ? `<img class="blog-article-hero" src="${escapeHtml(hero)}" alt="${escapeHtml(post.heroAlt || post.title)}" data-blog-post-image="heroImage">` : ''}
            <div class="blog-article-body" data-blog-body>${blocks}</div>
            <p style="text-align:center;margin-top:40px;"><a class="btn-primary" href="/pages/kontakt.html">Termin anfragen</a></p>`;
        applyEditingState();
    }

    async function loadPost() {
        const response = await fetch('/content/blog-posts.json', { cache: 'no-cache' });
        posts = await response.json();
        post = posts.find((item) => item.slug === slug || String(item.sourceFile || '').endsWith(`blog-${slug}.html`));
        if (!post) return;
        post.blocks = (post.blocks || []).map((block) => ({ id: block.id || uid(), ...block }));
        renderPost();
    }

    function applyEditingState() {
        document.body.classList.toggle('adp-local-cms-editing', editing);
        document.querySelectorAll('[data-blog-post-field], [data-blog-field], [data-blog-list-item]').forEach((element) => {
            element.contentEditable = editing ? 'true' : 'false';
            element.classList.toggle('adp-local-cms-editable', editing);
        });
        document.querySelectorAll('[data-blog-post-image], [data-blog-image-field]').forEach((element) => {
            element.classList.toggle('adp-local-cms-editable-image', editing);
        });
        toolbar?.classList.toggle('is-editing', editing);
        if (toolbar) {
            toolbar.querySelector('[data-blog-cms-edit]').hidden = editing;
            toolbar.querySelector('[data-blog-cms-save]').hidden = !editing;
            toolbar.querySelector('[data-blog-cms-finish]').hidden = !editing;
            toolbar.querySelector('[data-blog-cms-add-paragraph]').hidden = !editing;
            toolbar.querySelector('[data-blog-cms-add-heading]').hidden = !editing;
            toolbar.querySelector('[data-blog-cms-add-image]').hidden = !editing;
        }
        setStatus(editing ? 'Edycja bloga aktywna' : 'Blog CMS');
    }

    function setEditing(next) {
        editing = next;
        applyEditingState();
    }

    function collectPost() {
        const next = { ...post };
        document.querySelectorAll('[data-blog-post-field]').forEach((element) => {
            next[element.dataset.blogPostField] = element.innerHTML.trim();
        });
        const hero = document.querySelector('[data-blog-post-image="heroImage"]');
        if (hero) {
            next.heroImage = (hero.dataset.blogSrc || hero.getAttribute('src') || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
            next.heroAlt = hero.getAttribute('alt') || next.title || '';
            if (!next.cardImage || next.cardImage === post.heroImage) next.cardImage = next.heroImage;
            if (!next.cardImageAlt) next.cardImageAlt = next.heroAlt;
        }
        next.seoTitle = next.seoTitle || next.title;
        next.blocks = Array.from(document.querySelectorAll('[data-blog-block]')).map((element) => {
            const type = element.dataset.blogType;
            const id = element.dataset.blogBlock || uid();
            if (type === 'list') {
                return { id, type, items: Array.from(element.querySelectorAll('[data-blog-list-item]')).map((item) => item.innerHTML.trim()).filter(Boolean) };
            }
            if (type === 'link') {
                const link = element.querySelector('a');
                return { id, type, text: link?.innerHTML.trim() || '', href: link?.getAttribute('href') || '#' };
            }
            if (type === 'image') {
                const img = element.querySelector('img');
                const caption = element.querySelector('[data-blog-field="caption"]');
                return {
                    id,
                    type,
                    src: (img?.dataset.blogSrc || img?.getAttribute('src') || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, ''),
                    alt: img?.getAttribute('alt') || '',
                    caption: caption?.innerHTML.trim() || '',
                };
            }
            const text = element.innerHTML.trim();
            return { id, type, text };
        });
        return next;
    }

    async function savePost() {
        if (!post) return;
        const next = collectPost();
        const response = await fetch(`/__cms/blog-posts/${encodeURIComponent(post.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            window.alert(data.error || 'Nie udalo sie zapisac bloga.');
            return;
        }
        post = data.post || next;
        setStatus('Blog zapisany');
    }

    function downloadJson() {
        const blob = new Blob([JSON.stringify(collectPost(), null, 2)], { type: 'application/json;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${post.slug || 'blog-post'}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    async function uploadImageFile(file, target, blockId) {
        const response = await fetch('/__cms/blog-images', {
            method: 'POST',
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'X-Blog-Post': post.id,
                'X-Blog-Target': target,
                'X-Blog-Block': blockId || '',
                'X-File-Name': encodeURIComponent(file.name || 'blog-image'),
            },
            body: file,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.src) throw new Error(data.error || 'Upload failed');
        return data.src;
    }

    function ensureImagePanel() {
        if (imagePanel) return imagePanel;
        imagePanel = document.createElement('div');
        imagePanel.className = 'adp-local-image-panel';
        imagePanel.innerHTML = `
            <div class="adp-local-image-panel__dialog">
                <button type="button" class="adp-local-image-panel__close" data-image-close>&times;</button>
                <strong>Bild bearbeiten</strong>
                <div class="adp-local-image-panel__preview"><img alt="" data-image-preview></div>
                <label>Bilddatei<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-image-file></label>
                <label>Alt Text<input data-image-alt></label>
                <p class="adp-local-image-panel__status" data-image-status></p>
                <div class="adp-local-image-panel__actions">
                    <button type="button" data-image-apply>Speichern</button>
                </div>
            </div>`;
        document.body.appendChild(imagePanel);
        imagePanel.addEventListener('click', (event) => {
            if (event.target === imagePanel || event.target.closest('[data-image-close]')) imagePanel.classList.remove('is-open');
        });
        return imagePanel;
    }

    function openImageEditor(element) {
        const panel = ensureImagePanel();
        const preview = panel.querySelector('[data-image-preview]');
        const fileInput = panel.querySelector('[data-image-file]');
        const altInput = panel.querySelector('[data-image-alt]');
        const status = panel.querySelector('[data-image-status]');
        let selectedFile = null;
        let selectedPreviewUrl = '';
        preview.src = element.getAttribute('src') || '';
        altInput.value = element.getAttribute('alt') || '';
        status.textContent = '';
        fileInput.value = '';
        fileInput.onchange = () => {
            selectedFile = fileInput.files?.[0] || null;
            if (!selectedFile) return;
            if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
            selectedPreviewUrl = URL.createObjectURL(selectedFile);
            preview.src = selectedPreviewUrl;
            status.textContent = 'Podglad gotowy';
        };
        panel.querySelector('[data-image-apply]').onclick = async () => {
            try {
                status.textContent = 'Kopiowanie obrazu...';
                let src = element.dataset.blogSrc || element.getAttribute('src') || '';
                const figure = element.closest('[data-blog-block]');
                if (selectedFile) {
                    src = await uploadImageFile(
                        selectedFile,
                        element.dataset.blogPostImage || 'blockImage',
                        figure?.dataset.blogBlock || ''
                    );
                }
                element.dataset.blogSrc = src;
                element.src = publicUrl(src);
                element.alt = altInput.value.trim();
                await savePost();
                panel.classList.remove('is-open');
            } catch (error) {
                status.textContent = error.message || 'Upload failed';
            }
        };
        panel.classList.add('is-open');
    }

    function addBlock(type) {
        const body = document.querySelector('[data-blog-body]');
        if (!body) return;
        const block = { id: uid(), type };
        if (type === 'h2') block.text = 'Nowy naglowek';
        if (type === 'paragraph') block.text = 'Nowy akapit';
        if (type === 'image') Object.assign(block, { src: '', alt: '', caption: '' });
        body.insertAdjacentHTML('beforeend', blockHtml(block));
        applyEditingState();
    }

    function ensureToolbar() {
        if (toolbar) return toolbar;
        document.querySelector('.adp-local-cms-launcher')?.remove();
        toolbar = document.createElement('div');
        toolbar.className = 'adp-local-cms-toolbar adp-blog-cms-toolbar';
        toolbar.innerHTML = `
            <span data-blog-cms-status>Blog CMS</span>
            <button type="button" data-blog-cms-edit>Edytuj</button>
            <button type="button" data-blog-cms-save hidden>Zapisz</button>
            <button type="button" data-blog-cms-finish hidden>Podglad</button>
            <button type="button" data-blog-cms-add-paragraph hidden>+ Akapit</button>
            <button type="button" data-blog-cms-add-heading hidden>+ Naglowek</button>
            <button type="button" data-blog-cms-add-image hidden>+ Zdjecie</button>
            <button type="button" data-blog-cms-export>Export JSON</button>
            <button type="button" data-blog-cms-close>Zamknij</button>`;
        document.body.appendChild(toolbar);
        toolbar.querySelector('[data-blog-cms-edit]').addEventListener('click', () => setEditing(true));
        toolbar.querySelector('[data-blog-cms-save]').addEventListener('click', savePost);
        toolbar.querySelector('[data-blog-cms-finish]').addEventListener('click', () => setEditing(false));
        toolbar.querySelector('[data-blog-cms-add-paragraph]').addEventListener('click', () => addBlock('paragraph'));
        toolbar.querySelector('[data-blog-cms-add-heading]').addEventListener('click', () => addBlock('h2'));
        toolbar.querySelector('[data-blog-cms-add-image]').addEventListener('click', () => addBlock('image'));
        toolbar.querySelector('[data-blog-cms-export]').addEventListener('click', downloadJson);
        toolbar.querySelector('[data-blog-cms-close]').addEventListener('click', () => {
            setEditing(false);
            toolbar.remove();
            toolbar = null;
            window.localStorage.removeItem('adpBlogCmsVisible');
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
        button.addEventListener('click', showCms);
        document.body.appendChild(button);
    }

    function showCms() {
        window.localStorage.setItem('adpBlogCmsVisible', '1');
        ensureToolbar();
        setEditing(false);
    }

    document.addEventListener('click', (event) => {
        if (!editing) return;
        const image = event.target.closest('[data-blog-post-image], [data-blog-image-field]');
        if (!image) return;
        event.preventDefault();
        event.stopPropagation();
        openImageEditor(image);
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'e') showCms();
        if (editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            savePost();
        }
    });

    loadPost().then(() => {
        if (!post) return;
        if (new URLSearchParams(window.location.search).has('edit') || window.localStorage.getItem('adpBlogCmsVisible') === '1') showCms();
        else ensureLauncher();
    }).catch(() => {
        // Static HTML stays visible if JSON cannot be loaded.
    });
}());
