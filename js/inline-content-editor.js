(function () {
    const page = document.body?.dataset.contentPage || '';
    const editables = new Map();
    const modified = new Set();
    let content = {};

    function isEditModeActive() {
        return Boolean(window.adpEditMode?.getState?.().editMode);
    }

    function editableElements() {
        return Array.from(document.querySelectorAll('[data-editable]'));
    }

    function cmsFetch(url, options) {
        if (!window.adpCmsAuth?.fetch) throw new Error('CMS auth helper is not loaded');
        return window.adpCmsAuth.fetch(url, options);
    }

    function applySavedContent() {
        const pageContent = content[page] || {};
        editableElements().forEach((element) => {
            const key = element.dataset.editable;
            editables.set(key, element);
            if (Object.prototype.hasOwnProperty.call(pageContent, key)) {
                element.innerHTML = pageContent[key];
            }
        });
    }

    function registerEditables() {
        editableElements().forEach((element) => {
            editables.set(element.dataset.editable, element);
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
            applySavedContent();
        } catch {
            content = {};
        }
    }

    function setEditableState(active) {
        editableElements().forEach((element) => {
            element.setAttribute('contenteditable', 'false');
            element.classList.toggle('adp-inline-editable', active);
        });
    }

    function markModified(element) {
        const key = element.dataset.editable;
        if (!key) return;
        modified.add(key);
        element.classList.add('adp-inline-edited');
        window.adpEditMode?.markDirty?.();
    }

    function bindEditableEvents() {
        editableElements().forEach((element) => {
            element.addEventListener('click', (event) => {
                if (!isEditModeActive()) return;
                event.preventDefault();
                event.stopPropagation();
                element.setAttribute('contenteditable', 'true');
                element.focus();
            });
            element.addEventListener('blur', () => {
                element.setAttribute('contenteditable', 'false');
            });
            element.addEventListener('input', () => {
                if (!isEditModeActive()) return;
                markModified(element);
            });
            element.addEventListener('paste', () => {
                if (!isEditModeActive()) return;
                window.setTimeout(() => markModified(element), 0);
            });
        });
    }

    async function saveModifiedContent() {
        if (!page || !modified.size) return;
        const fields = {};
        modified.forEach((key) => {
            const element = editables.get(key);
            if (element) fields[key] = element.innerHTML.trim();
        });

        const response = await cmsFetch('/api/content', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ page, fields }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Content save failed');
        content = data;
        modified.clear();
        editableElements().forEach((element) => element.classList.remove('adp-inline-edited'));
        document.dispatchEvent(new CustomEvent('adp:content-saved', {
            detail: { page, fields },
        }));
    }

    function init() {
        if (!page || !editableElements().length) return;
        registerEditables();
        bindEditableEvents();
        loadContent();
        document.addEventListener('adp:edit-mode-enter', () => setEditableState(true));
        document.addEventListener('adp:edit-mode-exit', () => setEditableState(false));
        document.addEventListener('adp:save-requested', () => {
            saveModifiedContent().catch((error) => {
                window.alert(error.message || 'Content save failed');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
