const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'netlify-site');

function rm(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function mkdir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFile(src, dest) {
  mkdir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, filter = () => true) {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const source = path.join(src, entry.name);
    const target = path.join(dest, entry.name);
    const relative = path.relative(root, source).replace(/\\/g, '/');
    if (!filter(relative, entry)) continue;
    if (entry.isDirectory()) copyDir(source, target, filter);
    else if (entry.isFile()) copyFile(source, target);
  }
}

function stripHeavyAdmin(html) {
  return html
    .replace(/\s*<link[^>]+href=["'][^"']*admin-edit\.css[^"']*["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<script[^>]+src=["'][^"']*admin-edit-mode\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi, '\n')
    .replace(/\s*<script[^>]+src=["'][^"']*inline-content-editor\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi, '\n')
    .replace(/\s*<script[^>]+src=["'][^"']*content-image-editor\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi, '\n')
    .replace(/\s*<script[^>]+src=["'][^"']*faq-renderer\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi, '\n')
    .replace(/\s*<script[^>]+src=["'][^"']*reviews-manager\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi, '\n')
    .replace(/\s*<script[^>]+src=["'][^"']*gallery-renderer\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi, '\n');
}

function hasContentHooks(html) {
  return /\sdata-editable=|\sdata-editable-image=/.test(html);
}

function hasGalleryPage(file, html) {
  return /class=["'][^"']*gallery-grid/.test(html) && (/-galerie\.html$/i.test(file) || /\sdata-gallery-cms=/.test(html));
}

function hasBlogArticlePage(file) {
  return /(^|[\\/])blog-[^\\/]+\.html$/i.test(file) && !/(^|[\\/])blog\.html$/i.test(file);
}

function appendScript(html, src) {
  if (html.includes(src)) return html;
  return html.replace(/<\/body>/i, `    <script src="${src}"></script>\n</body>`);
}

function appendStylesheet(html, href) {
  if (html.includes(href)) return html;
  return html.replace(/<\/head>/i, `    <link rel="stylesheet" href="${href}" />\n</head>`);
}

function prioritizeHeroImages(html) {
  return html.replace(/<img\b([^>]*\bclass=["'][^"']*\bhero-image\b[^"']*["'][^>]*)>/gi, (match, attrs) => {
    const selfClosing = /\/\s*$/.test(attrs);
    let next = attrs.replace(/\/\s*$/, '').trimEnd();
    if (!/\bloading=/i.test(next)) next += ' loading="eager"';
    if (!/\bfetchpriority=/i.test(next)) next += ' fetchpriority="high"';
    if (!/\bdecoding=/i.test(next)) next += ' decoding="async"';
    return `<img${next}${selfClosing ? ' /' : ''}>`;
  });
}

function transformHtmlFile(file) {
  const full = path.join(out, file);
  let html = fs.readFileSync(full, 'utf8');
  html = stripHeavyAdmin(html);
  html = prioritizeHeroImages(html);

  const inPages = file.replace(/\\/g, '/').startsWith('pages/');
  const prefix = inPages ? '../' : '';
  if (hasGalleryPage(file, html)) {
    html = appendStylesheet(html, `${prefix}css/netlify-local-cms.css?v=netlify-phase3`);
    html = appendScript(html, `${prefix}js/netlify-gallery-renderer.js?v=netlify-phase5`);
    html = appendScript(html, `${prefix}js/netlify-local-cms.js?v=netlify-phase3`);
  }
  if (hasBlogArticlePage(file)) {
    html = appendStylesheet(html, `${prefix}css/netlify-local-cms.css?v=netlify-blog-phase5`);
    html = appendScript(html, `${prefix}js/netlify-blog-cms.js?v=netlify-blog-phase5`);
  }
  if (html.includes('data-reviews-root')) html = appendScript(html, `${prefix}js/netlify-reviews.js?v=netlify-phase1`);
  if (hasContentHooks(html)) {
    if (!html.includes('netlify-local-cms.css')) {
      html = appendStylesheet(html, `${prefix}css/netlify-local-cms.css?v=netlify-phase2`);
    }
    html = appendScript(html, `${prefix}js/netlify-content-loader.js?v=netlify-phase1`);
    if (!html.includes('netlify-local-cms.js')) {
      html = appendScript(html, `${prefix}js/netlify-local-cms.js?v=netlify-phase2`);
    }
  }

  fs.writeFileSync(full, html, 'utf8');
}

function writeText(relative, value) {
  const target = path.join(out, relative);
  mkdir(path.dirname(target));
  fs.writeFileSync(target, value, 'utf8');
}

function rewriteBlogMirrorHtml(html, depthPrefix) {
  return html.replace(/\b(href|src)=["']([^"']+)["']/g, (match, attr, value) => {
    if (/^(https?:|mailto:|tel:|#|data:|javascript:)/i.test(value)) return match;
    const quote = match.includes('"') ? '"' : "'";
    const [pathPart, suffix = ''] = value.split(/(?=[?#])/);
    let next = value;

    if (/^\.\.\/(css|js|assets)\//i.test(pathPart)) {
      next = `${depthPrefix}${pathPart.replace(/^\.\.\//, '')}${suffix}`;
    } else if (/^[a-z0-9._-]+\.html$/i.test(pathPart)) {
      next = `${depthPrefix}pages/${pathPart}${suffix}`;
    } else if (/^\.\.\/index\.html$/i.test(pathPart)) {
      next = `${depthPrefix}index.html${suffix}`;
    } else if (/^\.\.\/pages\//i.test(pathPart)) {
      next = `${depthPrefix}${pathPart.replace(/^\.\.\//, '')}${suffix}`;
    }

    return `${attr}=${quote}${next}${quote}`;
  });
}

function mirrorBlogRoutes() {
  const blogIndex = path.join(out, 'pages', 'blog.html');
  if (fs.existsSync(blogIndex)) {
    const html = rewriteBlogMirrorHtml(fs.readFileSync(blogIndex, 'utf8'), '../');
    writeText(path.join('blog', 'index.html'), html);
  }

  const postsPath = path.join(root, 'content', 'blog-posts.json');
  if (!fs.existsSync(postsPath)) return;
  const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
  for (const post of posts) {
    if (!post?.slug) continue;
    const sourceName = `blog-${post.slug}.html`;
    const source = path.join(out, 'pages', sourceName);
    if (fs.existsSync(source)) {
      const html = rewriteBlogMirrorHtml(fs.readFileSync(source, 'utf8'), '../../');
      writeText(path.join('blog', post.slug, 'index.html'), html);
    }
  }
}

rm(out);
mkdir(out);

copyFile(path.join(root, 'index.html'), path.join(out, 'index.html'));
copyDir(path.join(root, 'assets'), path.join(out, 'assets'), (relative) => {
  if (relative.endsWith('.code-workspace')) return false;
  return ![
    'assets/images/preisliste.html',
    'assets/images/imgres.htm',
  ].includes(relative) && !relative.startsWith('assets/images/preisliste_files/');
});
copyDir(path.join(root, 'css'), path.join(out, 'css'), (relative) => !relative.endsWith('css/admin-edit.css'));
copyDir(path.join(root, 'js'), path.join(out, 'js'), (relative) => {
  return ![
    'js/admin-edit-mode.js',
    'js/inline-content-editor.js',
    'js/content-image-editor.js',
    'js/reviews-manager.js',
    'js/faq-renderer.js',
    'js/gallery-renderer.js',
  ].includes(relative);
});
copyDir(path.join(root, 'pages'), path.join(out, 'pages'), (relative, entry) => {
  if (entry.isDirectory()) return true;
  const name = path.basename(relative);
  return !name.startsWith('_preview-');
});

mkdir(path.join(out, 'content'));
copyFile(path.join(root, 'content', 'reviews.json'), path.join(out, 'content', 'reviews.json'));
copyFile(path.join(root, 'content', 'site-content.json'), path.join(out, 'content', 'site-content.json'));
copyFile(path.join(root, 'content', 'blog-posts.json'), path.join(out, 'content', 'blog-posts.json'));
copyDir(path.join(root, 'content', 'galleries'), path.join(out, 'content', 'galleries'));

for (const file of fs.readdirSync(path.join(out, 'pages'))) {
  if (file.endsWith('.html')) transformHtmlFile(path.join('pages', file));
}
transformHtmlFile('index.html');
mirrorBlogRoutes();

writeText('_headers', [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: SAMEORIGIN',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '',
].join('\n'));

console.log(`Built ${out}`);
