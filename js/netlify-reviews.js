(function () {
    const root = document.querySelector('[data-reviews-root]');
    if (!root) return;

    let reviews = [];
    let formOpen = false;

    function isEditModeActive() {
        return new URLSearchParams(window.location.search).has('edit')
            || window.localStorage.getItem('adpReviewsCmsVisible') === '1';
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

    function stars(rating) {
        return '&#9733;'.repeat(Math.max(1, Math.min(5, Number(rating) || 5)));
    }

    function renderCard(review) {
        return `
            <div style="flex:1 1 360px;background:#ffffff;border:1px solid #efe2d5;border-radius:14px;padding:18px 18px 16px;">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px;">
                    <div style="font-weight:800;color:#3b2e27;font-size:14px;">
                        ${escapeHtml(review.author)}
                    </div>
                    <div style="color:#b97a3c;font-size:12px;letter-spacing:0.06em;white-space:nowrap;">
                        ${stars(review.rating)}
                    </div>
                </div>
                ${review.translated ? '<div style="color:#8a7464;font-size:12px;margin:-4px 0 10px;">(übersetzt aus dem Polnischen)</div>' : ''}
                <p style="margin:0;color:#5a4a40;line-height:1.75;font-size:13px;">
                    „${escapeHtml(review.text)}“
                </p>
            </div>`;
    }

    function renderForm() {
        if (!isEditModeActive() || !formOpen) return '';
        return `
            <form data-review-form style="margin:18px 0 0;background:#ffffff;border:1px solid #efe2d5;border-radius:14px;padding:18px;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
                    <label style="display:block;color:#5a4a40;font-size:13px;">
                        Autor
                        <input name="author" required style="display:block;width:100%;margin-top:6px;border:1px solid #efe2d5;border-radius:10px;padding:10px;font:inherit;">
                    </label>
                    <label style="display:block;color:#5a4a40;font-size:13px;">
                        Ocena (1-5)
                        <input name="rating" type="number" min="1" max="5" value="5" required style="display:block;width:100%;margin-top:6px;border:1px solid #efe2d5;border-radius:10px;padding:10px;font:inherit;">
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;color:#5a4a40;font-size:13px;margin-top:24px;">
                        <input name="translated" type="checkbox">
                        Übersetzt aus dem Polnischen
                    </label>
                </div>
                <label style="display:block;color:#5a4a40;font-size:13px;margin-top:12px;">
                    Treść opinii
                    <textarea name="text" required style="display:block;width:100%;min-height:120px;margin-top:6px;border:1px solid #efe2d5;border-radius:10px;padding:10px;font:inherit;line-height:1.55;"></textarea>
                </label>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
                    <button type="submit" style="border:none;background:#b97a3c;color:#fff;font-weight:700;padding:10px 16px;border-radius:999px;font-size:13px;cursor:pointer;">Speichern</button>
                    <button type="button" data-review-cancel style="border:1px solid #efe2d5;background:#fdfaf6;color:#5a4a40;padding:10px 16px;border-radius:999px;font-size:13px;cursor:pointer;">Abbrechen</button>
                </div>
            </form>`;
    }

    function render() {
        root.innerHTML = `
<div style="background:#f5efe7;padding:32px 0;">
    <div style="max-width:860px;margin:0 auto;background:#fdfaf6;border-radius:18px;padding:34px 26px 38px;box-shadow:0 10px 28px rgba(0,0,0,.05);">
        <h2 style="margin:0 0 8px;font-size:28px;line-height:1.25;text-align:center;color:#3b2e27;font-family:Georgia,'Times New Roman',serif;">
            Kundenstimmen
        </h2>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.6;text-align:center;color:#8a7464;">
            Google Bewertungen – echte Worte von echten Familien
        </p>
        <p style="margin:0 0 18px;font-size:13px;line-height:1.7;text-align:center;color:#a3907f;">
            Neugeborenenfotografie, Babybauch &amp; Familienfotografie rund um Karlsruhe, Pfinztal, Durlach und Weingarten.
        </p>
        <hr style="border:none;border-top:1px solid #e5d8cc;margin:0 0 18px;" />
        <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;">
            ${reviews.map(renderCard).join('')}
        </div>
        ${isEditModeActive() ? '<div style="display:flex;justify-content:center;margin:18px 0 0;"><button type="button" data-review-add style="display:inline-block;border:none;text-decoration:none;background:#3b2e27;color:#fff;font-weight:700;padding:12px 18px;border-radius:999px;font-size:13px;cursor:pointer;">Bewertung hinzufügen</button></div>' : ''}
        ${renderForm()}
        <div style="display:flex;justify-content:center;margin:18px 0 0;">
            <a href="pages/kontakt.html#booking" style="display:inline-block;text-decoration:none;background:#b97a3c;color:#fff;font-weight:700;padding:12px 18px;border-radius:999px;font-size:13px;">Termin anfragen</a>
        </div>
        <p style="margin:10px 0 0;text-align:center;font-size:12px;color:#8a7464;line-height:1.6;">
            Hinweis: Einige Lifestyle-Reportagen dürfen aus Datenschutzgründen nicht gezeigt werden – umso mehr zählen hier die Worte meiner Kundinnen &amp; Kunden.
        </p>
    </div>
</div>`;
        bindControls();
    }

    async function createReview(payload) {
        const response = await fetch('/__cms/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.review) {
            window.alert(data.error || 'Nie udalo sie dodac opinii.');
            return;
        }
        reviews = Array.isArray(data.reviews) ? data.reviews : [data.review, ...reviews];
        formOpen = false;
        render();
    }

    function bindControls() {
        root.querySelector('[data-review-add]')?.addEventListener('click', () => {
            formOpen = true;
            window.localStorage.setItem('adpReviewsCmsVisible', '1');
            render();
        });
        root.querySelector('[data-review-cancel]')?.addEventListener('click', () => {
            formOpen = false;
            render();
        });
        root.querySelector('[data-review-form]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            createReview({
                author: String(form.get('author') || '').trim(),
                rating: Number(form.get('rating')) || 5,
                translated: form.has('translated'),
                text: String(form.get('text') || '').trim(),
            });
        });
    }

    async function init() {
        try {
            const response = await fetch('/content/reviews.json', {
                headers: { Accept: 'application/json' },
                cache: 'no-cache',
            });
            if (!response.ok) return;
            const data = await response.json();
            reviews = Array.isArray(data) ? data : [];
            render();
        } catch {
            root.innerHTML = '';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
