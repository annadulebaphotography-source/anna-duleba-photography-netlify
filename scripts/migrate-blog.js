const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(ROOT, 'pages');
const OUTPUT = path.join(ROOT, 'content', 'blog-posts.json');

function text(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag, name) {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag || '');
  return match ? match[1] : '';
}

function first(pattern, html) {
  const match = pattern.exec(html);
  return match ? match[1].trim() : '';
}

function stripBrand(title) {
  return title.replace(/\s*\|\s*Anna Duleba Photography\s*$/i, '').trim();
}

function filenameSlug(file) {
  return file.replace(/^blog-/, '').replace(/\.html$/, '').toLowerCase();
}

function categoryFrom(file, html) {
  const label = text(first(/<p[^>]*class=["'][^"']*(?:section-label|section-eyebrow|eyebrow)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i, html));
  const value = `${file} ${label}`.toLowerCase();
  if (value.includes('babybauch')) return 'babybauch';
  if (value.includes('saison')) return 'saisonal';
  if (value.includes('fine art')) return 'fine-art';
  if (value.includes('familie')) return 'familie';
  return 'newborn';
}

function publicPath(src) {
  return String(src || '')
    .replace(/^https?:\/\/www\.annadulebaphotography\.de\//i, '')
    .replace(/^https?:\/\/annadulebaphotography\.de\//i, '')
    .replace(/^\.\.\//, '')
    .replace(/^\/+/, '');
}

function imageFromMeta(html) {
  return publicPath(first(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i, html));
}

function articleArea(html) {
  const card = first(/<div[^>]*class=["'][^"']*content-card[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/section>/i, html);
  if (card) return card;
  return first(/<main[^>]*>([\s\S]*?)<\/main>/i, html) || html;
}

function blocksFrom(html) {
  const area = articleArea(html)
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const blocks = [];
  const re = /<(h2|h3|p|ul|ol|img|a)\b([^>]*)>([\s\S]*?)<\/\1>|<img\b([^>]*)>/gi;
  let match;
  let seenHero = false;

  while ((match = re.exec(area))) {
    const tag = (match[1] || 'img').toLowerCase();
    const attrs = match[2] || match[4] || '';
    const inner = match[3] || '';

    if (tag === 'p' && /class=["'][^"']*(?:section-label|section-eyebrow|subtitle|intro-text)[^"']*["']/i.test(attrs)) continue;
    if (tag === 'a' && !/href=/i.test(attrs)) continue;

    if (tag === 'h2' || tag === 'h3') {
      const value = text(inner);
      if (value) blocks.push({ type: tag, text: value });
    } else if (tag === 'p') {
      const value = text(inner);
      if (value) blocks.push({ type: 'paragraph', text: value });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((item) => text(item[1])).filter(Boolean);
      if (items.length) blocks.push({ type: 'list', items });
    } else if (tag === 'img') {
      const src = publicPath(attr(`<img ${attrs}>`, 'src'));
      if (!src) continue;
      if (!seenHero) {
        seenHero = true;
        continue;
      }
      blocks.push({
        type: 'image',
        src,
        alt: attr(`<img ${attrs}>`, 'alt'),
        caption: '',
      });
    } else if (tag === 'a') {
      const href = attr(`<a ${attrs}>`, 'href');
      const label = text(inner);
      if (href && label && label.length < 120) blocks.push({ type: 'link', text: label, href });
    }
  }

  return blocks;
}

function migrateFile(file) {
  const html = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
  const seoTitle = first(/<title>([\s\S]*?)<\/title>/i, html);
  const metaDescription = first(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i, html)
    || first(/<meta\s+name=["']description["'][^>]*content=["']([^"']+)["']/i, html);
  const h1 = text(first(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html)) || stripBrand(seoTitle);
  const subtitle = text(first(/<p[^>]*class=["'][^"']*(?:subtitle|intro-text)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i, html));
  const firstImage = publicPath(first(/<img\b[^>]*src=["']([^"']+)["']/i, articleArea(html)));
  const heroImage = firstImage || imageFromMeta(html);
  const heroAlt = first(/<img\b[^>]*alt=["']([^"']+)["']/i, articleArea(html)) || h1;
  const slug = filenameSlug(file);
  const now = new Date().toISOString();
  const blocks = blocksFrom(html);
  if (subtitle && !blocks.some((block) => block.type === 'paragraph' && block.text === subtitle)) {
    blocks.unshift({ type: 'paragraph', text: subtitle });
  }

  return {
    id: crypto.createHash('sha1').update(file).digest('hex').slice(0, 12),
    status: 'published',
    title: h1,
    slug,
    category: categoryFrom(file, html),
    publishedAt: '2026-01-01',
    heroImage,
    heroAlt,
    cardImage: imageFromMeta(html) || heroImage,
    cardImageAlt: heroAlt,
    seoTitle: seoTitle || `${h1} | Anna Duleba Photography`,
    metaDescription: metaDescription || subtitle || h1,
    canonicalUrl: `https://www.annadulebaphotography.de/blog/${slug}`,
    sourceFile: `pages/${file}`,
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

const files = fs.readdirSync(PAGES_DIR)
  .filter((file) => /^blog-.*\.html$/i.test(file))
  .sort();

const posts = files.map(migrateFile);
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(posts, null, 2) + '\n', 'utf8');

console.log(`Migrated ${posts.length} blog files to ${path.relative(ROOT, OUTPUT)}`);
posts.forEach((post) => {
  console.log(`- ${post.slug}: ${post.title} (${post.blocks.length} blocks)`);
});
