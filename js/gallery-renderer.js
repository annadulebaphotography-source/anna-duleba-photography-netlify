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
    };

    const placeholderWidePositions = new Set([4, 5, 11]);
    let activeGalleryId = null;
    let activeGrid = null;
    let activeGallery = null;
    let uploadInput = null;
    let busy = false;
    let lightbox = null;
    let lightboxImage = null;
    let lightboxCounter = null;
    let lightboxIndex = 0;
    let touchStartX = 0;
    let touchStartY = 0;

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

    function isEditModeActive() {
        return Boolean(window.adpEditMode?.getState?.().editMode);
    }

    function itemClass(image) {
        const classes = ['gallery-item'];
        if (image.variant && image.variant !== 'normal') classes.push(image.variant);
        if (image.featured) classes.push('featured');
        return classes.join(' ');
    }

    function visibleSortedImages(images) {
        return (Array.isArray(images) ? images : [])
            .filter((image) => image.visible !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function currentLightboxImages() {
        return visibleSortedImages(activeGallery?.images || []);
    }

    function renderImageControls(image, index, total) {
        if (!isEditModeActive()) return '';
        return [
            '<div class="adp-gallery-controls" data-adp-image-controls>',
            `    <button type="button" class="adp-gallery-control" data-gallery-move="up" data-image-id="${escapeHtml(image.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Move image up">↑</button>`,
            `    <button type="button" class="adp-gallery-control" data-gallery-move="down" data-image-id="${escapeHtml(image.id)}" ${index === total - 1 ? 'disabled' : ''} aria-label="Move image down">↓</button>`,
            `    <button type="button" class="adp-gallery-control adp-gallery-control--danger" data-gallery-delete="${escapeHtml(image.id)}" aria-label="Delete image">×</button>`,
            '</div>',
        ].join('\n');
    }

    function renderImages(images) {
        const visible = visibleSortedImages(images);
        return visible
            .map((image, index) => {
                const url = normalizeAssetUrl(image);
                const alt = escapeHtml(image.alt || '');
                return [
                    `<div class="${itemClass(image)}" data-gallery-image-id="${escapeHtml(image.id)}">`,
                    `    <a class="adp-gallery-image-link" href="${escapeHtml(url)}" data-lightbox-index="${index}">`,
                    `        <img src="${escapeHtml(url)}" alt="${alt}" loading="lazy">`,
                    '    </a>',
                    renderImageControls(image, index, visible.length),
                    '</div>',
                ].join('\n');
            })
            .join('\n\n');
    }

    function renderPlaceholders(count) {
        return Array.from({ length: count }, (_, index) => {
            const number = index + 1;
            const label = String(number).padStart(2, '0');
            const wide = placeholderWidePositions.has(number) ? ' wide' : '';
            return [
                `<div class="gallery-item gallery-placeholder${wide}">`,
                `    <span>FOTO ${label}</span>`,
                '</div>',
            ].join('\n');
        }).join('\n\n');
    }

    function applyLayout(grid, layout) {
        grid.classList.remove('gallery-mosaic', 'gallery-masonry', 'gallery-natural', 'gallery-classic');
        grid.classList.add(`gallery-${layout || 'mosaic'}`);
    }

    async function loadGallery(galleryId) {
        const response = await fetch(`/api/galleries/${encodeURIComponent(galleryId)}`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`Gallery API failed: ${response.status}`);
        return response.json();
    }

    function renderAddButton() {
        if (!isEditModeActive()) return '';
        return [
            '<button type="button" class="gallery-item adp-gallery-add" data-gallery-add>',
            '    <span>+ Bild hinzuf&uuml;gen</span>',
            '</button>',
        ].join('\n');
    }

    function renderGallery(gallery) {
        if (!activeGrid || !gallery) return;
        activeGallery = gallery;
        const visibleImages = visibleSortedImages(gallery.images);
        applyLayout(activeGrid, gallery.layout);
        activeGrid.innerHTML = [
            visibleImages.length
                ? renderImages(gallery.images)
                : renderPlaceholders(gallery.settings?.placeholderCount || 12),
            renderAddButton(),
        ].filter(Boolean).join('\n\n');
        activeGrid.dataset.gallerySource = 'api';
        attachEditEvents();
        attachLightboxEvents();
        document.dispatchEvent(new CustomEvent('adp:gallery-rendered', {
            detail: { galleryId: activeGalleryId, gallery },
        }));
    }

    async function refreshGallery() {
        if (!activeGalleryId) return;
        const gallery = await loadGallery(activeGalleryId);
        renderGallery(gallery);
    }

    function ensureUploadInput() {
        if (uploadInput) return uploadInput;
        uploadInput = document.createElement('input');
        uploadInput.type = 'file';
        uploadInput.accept = 'image/jpeg,image/png,image/webp';
        uploadInput.multiple = true;
        uploadInput.hidden = true;
        uploadInput.addEventListener('change', () => {
            uploadImages(uploadInput.files).finally(() => {
                uploadInput.value = '';
            });
        });
        document.body.appendChild(uploadInput);
        return uploadInput;
    }

    function attachEditEvents() {
        if (!activeGrid || !isEditModeActive()) return;
        activeGrid.querySelector('[data-gallery-add]')?.addEventListener('click', () => {
            if (busy) return;
            ensureUploadInput().click();
        });
        activeGrid.querySelectorAll('[data-gallery-delete]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                deleteImage(button.dataset.galleryDelete);
            });
        });
        activeGrid.querySelectorAll('[data-gallery-move]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                moveImage(button.dataset.imageId, button.dataset.galleryMove);
            });
        });
    }

    function attachLightboxEvents() {
        if (!activeGrid) return;
        activeGrid.querySelectorAll('[data-lightbox-index]').forEach((link) => {
            link.addEventListener('click', (event) => {
                if (event.target.closest('[data-adp-image-controls]')) return;
                event.preventDefault();
                openLightbox(Number(link.dataset.lightboxIndex || 0));
            });
        });
    }

    function setBusy(value) {
        busy = value;
        activeGrid?.classList.toggle('adp-gallery-busy', value);
        activeGrid?.querySelectorAll('[data-gallery-add], [data-gallery-delete], [data-gallery-move]').forEach((element) => {
            element.disabled = value;
        });
    }

    async function uploadImages(files) {
        if (!activeGalleryId || !files || !files.length || busy) return;
        setBusy(true);
        try {
            const form = new FormData();
            Array.from(files).forEach((file) => form.append('images', file));
            const response = await fetch(`/api/galleries/${encodeURIComponent(activeGalleryId)}/images`, {
                method: 'POST',
                credentials: 'same-origin',
                body: form,
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Upload failed');
            }
            await refreshGallery();
            window.adpEditMode?.markDirty?.();
        } catch (error) {
            window.alert(error.message || 'Upload failed');
        } finally {
            setBusy(false);
        }
    }

    async function deleteImage(imageId) {
        if (!activeGalleryId || !imageId || busy) return;
        if (!window.confirm('Dieses Bild löschen?')) return;
        setBusy(true);
        try {
            const response = await fetch(`/api/galleries/${encodeURIComponent(activeGalleryId)}/images/${encodeURIComponent(imageId)}`, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Delete failed');
            }
            await refreshGallery();
            window.adpEditMode?.markDirty?.();
        } catch (error) {
            window.alert(error.message || 'Delete failed');
        } finally {
            setBusy(false);
        }
    }

    async function saveGalleryOrder(images) {
        const response = await fetch(`/api/galleries/${encodeURIComponent(activeGalleryId)}`, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ...activeGallery, images }),
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Reorder failed');
        }
        return response.json();
    }

    async function moveImage(imageId, direction) {
        if (!activeGallery || !imageId || busy) return;
        const allImages = (activeGallery.images || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        const visible = allImages.filter((image) => image.visible !== false);
        const index = visible.findIndex((image) => image.id === imageId);
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || swapIndex < 0 || swapIndex >= visible.length) return;

        const current = visible[index];
        const swap = visible[swapIndex];
        const currentOrder = current.order;
        current.order = swap.order;
        swap.order = currentOrder;

        const normalized = allImages.sort((a, b) => (a.order || 0) - (b.order || 0));
        normalized.forEach((image, orderIndex) => {
            image.order = orderIndex + 1;
        });

        setBusy(true);
        try {
            activeGallery = await saveGalleryOrder(normalized);
            renderGallery(activeGallery);
            window.adpEditMode?.markDirty?.();
        } catch (error) {
            window.alert(error.message || 'Reorder failed');
            await refreshGallery().catch(() => {});
        } finally {
            setBusy(false);
        }
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

    function openLightbox(index) {
        const images = currentLightboxImages();
        if (!images.length) return;
        ensureLightbox();
        lightbox.classList.add('is-open');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.classList.add('adp-lightbox-open');
        showLightboxImage(index);
        document.addEventListener('keydown', handleLightboxKeydown);
    }

    function closeLightbox() {
        if (!lightbox) return;
        lightbox.classList.remove('is-open');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('adp-lightbox-open');
        document.removeEventListener('keydown', handleLightboxKeydown);
    }

    function showLightboxImage(index) {
        const images = currentLightboxImages();
        if (!images.length) return;
        lightboxIndex = (index + images.length) % images.length;
        const image = images[lightboxIndex];
        const url = normalizeAssetUrl(image);
        lightboxImage.src = url;
        lightboxImage.alt = image.alt || '';
        lightboxCounter.textContent = `${lightboxIndex + 1} / ${images.length}`;
    }

    function handleLightboxKeydown(event) {
        if (!lightbox?.classList.contains('is-open')) return;
        if (event.key === 'Escape') closeLightbox();
        if (event.key === 'ArrowLeft') showLightboxImage(lightboxIndex - 1);
        if (event.key === 'ArrowRight') showLightboxImage(lightboxIndex + 1);
    }

    function handleTouchStart(event) {
        const touch = event.changedTouches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }

    function handleTouchEnd(event) {
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) return;
        if (deltaX < 0) showLightboxImage(lightboxIndex + 1);
        else showLightboxImage(lightboxIndex - 1);
    }

    async function init() {
        const galleryId = galleryIdsByPage[pageSlug()];
        if (!galleryId) return;

        const grid = document.querySelector('.gallery-grid');
        if (!grid) return;

        activeGalleryId = galleryId;
        activeGrid = grid;
        grid.dataset.galleryId = galleryId;
        grid.dataset.adpGallery = galleryId;
        grid.dataset.gallerySource = 'static';

        try {
            renderGallery(await loadGallery(galleryId));
        } catch (error) {
            grid.dataset.gallerySource = 'fallback';
            document.dispatchEvent(new CustomEvent('adp:gallery-fallback', {
                detail: { galleryId, error: error.message },
            }));
        }
    }

    document.addEventListener('adp:edit-mode-enter', () => {
        if (activeGallery) renderGallery(activeGallery);
    });

    document.addEventListener('adp:edit-mode-exit', () => {
        if (activeGallery) renderGallery(activeGallery);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
