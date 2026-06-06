(function () {
    const page = document.body?.dataset.contentPage || '';
    let content = {};
    let activeImage = null;
    let panel = null;

    function imageElements() {
        return Array.from(document.querySelectorAll('[data-editable-image]'));
    }

    function isEditModeActive() {
        return Boolean(window.adpEditMode?.getState?.().editMode);
    }

    function publicUrl(file) {
        const value = String(file || '').trim();
        if (!value) return '';
        if (/^(https?:|data:|\/)/i.test(value)) return value;
        return `/${value.replace(/^\/+/, '')}`;
    }

    function relativePath(url) {
        const value = String(url || '').trim();
        if (!value) return '';
        try {
            const parsed = new URL(value, window.location.origin);
            return parsed.pathname.replace(/^\/+/, '');
        } catch {
            return value.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
        }
    }

    function isImg(element) {
        return element.tagName?.toLowerCase() === 'img';
    }

    function backgroundPath(element) {
        const value = element.style.backgroundImage || '';
        const match = /url\(["']?([^"')]+)["']?\)/.exec(value);
        return match ? relativePath(match[1]) : '';
    }

    function imageData(element) {
        const key = element.dataset.editableImage;
        const saved = content[page]?.[key];
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            return {
                src: saved.src || relativePath(element.getAttribute('src')) || backgroundPath(element),
                alt: Object.prototype.hasOwnProperty.call(saved, 'alt') ? saved.alt : element.getAttribute('alt') || '',
                title: Object.prototype.hasOwnProperty.call(saved, 'title') ? saved.title : element.getAttribute('title') || '',
            };
        }
        if (typeof saved === 'string') {
            return {
                src: saved,
                alt: element.getAttribute('alt') || '',
                title: element.getAttribute('title') || '',
            };
        }
        return {
            src: relativePath(element.getAttribute('src')) || backgroundPath(element),
            alt: element.getAttribute('alt') || '',
            title: element.getAttribute('title') || '',
        };
    }

    function applyImageData(element, data) {
        const src = data.src || relativePath(element.getAttribute('src')) || backgroundPath(element);
        if (src) {
            const url = publicUrl(src);
            if (isImg(element)) {
                element.src = url;
            } else {
                element.style.backgroundImage = `url("${url}")`;
                element.classList.add('has-image');
            }
            if (element.parentElement?.tagName?.toLowerCase() === 'picture') {
                element.parentElement.querySelectorAll('source').forEach((source) => {
                    source.srcset = url;
                });
            }
        }
        if (isImg(element)) element.alt = data.alt || '';
        if (data.title) element.title = data.title;
        else element.removeAttribute('title');
    }

    function applySavedImages() {
        imageElements().forEach((image) => {
            const key = image.dataset.editableImage;
            const saved = content[page]?.[key];
            if (saved) applyImageData(image, imageData(image));
        });
    }

    async function loadContent() {
        if (!page) return;
        try {
            const response = await fetch('/api/content', {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) return;
            content = await response.json();
            applySavedImages();
        } catch {
            content = {};
        }
    }

    function createControls(element) {
        if (element.dataset.imageControlsReady === 'true') return;
        element.dataset.imageControlsReady = 'true';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'adp-content-image-edit-button';
        button.textContent = 'Bild bearbeiten';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openPanel(element);
        });

        if (element.classList.contains('hero-image') || element.closest('.hero-section')) {
            button.classList.add('adp-content-image-edit-button--hero');
            const section = element.closest('.hero-section');
            section?.appendChild(button);
        } else {
            const wrapper = document.createElement('span');
            wrapper.className = 'adp-content-image-wrap';
            element.parentNode.insertBefore(wrapper, element);
            wrapper.appendChild(element);
            wrapper.appendChild(button);
        }

        element.addEventListener('click', (event) => {
            if (!isEditModeActive()) return;
            event.preventDefault();
            event.stopPropagation();
            openPanel(element);
        });
    }

    function ensurePanel() {
        if (panel) return panel;
        panel = document.createElement('div');
        panel.className = 'adp-content-image-panel';
        panel.innerHTML = `
            <div class="adp-content-image-panel__dialog" role="dialog" aria-modal="true" aria-label="Bild bearbeiten">
                <div class="adp-content-image-panel__head">
                    <strong>Bild bearbeiten</strong>
                    <button type="button" data-image-close aria-label="Schließen">×</button>
                </div>
                <div class="adp-content-image-panel__preview"><img alt=""></div>
                <label>Alt Text<input data-image-alt></label>
                <label>Image Title<input data-image-title></label>
                <div class="adp-content-image-panel__actions">
                    <button type="button" data-image-upload>Bild ändern</button>
                    <button type="button" class="adp-content-image-upload adp-content-image-save" data-image-save>Speichern</button>
                </div>
                <p class="adp-content-image-panel__status" data-image-status></p>
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-image-file>
            </div>`;
        document.body.appendChild(panel);
        panel.addEventListener('click', (event) => {
            if (event.target === panel || event.target.closest('[data-image-close]')) closePanel();
            if (event.target.closest('[data-image-upload]')) panel.querySelector('[data-image-file]').click();
            if (event.target.closest('[data-image-save]')) saveMetadata().catch((error) => window.alert(error.message || 'Image save failed'));
        });
        panel.querySelector('[data-image-file]').addEventListener('change', () => {
            const file = panel.querySelector('[data-image-file]').files[0];
            uploadImage(file).finally(() => {
                panel.querySelector('[data-image-file]').value = '';
            });
        });
        return panel;
    }

    function openPanel(image) {
        if (!isEditModeActive()) return;
        activeImage = image;
        const data = imageData(image);
        const modal = ensurePanel();
        modal.querySelector('.adp-content-image-panel__preview img').src = publicUrl(data.src);
        modal.querySelector('[data-image-alt]').value = data.alt || '';
        modal.querySelector('[data-image-title]').value = data.title || '';
        setStatus('');
        modal.classList.add('is-open');
    }

    function closePanel() {
        ensurePanel().classList.remove('is-open');
        activeImage = null;
    }

    function setStatus(message) {
        const status = ensurePanel().querySelector('[data-image-status]');
        status.textContent = message || '';
    }

    async function saveMetadata() {
        if (!activeImage) return;
        const key = activeImage.dataset.editableImage;
        const current = imageData(activeImage);
        const nextData = {
            src: current.src,
            alt: panel.querySelector('[data-image-alt]').value.trim(),
            title: panel.querySelector('[data-image-title]').value.trim(),
        };
        const response = await fetch('/api/content', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ page, fields: { [key]: nextData } }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Image save failed');
        content = data;
        applyImageData(activeImage, nextData);
        activeImage.classList.add('adp-inline-edited');
        window.adpEditMode?.markDirty?.();
        setStatus('Gespeichert');
        closePanel();
    }

    async function uploadImage(file) {
        if (!activeImage || !file || !isEditModeActive()) return;
        const key = activeImage.dataset.editableImage;
        const alt = panel.querySelector('[data-image-alt]').value.trim();
        const title = panel.querySelector('[data-image-title]').value.trim();

        const saveButton = panel.querySelector('[data-image-save]');
        saveButton.disabled = true;
        setStatus('Upload läuft...');
        try {
            const response = await fetch('/__cms/images', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': file.type || 'image/jpeg',
                    'X-CMS-Page': page,
                    'X-CMS-Key': key,
                    'X-File-Name': encodeURIComponent(file.name || 'image.jpg'),
                },
                body: file,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Image upload failed');

            const nextData = { src: data.src || '', alt, title };
            const saveResponse = await fetch('/api/content', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ page, fields: { [key]: nextData } }),
            });
            const saveData = await saveResponse.json().catch(() => ({}));
            if (!saveResponse.ok) throw new Error(saveData.error || 'Image metadata save failed');

            content = saveData || content;
            const saved = content[page]?.[key];
            const renderedData = saved && typeof saved === 'object' ? saved : nextData;
            applyImageData(activeImage, renderedData);
            panel.querySelector('.adp-content-image-panel__preview img').src = publicUrl(renderedData.src);
            activeImage.classList.add('adp-inline-edited');
            window.adpEditMode?.markDirty?.();
            setStatus('Gespeichert');
        } catch (error) {
            window.alert(error.message || 'Image upload failed');
            setStatus('Fehler beim Speichern');
        } finally {
            saveButton.disabled = false;
        }
    }

    function setControls(active) {
        document.body.classList.toggle('adp-content-image-editing', active);
        if (!active) closePanel();
    }

    function init() {
        if (!page || !imageElements().length) return;
        imageElements().forEach(createControls);
        loadContent();
        document.addEventListener('adp:edit-mode-enter', () => setControls(true));
        document.addEventListener('adp:edit-mode-exit', () => setControls(false));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
