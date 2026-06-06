(function () {
    const galleryIdsByPage = {
        'babybauch-galerie': 'babybauch',
        'familien-galerie': 'familien',
        'frauen-galerie': 'frauen',
        'kinder-galerie': 'kinder',
        'kinder-fineart-galerie': 'kinder-fineart',
        'newborn-familie-galerie': 'newborn-familie',
        'newborn-fineart-galerie': 'newborn-fineart',
        'newborn-geschwister-galerie': 'newborn-geschwister',
        'smashcake-galerie': 'smashcake',
        'studio': 'studio',
    };

    const placeholderWidePositions = new Set([4, 5, 11]);
    let activeGallery = null;
    let activeGrid = null;
    let lightbox = null;
    let lightboxImage = null;
    let lightboxCounter = null;
    let lightboxIndex = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let activeGalleryId = null;

    function pageSlug() {
        const file = window.location.pathname.split('/').pop() || '';
        return file.replace(/\.html$/, '');
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        }[char]));
    }

    function normalizeAssetUrl(image) {
        if (image.url) return image.url;
        const file = String(image.file || '').replace(/\\/g, '/');
        return file.startsWith('/') ? file : `/${file}`;
    }

    function visibleSortedImages(images) {
        return (Array.isArray(images) ? images : [])
            .filter((image) => image.visible !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function itemClass(image) {
        const classes = ['gallery-item'];
        if (image.variant && image.variant !== 'normal') classes.push(image.variant);
        if (image.featured) classes.push('featured');
        return classes.join(' ');
    }

    function isCmsEditing() {
        return document.body.classList.contains('adp-local-cms-editing');
    }

    function renderEditControls(image) {
        if (!isCmsEditing()) return '';
        return `<button type="button" class="adp-gallery-cms-delete" data-gallery-delete="${escapeHtml(image.id)}" aria-label="Bild loeschen">×</button>`;
    }

    function renderImages(images) {
        const visible = visibleSortedImages(images);
        return visible.map((image, index) => {
            const url = normalizeAssetUrl(image);
            return [
                `<div class="${itemClass(image)}" data-gallery-image-id="${escapeHtml(image.id)}">`,
                `    <a class="adp-gallery-image-link" href="${escapeHtml(url)}" data-lightbox-index="${index}">`,
                `        <img src="${escapeHtml(url)}" alt="${escapeHtml(image.alt || '')}" loading="lazy">`,
                '    </a>',
                renderEditControls(image),
                '</div>',
            ].join('\n');
        }).join('\n\n');
    }

    function renderPlaceholders(count) {
        return Array.from({ length: count }, (_, index) => {
            const number = index + 1;
            const wide = placeholderWidePositions.has(number) ? ' wide' : '';
            return [
                `<div class="gallery-item gallery-placeholder${wide}">`,
                `    <span>FOTO ${String(number).padStart(2, '0')}</span>`,
                '</div>',
            ].join('\n');
        }).join('\n\n');
    }

    function applyLayout(grid, layout) {
        grid.classList.remove('gallery-mosaic', 'gallery-masonry', 'gallery-natural', 'gallery-classic');
        grid.classList.add(`gallery-${layout || 'mosaic'}`);
    }

    async function loadGallery(galleryId) {
        const response = await fetch(`/content/galleries/${encodeURIComponent(galleryId)}.json`, {
            headers: { Accept: 'application/json' },
            cache: 'no-cache',
        });
        if (!response.ok) throw new Error(`Gallery JSON failed: ${response.status}`);
        return response.json();
    }

    function currentLightboxImages() {
        return visibleSortedImages(activeGallery?.images || []);
    }

    function ensureLightbox() {
        if (lightbox) return lightbox;

        lightbox = document.createElement('div');
        lightbox.className = 'adp-lightbox';
        lightbox.setAttribute('aria-hidden', 'true');
        lightbox.setAttribute('role', 'dialog');
        lightbox.setAttribute('aria-modal', 'true');
        lightbox.innerHTML = [
            '<button type="button" class="adp-lightbox__close" data-lightbox-close aria-label="Close">&times;</button>',
            '<button type="button" class="adp-lightbox__nav adp-lightbox__nav--prev" data-lightbox-prev aria-label="Previous image">&lsaquo;</button>',
            '<figure class="adp-lightbox__figure">',
            '    <img class="adp-lightbox__image" alt="">',
            '    <figcaption class="adp-lightbox__counter"></figcaption>',
            '</figure>',
            '<button type="button" class="adp-lightbox__nav adp-lightbox__nav--next" data-lightbox-next aria-label="Next image">&rsaquo;</button>',
        ].join('\n');

        lightboxImage = lightbox.querySelector('.adp-lightbox__image');
        lightboxCounter = lightbox.querySelector('.adp-lightbox__counter');
        lightbox.querySelector('[data-lightbox-close]').addEventListener('click', closeLightbox);
        lightbox.querySelector('[data-lightbox-prev]').addEventListener('click', () => showLightboxImage(lightboxIndex - 1));
        lightbox.querySelector('[data-lightbox-next]').addEventListener('click', () => showLightboxImage(lightboxIndex + 1));
        lightbox.addEventListener('click', (event) => {
            if (event.target === lightbox) closeLightbox();
        });
        lightbox.addEventListener('touchstart', handleTouchStart, { passive: true });
        lightbox.addEventListener('touchend', handleTouchEnd, { passive: true });
        document.body.appendChild(lightbox);
        return lightbox;
    }

    function showLightboxImage(index) {
        const images = currentLightboxImages();
        if (!images.length) return;
        lightboxIndex = (index + images.length) % images.length;
        const image = images[lightboxIndex];
        lightboxImage.src = normalizeAssetUrl(image);
        lightboxImage.alt = image.alt || '';
        lightboxCounter.textContent = `${lightboxIndex + 1} / ${images.length}`;
    }

    function openLightbox(index) {
        ensureLightbox();
        showLightboxImage(index);
        lightbox.classList.add('is-open');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.classList.add('adp-lightbox-open');
    }

    function closeLightbox() {
        if (!lightbox) return;
        lightbox.classList.remove('is-open');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('adp-lightbox-open');
    }

    function handleTouchStart(event) {
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }

    function handleTouchEnd(event) {
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        const diffX = touch.clientX - touchStartX;
        const diffY = touch.clientY - touchStartY;
        if (Math.abs(diffX) < 45 || Math.abs(diffX) < Math.abs(diffY)) return;
        showLightboxImage(diffX < 0 ? lightboxIndex + 1 : lightboxIndex - 1);
    }

    function attachLightboxEvents() {
        activeGrid.querySelectorAll('[data-lightbox-index]').forEach((link) => {
            link.addEventListener('click', (event) => {
                if (event.target.closest('[data-gallery-delete]')) return;
                event.preventDefault();
                openLightbox(Number(link.dataset.lightboxIndex || 0));
            });
        });
    }

    async function saveGalleryJson() {
        const response = await fetch(`/__cms/galleries/${encodeURIComponent(activeGalleryId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(activeGallery),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Gallery save failed');
    }

    async function uploadGalleryImage(file) {
        const response = await fetch('/__cms/gallery-images', {
            method: 'POST',
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'X-Gallery-ID': activeGalleryId,
                'X-File-Name': encodeURIComponent(file.name || 'image'),
            },
            body: file,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.src) throw new Error(data.error || 'Image upload failed');
        return data.src;
    }

    async function addGalleryImages(files) {
        const selectedFiles = Array.from(files || []);
        if (!selectedFiles.length || !activeGalleryId || !activeGallery) return;
        const existingImages = visibleSortedImages(activeGallery.images || [])
            .map((image, index) => ({ ...image, order: selectedFiles.length + index + 1 }));
        const hiddenImages = (activeGallery.images || [])
            .filter((image) => image.visible === false)
            .map((image, index) => ({ ...image, order: selectedFiles.length + existingImages.length + index + 1 }));
        const newImages = [];

        for (const [index, file] of selectedFiles.entries()) {
            const src = await uploadGalleryImage(file);
            newImages.push({
                id: `${activeGalleryId}-${Date.now()}-${index + 1}`,
                file: src,
                alt: activeGallery.title || '',
                order: index + 1,
                visible: true,
            });
        }

        activeGallery.images = [...newImages, ...existingImages, ...hiddenImages];
        await saveGalleryJson();
        renderGallery(activeGallery);
    }

    async function deleteGalleryImage(imageId) {
        if (!imageId || !activeGallery) return;
        if (!window.confirm('Dieses Bild loeschen?')) return;
        activeGallery.images = (activeGallery.images || []).filter((image) => image.id !== imageId);
        await saveGalleryJson();
        renderGallery(activeGallery);
    }

    function renderCmsBar() {
        document.querySelector('.adp-gallery-cms-bar')?.remove();
        if (!isCmsEditing() || !activeGrid) return;
        const bar = document.createElement('div');
        bar.className = 'adp-gallery-cms-bar';
        bar.innerHTML = `
            <button type="button" class="adp-gallery-cms-add">+ Bilder hinzufuegen</button>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>
        `;
        const input = bar.querySelector('input');
        bar.querySelector('button').addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            input.value = '';
            if (!files.length) return;
            try {
                bar.querySelector('button').disabled = true;
                bar.querySelector('button').textContent = `Upload ${files.length} Bilder...`;
                await addGalleryImages(files);
            } catch (error) {
                window.alert(error.message || 'Upload failed');
            } finally {
                bar.querySelector('button').disabled = false;
                bar.querySelector('button').textContent = '+ Bilder hinzufuegen';
            }
        });
        activeGrid.parentElement.insertBefore(bar, activeGrid);
    }

    function attachCmsEvents() {
        activeGrid.querySelectorAll('[data-gallery-delete]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                deleteGalleryImage(button.dataset.galleryDelete).catch((error) => {
                    window.alert(error.message || 'Delete failed');
                });
            });
        });
    }

    function renderGallery(gallery) {
        activeGallery = gallery;
        applyLayout(activeGrid, gallery.layout);
        const visibleImages = visibleSortedImages(gallery.images);
        activeGrid.innerHTML = visibleImages.length
            ? renderImages(gallery.images)
            : renderPlaceholders(gallery.settings?.placeholderCount || 12);
        activeGrid.dataset.gallerySource = 'static-json';
        attachLightboxEvents();
        attachCmsEvents();
        renderCmsBar();
    }

    function bindKeyboard() {
        document.addEventListener('keydown', (event) => {
            if (!lightbox?.classList.contains('is-open')) return;
            if (event.key === 'Escape') closeLightbox();
            if (event.key === 'ArrowLeft') showLightboxImage(lightboxIndex - 1);
            if (event.key === 'ArrowRight') showLightboxImage(lightboxIndex + 1);
        });
    }

    async function init() {
        const galleryId = galleryIdsByPage[pageSlug()];
        activeGrid = document.querySelector('.gallery-grid');
        if (!galleryId || !activeGrid) return;
        activeGalleryId = galleryId;
        bindKeyboard();
        try {
            renderGallery(await loadGallery(galleryId));
        } catch {
            activeGrid.dataset.gallerySource = 'static-fallback';
        }
        document.addEventListener('adp:local-cms-editing', () => {
            if (activeGallery) renderGallery(activeGallery);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
