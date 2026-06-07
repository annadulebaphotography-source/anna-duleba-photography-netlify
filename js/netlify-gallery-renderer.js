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
    const localGalleryPreviews = new Map();

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
        if (image?.id && localGalleryPreviews.has(image.id)) return localGalleryPreviews.get(image.id);
        if (image.url) return image.url;
        const file = String(image.file || '').replace(/\\/g, '/');
        return file.startsWith('/') ? file : `/${file}`;
    }

    function versionedAssetUrl(image) {
        const url = normalizeAssetUrl(image);
        if (!url || /^https?:|^data:|^blob:/i.test(url)) return url;
        const separator = url.includes('?') ? '&' : '?';
        const version = encodeURIComponent(image.id || image.file || Date.now());
        return `${url}${separator}v=${version}`;
    }

    function canUseNetlifyImageCdn(url) {
        if (!url || !url.startsWith('/')) return false;
        if (/^\/\.netlify\/images/i.test(url)) return false;
        return !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
    }

    function netlifyImageUrl(url, width) {
        const cleanUrl = String(url || '').split('?')[0];
        const params = new URLSearchParams({
            url: cleanUrl,
            w: String(width),
            q: '68',
            fm: 'webp',
        });
        return `/.netlify/images?${params.toString()}`;
    }

    function galleryPreviewUrl(image, width = 900) {
        const original = normalizeAssetUrl(image);
        if (!canUseNetlifyImageCdn(original)) return versionedAssetUrl(image);
        return netlifyImageUrl(original, width);
    }

    function galleryPreviewSrcset(image) {
        const original = normalizeAssetUrl(image);
        if (!canUseNetlifyImageCdn(original)) return '';
        return [480, 720, 960, 1280]
            .map((width) => `${netlifyImageUrl(original, width)} ${width}w`)
            .join(', ');
    }

    function cmsFetch(url, options) {
        if (!window.adpCmsAuth?.fetch) throw new Error('CMS auth helper is not loaded');
        return window.adpCmsAuth.fetch(url, options);
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
        return `<button type="button" class="adp-gallery-cms-delete" data-gallery-delete="${escapeHtml(image.id)}" aria-label="Bild löschen">×</button>`;
    }

    function renderImages(images) {
        const visible = visibleSortedImages(images);
        return visible.map((image, index) => {
            const fullUrl = versionedAssetUrl(image);
            const previewUrl = galleryPreviewUrl(image);
            const srcset = galleryPreviewSrcset(image);
            const loading = index < 3 ? 'eager' : 'lazy';
            const priority = index < 3 ? ' fetchpriority="high"' : '';
            const srcsetAttr = srcset ? ` srcset="${escapeHtml(srcset)}" sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw"` : '';
            return [
                `<div class="${itemClass(image)}" data-gallery-image-id="${escapeHtml(image.id)}">`,
                `    <a class="adp-gallery-image-link" href="${escapeHtml(fullUrl)}" data-lightbox-index="${index}">`,
                `        <img src="${escapeHtml(previewUrl)}"${srcsetAttr} alt="${escapeHtml(image.alt || '')}" loading="${loading}" decoding="async"${priority} data-gallery-retry-src="${escapeHtml(previewUrl)}" data-gallery-full-src="${escapeHtml(fullUrl)}">`,
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
        lightboxImage.src = versionedAssetUrl(image);
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
        activeGrid.querySelectorAll('img[data-gallery-retry-src]').forEach((image) => {
            image.addEventListener('error', () => {
                if (image.dataset.galleryRetried === 'full') return;
                if (image.dataset.galleryRetried === 'retry' && image.dataset.galleryFullSrc) {
                    image.dataset.galleryRetried = 'full';
                    image.removeAttribute('srcset');
                    image.src = image.dataset.galleryFullSrc;
                    return;
                }
                image.dataset.galleryRetried = 'retry';
                const base = image.dataset.galleryRetrySrc;
                const separator = base.includes('?') ? '&' : '?';
                window.setTimeout(() => {
                    image.src = `${base}${separator}retry=${Date.now()}`;
                }, 800);
            }, { once: false });
        });
        activeGrid.querySelectorAll('[data-lightbox-index]').forEach((link) => {
            link.addEventListener('click', (event) => {
                if (event.target.closest('[data-gallery-delete]')) return;
                event.preventDefault();
                openLightbox(Number(link.dataset.lightboxIndex || 0));
            });
        });
    }

    async function saveGalleryJson() {
        const response = await cmsFetch(`/__cms/galleries/${encodeURIComponent(activeGalleryId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(activeGallery),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Gallery save failed');
    }

    async function uploadGalleryImage(file) {
        const uploadFile = await prepareImageForUpload(file);
        const response = await cmsFetch('/__cms/gallery-images', {
            method: 'POST',
            headers: {
                'Content-Type': uploadFile.type || file.type || 'application/octet-stream',
                'X-Gallery-ID': activeGalleryId,
                'X-File-Name': encodeURIComponent(uploadFile.name || file.name || 'gallery-image'),
            },
            body: uploadFile,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.src) throw new Error(data.error || 'Image upload failed');
        return data.src;
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
            reader.onerror = () => reject(reader.error || new Error('Image read failed'));
            reader.readAsDataURL(blob);
        });
    }

    async function uploadGalleryImageWithJson(file, gallery, image) {
        const uploadFile = await prepareImageForUpload(file);
        const contentBase64 = await blobToBase64(uploadFile);
        const response = await cmsFetch('/__cms/gallery-image-with-json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Gallery-ID': activeGalleryId,
            },
            body: JSON.stringify({
                gallery,
                image,
                fileName: uploadFile.name || file.name || 'gallery-image',
                contentType: uploadFile.type || file.type || 'application/octet-stream',
                contentBase64,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.gallery) throw new Error(data.error || 'Gallery image save failed');
        return data.gallery;
    }

    function prepareImageForUpload(file) {
        if (!file || !file.type?.startsWith('image/')) return Promise.resolve(file);
        if (file.type === 'image/gif' || file.size <= 1800 * 1024) return Promise.resolve(file);
        return new Promise((resolve) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                const maxSide = 1800;
                const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                if (scale >= 1 && file.size <= 2400 * 1024) {
                    resolve(file);
                    return;
                }
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        resolve(file);
                        return;
                    }
                    const cleanName = (file.name || 'gallery-image').replace(/\.[^.]+$/, '');
                    resolve(new File([blob], `${cleanName}.jpg`, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.84);
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
            };
            image.src = objectUrl;
        });
    }

    async function addGalleryImages(files) {
        const selectedFiles = Array.from(files || []);
        if (!selectedFiles.length || !activeGalleryId || !activeGallery) return;
        const reversedFiles = selectedFiles.slice().reverse();

        for (const [index, file] of reversedFiles.entries()) {
            const uploadFile = await prepareImageForUpload(file);
            const previewUrl = URL.createObjectURL(uploadFile);
            const image = {
                id: `${activeGalleryId}-${Date.now()}-${index + 1}`,
                file: '',
                alt: activeGallery.title || '',
                order: 1,
                visible: true,
            };
            const existingImages = visibleSortedImages(activeGallery.images || [])
                .map((item, itemIndex) => ({ ...item, order: itemIndex + 2 }));
            const hiddenImages = (activeGallery.images || [])
                .filter((item) => item.visible === false)
                .map((item, itemIndex) => ({ ...item, order: existingImages.length + itemIndex + 2 }));
            const nextGallery = { ...activeGallery, images: [image, ...existingImages, ...hiddenImages] };
            localGalleryPreviews.set(image.id, previewUrl);
            activeGallery = await uploadGalleryImageWithJson(uploadFile, nextGallery, image);
            localGalleryPreviews.set(image.id, previewUrl);
            renderGallery(activeGallery);
        }
    }

    async function deleteGalleryImage(imageId) {
        if (!imageId || !activeGallery) return;
        if (!window.confirm('Dieses Bild löschen?')) return;
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
            <button type="button" class="adp-gallery-cms-add">+ Bilder hinzufügen</button>
            <span class="adp-gallery-cms-status" aria-live="polite"></span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>
        `;
        const input = bar.querySelector('input');
        const status = bar.querySelector('.adp-gallery-cms-status');
        bar.querySelector('button').addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            input.value = '';
            if (!files.length) return;
            try {
                bar.querySelector('button').disabled = true;
                bar.querySelector('button').textContent = `Upload ${files.length} Bilder...`;
                await addGalleryImages(files);
                status.textContent = 'Gespeichert. Die neuen Bilder werden bis zum Netlify-Deploy lokal angezeigt.';
            } catch (error) {
                status.textContent = '';
                window.alert(error.message || 'Upload failed');
            } finally {
                bar.querySelector('button').disabled = false;
                bar.querySelector('button').textContent = '+ Bilder hinzufügen';
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
