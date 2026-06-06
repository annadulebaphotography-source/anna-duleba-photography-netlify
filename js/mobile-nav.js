document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.main-header').forEach(function (header) {
        const toggle = header.querySelector('.mobile-menu-toggle');
        const nav = header.querySelector('.navbar');

        if (!toggle || !nav) return;

        const closeMenu = function () {
            header.classList.remove('mobile-nav-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Men&uuml; &ouml;ffnen');
        };

        toggle.addEventListener('click', function () {
            const isOpen = header.classList.toggle('mobile-nav-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
            toggle.setAttribute('aria-label', isOpen ? 'Men&uuml; schlie&szlig;en' : 'Men&uuml; &ouml;ffnen');
        });

        nav.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeMenu);
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeMenu();
        });
    });
});
