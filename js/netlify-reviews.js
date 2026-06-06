(function () {
    const root = document.querySelector('[data-reviews-root]');
    if (!root) return;

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
                    <div style="font-weight:800;color:#3b2e27;font-size:14px;">${escapeHtml(review.author)}</div>
                    <div style="color:#6b4c35;font-size:12px;letter-spacing:0.06em;white-space:nowrap;">${stars(review.rating)}</div>
                </div>
                ${review.translated ? '<div style="color:#8a7464;font-size:12px;margin:-4px 0 10px;">(übersetzt aus dem Polnischen)</div>' : ''}
                <p style="margin:0;color:#5a4a40;line-height:1.75;font-size:13px;">„${escapeHtml(review.text)}“</p>
            </div>`;
    }

    function render(reviews) {
        root.innerHTML = `
<div style="background:#f5efe7;padding:32px 0;">
    <div style="max-width:860px;margin:0 auto;background:#fdfaf6;border-radius:18px;padding:34px 26px 38px;box-shadow:0 10px 28px rgba(0,0,0,.05);">
        <h2 style="margin:0 0 8px;font-size:28px;line-height:1.25;text-align:center;color:#3b2e27;font-family:Georgia,'Times New Roman',serif;">Kundenstimmen</h2>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.6;text-align:center;color:#8a7464;">Google Bewertungen – echte Worte von echten Familien</p>
        <p style="margin:0 0 18px;font-size:13px;line-height:1.7;text-align:center;color:#a3907f;">Neugeborenenfotografie, Babybauch &amp; Familienfotografie rund um Karlsruhe, Pfinztal, Durlach und Weingarten.</p>
        <hr style="border:none;border-top:1px solid #e5d8cc;margin:0 0 18px;" />
        <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;">${reviews.map(renderCard).join('')}</div>
        <div style="display:flex;justify-content:center;margin:18px 0 0;">
            <a href="pages/kontakt.html#booking" style="display:inline-block;text-decoration:none;background:#6b4c35;color:#fff;font-weight:700;padding:12px 18px;border-radius:999px;font-size:13px;">Termin anfragen</a>
        </div>
        <p style="margin:10px 0 0;text-align:center;font-size:12px;color:#8a7464;line-height:1.6;">Hinweis: Einige Lifestyle-Reportagen dürfen aus Datenschutzgründen nicht gezeigt werden – umso mehr zählen hier die Worte meiner Kundinnen &amp; Kunden.</p>
    </div>
</div>`;
    }

    async function init() {
        try {
            const response = await fetch('/content/reviews.json', {
                headers: { Accept: 'application/json' },
                cache: 'no-cache',
            });
            if (!response.ok) return;
            const reviews = await response.json();
            render(Array.isArray(reviews) ? reviews : []);
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
