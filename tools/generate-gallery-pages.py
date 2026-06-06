from pathlib import Path
import html
import json
import shutil
import sys
from datetime import datetime

PROJECT = Path(__file__).resolve().parents[1]
GALLERY_DIR = PROJECT / "content" / "galleries"


def load_gallery(gallery_id):
    path = GALLERY_DIR / f"{gallery_id}.json"
    if not path.exists():
        raise SystemExit(f"Gallery not found: {gallery_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def backup_public_page(slug):
    source = PROJECT / "pages" / f"{slug}.html"
    if not source.exists():
        return None
    target_dir = PROJECT / "backups" / "generated-pages"
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = target_dir / f"{stamp}-{slug}.html"
    shutil.copy2(source, target)
    return target


def image_markup(image):
    variant = image.get("variant", "normal")
    classes = "gallery-item" + (f" {variant}" if variant != "normal" else "")
    file_value = html.escape(image["file"])
    alt = html.escape(image.get("alt", ""))
    return f'''                    <a class="{classes}" href="../{file_value}">
                        <img src="../{file_value}" alt="{alt}" loading="lazy">
                    </a>'''


def placeholder_markup(number):
    return f'''                    <!-- FOTO {number:02d} -->
                    <div class="gallery-item gallery-placeholder">
                        <span>FOTO {number:02d}</span>
                    </div>'''


def render_items(data):
    visible = [img for img in data.get("images", []) if img.get("visible", True)]
    visible.sort(key=lambda item: item.get("order", 9999))
    if visible:
        return "\n\n".join(image_markup(image) for image in visible)
    count = data.get("settings", {}).get("placeholderCount", 12)
    return "\n\n".join(placeholder_markup(number) for number in range(1, count + 1))


def render_page(data):
    title = html.escape(data["title"])
    description = html.escape(data["seo"]["description"])
    seo_title = html.escape(data["seo"]["title"])
    canonical = html.escape(data["seo"]["canonical"])
    category = html.escape(data["category"])
    category_href = html.escape(data["categoryPage"])
    layout = html.escape(data.get("layout", "mosaic"))
    items = render_items(data)
    return f'''<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{seo_title}</title>
    <meta name="description" content="{description}" />
    <link rel="canonical" href="{canonical}" />
    <link rel="icon" type="image/png" href="../assets/images/logo.png" />
    <link rel="stylesheet" href="../css/style.css" />
</head>
<body>
    <div class="page-wrapper">
        <main id="main-content">
            <section class="content-section">
                <div class="content-wrapper">
                    <div class="content-frame">
                        <div class="content-card">
                            <nav class="gallery-breadcrumb" aria-label="Breadcrumb">
                                <a href="../index.html">Start</a> &gt;
                                <a href="{category_href}">{category}</a> &gt;
                                <span>{title}</span>
                            </nav>

                            <p class="section-label">{category}</p>
                            <h1 class="main-title">{title}</h1>
                            <p class="subtitle">{description}</p>

                            <div class="gallery-grid gallery-{layout}">
{items}
                            </div>

                            <div class="gallery-actions">
                                <a class="gallery-back-link" href="{category_href}">Zurueck zu {category}</a>
                                <a class="gallery-cta" href="kontakt.html#booking">Termin anfragen</a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    </div>
    <script src="../js/mobile-nav.js"></script>
</body>
</html>
'''


def generate(gallery_id, write_file=False):
    data = load_gallery(gallery_id)
    output = render_page(data)
    target = PROJECT / "pages" / f"{data['slug']}.html"
    if write_file:
        raise SystemExit(
            "Public gallery publishing is intentionally locked in Phase 1. "
            "Use preview output first; unlock publishing only after the production template is approved."
        )
    print(output)


def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/generate-gallery-pages.py <gallery-id> [--write]")
        return 1
    generate(sys.argv[1], "--write" in sys.argv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
