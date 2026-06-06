(function () {
    const state = {
        loggedIn: false,
        editMode: false,
        dirty: false,
        regions: {
            editableText: [],
            galleries: [],
            imageControls: [],
        },
    };

    const selectors = {
        editableText: '[data-adp-editable]',
        galleries: '[data-adp-gallery]',
        imageControls: '[data-adp-image-controls]',
    };

    let loginLink = null;
    let editButton = null;
    let toolbar = null;

    function emit(name, detail = {}) {
        document.dispatchEvent(new CustomEvent(`adp:${name}`, {
            detail: {
                ...detail,
                state: { ...state },
            },
        }));
    }

    function refreshRegions() {
        state.regions = {
            editableText: Array.from(document.querySelectorAll(selectors.editableText)),
            galleries: Array.from(document.querySelectorAll(selectors.galleries)),
            imageControls: Array.from(document.querySelectorAll(selectors.imageControls)),
        };
        emit('regions-ready', { regions: state.regions });
    }

    async function detectSession() {
        try {
            const response = await fetch('/api/session', {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) return false;
            const data = await response.json();
            return Boolean(data.loggedIn);
        } catch {
            return false;
        }
    }

    function createButton(label, modifier) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = modifier
            ? `adp-admin-toolbar__button ${modifier}`
            : 'adp-admin-toolbar__button';
        button.textContent = label;
        return button;
    }

    function createAdminLink() {
        const link = document.createElement('a');
        link.className = 'adp-admin-toolbar__button adp-admin-toolbar__link';
        link.href = '/admin';
        link.textContent = 'Panel admina';
        return link;
    }

    function buildEditButton() {
        editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'adp-edit-button';
        editButton.setAttribute('aria-label', 'Włącz tryb edycji');
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', enterEditMode);
        document.body.appendChild(editButton);
    }

    function buildLoginLink() {
        loginLink = document.createElement('a');
        loginLink.className = 'adp-admin-login';
        loginLink.href = '/admin/login';
        loginLink.setAttribute('aria-label', 'Przejdź do logowania admina');
        loginLink.textContent = 'Admin Login';
        document.body.appendChild(loginLink);
    }

    function buildToolbar() {
        toolbar = document.createElement('div');
        toolbar.className = 'adp-admin-toolbar';
        toolbar.setAttribute('aria-hidden', 'true');

        const status = document.createElement('div');
        status.className = 'adp-admin-toolbar__status';
        status.innerHTML = '<span class="adp-admin-toolbar__label">Admin</span><span class="adp-admin-toolbar__title">Tryb edycji strony</span>';

        const actions = document.createElement('div');
        actions.className = 'adp-admin-toolbar__actions';

        const save = createButton('Save', 'adp-admin-toolbar__button--primary');
        const cancel = createButton('Cancel');
        const preview = createButton('Preview');
        const adminPanel = createAdminLink();

        save.addEventListener('click', handleSave);
        cancel.addEventListener('click', handleCancel);
        preview.addEventListener('click', handlePreview);

        actions.append(save, cancel, preview, adminPanel);
        toolbar.append(status, actions);
        document.body.appendChild(toolbar);
    }

    function enterEditMode() {
        if (!state.loggedIn || state.editMode) return;
        state.editMode = true;
        document.body.classList.add('adp-edit-mode-active');
        toolbar.setAttribute('aria-hidden', 'false');
        refreshRegions();
        emit('edit-mode-enter');
    }

    function exitEditMode(reason) {
        if (!state.editMode) return;
        state.editMode = false;
        document.body.classList.remove('adp-edit-mode-active');
        toolbar.setAttribute('aria-hidden', 'true');
        emit('edit-mode-exit', { reason });
    }

    function handleSave() {
        emit('save-requested');
        state.dirty = false;
    }

    function handleCancel() {
        emit('cancel-requested');
        state.dirty = false;
        exitEditMode('cancel');
    }

    function handlePreview() {
        emit('preview-requested');
        exitEditMode('preview');
    }

    function markDirty() {
        if (!state.editMode) return;
        state.dirty = true;
        emit('dirty-change', { dirty: true });
    }

    function exposeApi() {
        window.adpEditMode = {
            getState: () => ({ ...state }),
            enter: enterEditMode,
            exit: exitEditMode,
            refreshRegions,
            markDirty,
            selectors: { ...selectors },
        };
    }

    async function init() {
        state.loggedIn = await detectSession();
        exposeApi();
        if (!state.loggedIn) {
            buildLoginLink();
            return;
        }
        buildEditButton();
        buildToolbar();
        refreshRegions();
        emit('admin-ready');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
