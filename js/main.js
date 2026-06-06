document.addEventListener('DOMContentLoaded', function () {
    let lastSlot = null;

    const slots = document.querySelectorAll('[data-image-slot]');

    if (slots.length) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.className = 'jimdo-image-input';
        document.body.appendChild(fileInput);

        slots.forEach(function (slot) {
            slot.addEventListener('click', function (event) {
                if (slot.dataset.editableImage || document.body.classList.contains('adp-edit-mode-active')) {
                    return;
                }
                event.preventDefault();
                lastSlot = slot;
                fileInput.value = null;
                fileInput.click();
            });
        });

        fileInput.addEventListener('change', function (event) {
            const file = event.target.files && event.target.files[0];
            if (!file || !lastSlot) return;

            const reader = new FileReader();

            reader.addEventListener('load', function () {
                const imageSrc = reader.result;

                if (lastSlot.tagName.toLowerCase() === 'img') {
                    lastSlot.src = imageSrc;
                } else {
                    lastSlot.style.backgroundImage = "url('" + imageSrc + "')";
                    lastSlot.classList.add('has-image');
                }
            });

            reader.readAsDataURL(file);
        });
    }

    document.querySelectorAll('[data-gallery-scroll]').forEach(function (link) {
        link.addEventListener('click', function (event) {
            const gallery = document.getElementById('galerie');
            if (!gallery) return;
            event.preventDefault();
            gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', '#galerie');
            }
        });
    });

    document.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function (event) {
            const href = link.getAttribute('href');
            const target = link.getAttribute('target');

            if (
                !href ||
                href.startsWith('#') ||
                href.startsWith('mailto:') ||
                href.startsWith('tel:') ||
                target === '_blank' ||
                link.hasAttribute('download')
            ) {
                return;
            }

            event.preventDefault();
            document.body.classList.add('fade-out');

            setTimeout(function () {
                window.location.href = link.href;
            }, 400);
        });
    });
});
