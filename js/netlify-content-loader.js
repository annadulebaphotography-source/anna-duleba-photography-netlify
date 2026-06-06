(function () {
    const page = document.body?.dataset.contentPage || '';
    if (!page) return;

    function publicUrl(value) {
        const path = String(value || '').trim();
        if (!path) return '';
        if (/^(https?:|data:|\/)/i.test(path)) return path;
        return `/${path.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '')}`;
    }

    function applyImage(element, value) {
        const data = typeof value === 'string' ? { src: value } : (value || {});
        const src = publicUrl(data.src);
        if (!src) return;

        if (element.tagName?.toLowerCase() === 'img') {
            element.src = src;
            if (Object.prototype.hasOwnProperty.call(data, 'alt')) element.alt = data.alt || '';
            if (data.title) element.title = data.title;
            else if (Object.prototype.hasOwnProperty.call(data, 'title')) element.removeAttribute('title');
        } else {
            element.style.backgroundImage = `url("${src}")`;
            element.classList.add('has-image');
            if (data.title) element.title = data.title;
        }

        if (element.parentElement?.tagName?.toLowerCase() === 'picture') {
            element.parentElement.querySelectorAll('source').forEach((source) => {
                source.srcset = src;
            });
        }
    }

    function applyContent(data) {
        const pageContent = data?.[page] || {};
        document.querySelectorAll('[data-editable]').forEach((element) => {
            const key = element.dataset.editable;
            if (Object.prototype.hasOwnProperty.call(pageContent, key)) {
                element.innerHTML = pageContent[key];
            }
        });
        document.querySelectorAll('[data-editable-image]').forEach((element) => {
            const key = element.dataset.editableImage;
            if (Object.prototype.hasOwnProperty.call(pageContent, key)) {
                applyImage(element, pageContent[key]);
            }
        });
    }

    async function init() {
        try {
            const response = await fetch('/content/site-content.json', {
                headers: { Accept: 'application/json' },
                cache: 'no-cache',
            });
            if (!response.ok) return;
            applyContent(await response.json());
            document.dispatchEvent(new CustomEvent('adp:static-content-loaded'));
        } catch {
            // Static HTML stays as the fallback.
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
