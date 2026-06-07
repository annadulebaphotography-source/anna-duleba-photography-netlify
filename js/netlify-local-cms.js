(function () {
    const page = document.body?.dataset.contentPage || '';
    const canEditPage = Boolean(page || document.querySelector('.gallery-grid'));
    if (!canEditPage) return;

    const storageKey = 'adpNetlifyCmsDraft';
    let editing = false;
    let toolbar = null;
    let imagePanel = null;

    function readDraft() {
        try {
            return JSON.parse(window.localStorage.getItem(storageKey) || '{}');
        } catch {
            return {};
        }
    }

    function writeDraft(data) {
        window.localStorage.setItem(storageKey, JSON.stringify(data));
    }

    function pageDraft() {
        return readDraft()[page] || {};
    }

    function updatePageDraft(fields) {
        const draft = readDraft();
        draft[page] = { ...(draft[page] || {}), ...fields };
        writeDraft(draft);
        window.dispatchEvent(new CustomEvent('adp:local-cms-saved', { detail: { page, fields } }));
    }

    function publicUrl(value) {
        const path = String(value || '').trim();
        if (!path) return '';
        if (/^(https?:|data:|\/)/i.test(path)) return path;
        return `/${path.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '')}`;
    }

    function cmsFetch(url, options) {
        if (!window.adpCmsAuth?.fetch) throw new Error('CMS auth helper is not loaded');
        return window.adpCmsAuth.fetch(url, options);
    }

    function imageData(element) {
        const key = element.dataset.editableImage;
        const saved = pageDraft()[key];
        if (saved && typeof saved === 'object') {
            return {
                src: saved.src || '',
                alt: Object.prototype.hasOwnProperty.call(saved, 'alt') ? saved.alt : element.getAttribute('alt') || '',
                title: Object.prototype.hasOwnProperty.call(saved, 'title') ? saved.title : element.getAttribute('title') || '',
            };
        }
        return {
            src: element.getAttribute('src') || '',
            alt: element.getAttribute('alt') || '',
            title: element.getAttribute('title') || '',
        };
    }

    function applyImage(element, data) {
        const src = publicUrl(data.src);
        if (src) {
            if (element.tagName?.toLowerCase() === 'img') {
                element.src = src;
            } else {
                element.style.backgroundImage = `url("${src}")`;
                element.classList.add('has-image');
            }
            if (element.parentElement?.tagName?.toLowerCase() === 'picture') {
                element.parentElement.querySelectorAll('source').forEach((source) => {
                    source.srcset = src;
                });
            }
        }
        if (element.tagName?.toLowerCase() === 'img') element.alt = data.alt || '';
        if (data.title) element.title = data.title;
        else element.removeAttribute('title');
    }

    function applyDraft() {
        const data = pageDraft();
        document.querySelectorAll('[data-editable]').forEach((element) => {
            const key = element.dataset.editable;
            if (Object.prototype.hasOwnProperty.call(data, key)) element.innerHTML = data[key];
        });
        document.querySelectorAll('[data-editable-image]').forEach((element) => {
            const key = element.dataset.editableImage;
            if (Object.prototype.hasOwnProperty.call(data, key)) applyImage(element, imageData(element));
        });
    }

    function setStatus(message) {
        const status = toolbar?.querySelector('[data-cms-status]');
        if (status) status.textContent = message;
    }

    function setEditing(next) {
        editing = next;
        document.body.classList.toggle('adp-local-cms-editing', editing);
        document.querySelectorAll('[data-editable]').forEach((element) => {
            element.contentEditable = editing ? 'true' : 'false';
            element.classList.toggle('adp-local-cms-editable', editing);
        });
        document.querySelectorAll('[data-editable-image]').forEach((element) => {
            element.classList.toggle('adp-local-cms-editable-image', editing);
        });
        toolbar?.classList.toggle('is-editing', editing);
        toolbar.querySelector('[data-cms-edit]').hidden = editing;
        toolbar.querySelector('[data-cms-save]').hidden = !editing;
        toolbar.querySelector('[data-cms-finish]').hidden = !editing;
        setStatus(editing ? 'Edycja aktywna' : 'Gotowe');
        document.dispatchEvent(new CustomEvent('adp:local-cms-editing', {
            detail: { editing },
        }));
    }

    function collectPage() {
        const fields = {};
        document.querySelectorAll('[data-editable]').forEach((element) => {
            fields[element.dataset.editable] = element.innerHTML.trim();
        });
        document.querySelectorAll('[data-editable-image]').forEach((element) => {
            const key = element.dataset.editableImage;
            fields[key] = imageData(element);
        });
        return fields;
    }

    async function savePage() {
        const fields = collectPage();
        updatePageDraft(fields);
        if (!page) {
            setStatus('Zapisane lokalnie');
            return;
        }
        setStatus('Zapisywanie...');
        try {
            const response = await cmsFetch('/api/content', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ page, fields }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Nie udalo sie zapisac zmian.');
            writeDraft({ ...readDraft(), [page]: data[page] || fields });
            setStatus('Zapisane online');
        } catch (error) {
            setStatus('Zapis lokalny. Online nie zapisano.');
            window.alert(error.message || 'Nie udalo sie zapisac zmian online.');
            throw error;
        }
    }

    async function downloadJson() {
        try {
            await savePage();
        } catch {
            // Export the local draft even when the online save is blocked.
        }
        const blob = new Blob([JSON.stringify(readDraft(), null, 2)], { type: 'application/json;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'site-content-draft.json';
        link.click();
        URL.revokeObjectURL(link.href);
        setStatus('JSON wyeksportowany');
    }

    function importJson(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            try {
                const imported = JSON.parse(String(reader.result || '{}'));
                writeDraft({ ...readDraft(), ...imported });
                applyDraft();
                setStatus('JSON zaimportowany');
            } catch {
                window.alert('Nie udalo sie wczytac JSON.');
            }
        });
        reader.readAsText(file, 'utf-8');
    }

    async function uploadImageFile(file, key) {
        const previewUrl = URL.createObjectURL(file);
        try {
            const uploadFile = await prepareImageForUpload(file);
            const response = await cmsFetch('/__cms/images', {
                method: 'POST',
                headers: {
                    'Content-Type': uploadFile.type || file.type || 'application/octet-stream',
                    'X-CMS-Page': page,
                    'X-CMS-Key': key,
                    'X-File-Name': encodeURIComponent(uploadFile.name || file.name || 'cms-image'),
                },
                body: uploadFile,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.src) throw new Error(data.error || 'Upload endpoint unavailable');
            URL.revokeObjectURL(previewUrl);
            return { src: data.src };
        } catch (error) {
            if (/Firebase|autoryzacji|zalogowac|auth helper/i.test(error.message || '')) {
                window.alert(error.message);
                throw error;
            }
            return { src: previewUrl, localOnly: true };
        }
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
                    const cleanName = (file.name || 'cms-image').replace(/\.[^.]+$/, '');
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
                <label>Gespeicherter Pfad<input data-image-src readonly></label>
                <label>Alt Text<input data-image-alt></label>
                <label>Image Title<input data-image-title></label>
                <p class="adp-local-image-panel__status" data-image-status></p>
                <div class="adp-local-image-panel__actions">
                    <button type="button" data-image-apply>Speichern</button>
                </div>
            </div>`;
        document.body.appendChild(imagePanel);
        imagePanel.addEventListener('click', (event) => {
            if (event.target === imagePanel || event.target.closest('[data-image-close]')) {
                imagePanel.classList.remove('is-open');
            }
        });
        return imagePanel;
    }

    function openImageEditor(element) {
        const panel = ensureImagePanel();
        const data = imageData(element);
        let selectedFile = null;
        let selectedPreviewUrl = '';
        const preview = panel.querySelector('[data-image-preview]');
        const fileInput = panel.querySelector('[data-image-file]');
        const status = panel.querySelector('[data-image-status]');
        panel.querySelector('[data-image-src]').value = data.src || '';
        panel.querySelector('[data-image-alt]').value = data.alt || '';
        panel.querySelector('[data-image-title]').value = data.title || '';
        preview.src = publicUrl(data.src);
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
            status.textContent = selectedFile ? 'Kopiowanie obrazu...' : 'Zapisywanie...';
            let src = panel.querySelector('[data-image-src]').value.trim();
            if (selectedFile) {
                const result = await uploadImageFile(selectedFile, element.dataset.editableImage);
                src = result.src;
                panel.querySelector('[data-image-src]').value = src;
                if (result.localOnly) {
                    status.textContent = 'Podglad lokalny. Uruchom helper CMS, aby skopiowac plik.';
                }
            }
            const next = {
                src,
                alt: panel.querySelector('[data-image-alt]').value.trim(),
                title: panel.querySelector('[data-image-title]').value.trim(),
            };
            applyImage(element, next);
            updatePageDraft({ [element.dataset.editableImage]: next });
            if (!src.startsWith('blob:')) panel.classList.remove('is-open');
            setStatus('Zdjecie zapisane lokalnie');
        };
        panel.classList.add('is-open');
    }

    function ensureToolbar() {
        if (toolbar) return toolbar;
        document.querySelector('.adp-local-cms-launcher')?.remove();
        toolbar = document.createElement('div');
        toolbar.className = 'adp-local-cms-toolbar';
        toolbar.innerHTML = `
            <span data-cms-status>CMS lokalny</span>
            <button type="button" data-cms-edit>Edytuj</button>
            <button type="button" data-cms-save hidden>Zapisz</button>
            <button type="button" data-cms-finish hidden>Podglad</button>
            <button type="button" data-cms-export>Export JSON</button>
            <label class="adp-local-cms-import">Import JSON<input type="file" accept="application/json" hidden data-cms-import></label>
            <button type="button" data-cms-close>Zamknij</button>
        `;
        document.body.appendChild(toolbar);
        toolbar.querySelector('[data-cms-edit]').addEventListener('click', () => setEditing(true));
        toolbar.querySelector('[data-cms-save]').addEventListener('click', () => {
            savePage().catch(() => {});
        });
        toolbar.querySelector('[data-cms-finish]').addEventListener('click', () => setEditing(false));
        toolbar.querySelector('[data-cms-export]').addEventListener('click', downloadJson);
        toolbar.querySelector('[data-cms-import]').addEventListener('change', (event) => {
            importJson(event.target.files?.[0]);
            event.target.value = '';
        });
        toolbar.querySelector('[data-cms-close]').addEventListener('click', () => {
            setEditing(false);
            toolbar.remove();
            toolbar = null;
            window.localStorage.removeItem('adpLocalCmsVisible');
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
        window.localStorage.setItem('adpLocalCmsVisible', '1');
        ensureToolbar();
        setEditing(false);
    }

    document.addEventListener('click', (event) => {
        if (!editing) return;
        const image = event.target.closest('[data-editable-image]');
        if (!image) return;
        event.preventDefault();
        event.stopPropagation();
        openImageEditor(image);
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'e') {
            showCms();
        }
        if (editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            savePage().catch(() => {});
        }
    });

    document.addEventListener('adp:static-content-loaded', applyDraft);

    applyDraft();
    if (new URLSearchParams(window.location.search).has('edit') || window.localStorage.getItem('adpLocalCmsVisible') === '1') {
        showCms();
    } else {
        ensureLauncher();
    }
}());
