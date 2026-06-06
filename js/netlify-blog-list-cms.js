(function () {
    if (!/\/pages\/blog\.html$/i.test(location.pathname) && !/\/blog\/?$/i.test(location.pathname)) return;

    let toolbar = null;

    function slugify(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
    }

    async function createPost() {
        const title = window.prompt('Tytul nowego bloga:');
        if (!title) return;
        const category = window.prompt('Kategoria, np. newborn, babybauch, familie:', 'newborn') || 'blog';
        const metaDescription = window.prompt('Krotki opis pod SEO / podtytul:', 'Nowy Blogbeitrag von Anna Duleba Photography.') || '';
        const response = await fetch('/__cms/blog-posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title.trim(),
                slug: slugify(title),
                category: category.trim(),
                metaDescription: metaDescription.trim(),
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.post) {
            window.alert(data.error || 'Nie udalo sie utworzyc bloga.');
            return;
        }
        window.location.href = `blog-${data.post.slug}.html?edit=1`;
    }

    function ensureToolbar() {
        if (toolbar) return toolbar;
        document.querySelector('.adp-local-cms-launcher')?.remove();
        toolbar = document.createElement('div');
        toolbar.className = 'adp-local-cms-toolbar adp-blog-list-cms-toolbar';
        toolbar.innerHTML = `
            <span>Blog CMS</span>
            <button type="button" data-create-blog>+ Neuer Blogbeitrag</button>
            <button type="button" data-close-blog-cms>Zamknij</button>`;
        document.body.appendChild(toolbar);
        toolbar.querySelector('[data-create-blog]').addEventListener('click', createPost);
        toolbar.querySelector('[data-close-blog-cms]').addEventListener('click', () => {
            toolbar.remove();
            toolbar = null;
            window.localStorage.removeItem('adpBlogListCmsVisible');
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
        button.addEventListener('click', () => {
            window.localStorage.setItem('adpBlogListCmsVisible', '1');
            ensureToolbar();
        });
        document.body.appendChild(button);
    }

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'e') ensureToolbar();
    });

    if (new URLSearchParams(window.location.search).has('edit') || window.localStorage.getItem('adpBlogListCmsVisible') === '1') {
        ensureToolbar();
    } else {
        ensureLauncher();
    }
}());
