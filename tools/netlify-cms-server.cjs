const http = require('http');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'netlify-site');
const port = Number(process.env.PORT || process.argv[2] || 4188);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function safePart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
}

function extensionFrom(fileName, contentType) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  return '.jpg';
}

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('File is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleImageUpload(req, res) {
  try {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.startsWith('image/')) {
      sendJson(res, 400, { error: 'Only image files are allowed' });
      return;
    }

    const page = safePart(req.headers['x-cms-page'] || 'page');
    const key = safePart(req.headers['x-cms-key'] || 'image');
    const originalName = decodeURIComponent(String(req.headers['x-file-name'] || 'image'));
    const ext = extensionFrom(originalName, contentType);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const fileName = `${page}-${key}-${stamp}${ext}`;
    const relative = `assets/images/content/cms/${fileName}`;
    const sourceTarget = path.join(projectRoot, relative);
    const publicTarget = path.join(publicRoot, relative);
    const body = await readBody(req);

    fs.mkdirSync(path.dirname(sourceTarget), { recursive: true });
    fs.mkdirSync(path.dirname(publicTarget), { recursive: true });
    fs.writeFileSync(sourceTarget, body);
    fs.writeFileSync(publicTarget, body);

    sendJson(res, 200, { src: relative });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Upload failed' });
  }
}

async function handleGalleryImageUpload(req, res) {
  try {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.startsWith('image/')) {
      sendJson(res, 400, { error: 'Only image files are allowed' });
      return;
    }

    const galleryId = safePart(req.headers['x-gallery-id'] || 'gallery');
    const originalName = decodeURIComponent(String(req.headers['x-file-name'] || 'image'));
    const ext = extensionFrom(originalName, contentType);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const baseName = safePart(path.basename(originalName, path.extname(originalName)));
    const fileName = `${galleryId}-${baseName}-${stamp}${ext}`;
    const relative = `assets/images/galerie/${galleryId}/${fileName}`;
    const sourceTarget = path.join(projectRoot, relative);
    const publicTarget = path.join(publicRoot, relative);
    const body = await readBody(req);

    fs.mkdirSync(path.dirname(sourceTarget), { recursive: true });
    fs.mkdirSync(path.dirname(publicTarget), { recursive: true });
    fs.writeFileSync(sourceTarget, body);
    fs.writeFileSync(publicTarget, body);

    sendJson(res, 200, { src: relative });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Upload failed' });
  }
}

async function handleGalleryJsonSave(req, res, galleryId) {
  try {
    const safeId = safePart(galleryId);
    if (!safeId) {
      sendJson(res, 400, { error: 'Gallery ID is required' });
      return;
    }
    const body = await readBody(req, 5 * 1024 * 1024);
    const json = JSON.parse(body.toString('utf8'));
    const formatted = `${JSON.stringify(json, null, 2)}\n`;
    const sourceTarget = path.join(projectRoot, 'content', 'galleries', `${safeId}.json`);
    const publicTarget = path.join(publicRoot, 'content', 'galleries', `${safeId}.json`);

    fs.writeFileSync(sourceTarget, formatted, 'utf8');
    fs.writeFileSync(publicTarget, formatted, 'utf8');
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Gallery save failed' });
  }
}

function blogPostsPath(base = projectRoot) {
  return path.join(base, 'content', 'blog-posts.json');
}

function publicAssetUrl(value) {
  const pathValue = String(value || '').trim();
  if (!pathValue) return '';
  if (/^(https?:|data:|\/)/i.test(pathValue)) return pathValue;
  return `/${pathValue.replace(/^\/+/, '')}`;
}

function readBlogPosts(base = projectRoot) {
  const data = readJson(blogPostsPath(base), []);
  return Array.isArray(data) ? data : [];
}

function normalizeBlogBlock(block) {
  const type = String(block.type || '').trim();
  const id = String(block.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  if (type === 'h2' || type === 'h3' || type === 'paragraph') {
    return { id, type, text: String(block.text || '').trim() };
  }
  if (type === 'list') {
    const items = Array.isArray(block.items) ? block.items : String(block.text || '').split('\n');
    return { id, type, items: items.map((item) => String(item || '').trim()).filter(Boolean) };
  }
  if (type === 'link') {
    return { id, type, text: String(block.text || '').trim(), href: String(block.href || '').trim() };
  }
  if (type === 'image') {
    return {
      id,
      type,
      src: String(block.src || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, ''),
      alt: String(block.alt || '').trim(),
      caption: String(block.caption || '').trim(),
    };
  }
  return { id, type: 'paragraph', text: String(block.text || '').trim() };
}

function normalizeBlogPost(body, existing) {
  const title = String(body.title || existing?.title || '').trim();
  if (!title) throw new Error('Blog post title is required');
  const slug = String(body.slug || existing?.slug || '').trim();
  const now = new Date().toISOString();
  return {
    ...existing,
    id: existing?.id || String(body.id || ''),
    status: body.status === 'draft' ? 'draft' : 'published',
    title,
    slug,
    category: String(body.category || existing?.category || 'blog').trim(),
    publishedAt: String(body.publishedAt || existing?.publishedAt || '').trim(),
    heroImage: String(body.heroImage || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, ''),
    heroAlt: String(body.heroAlt || '').trim(),
    cardImage: String(body.cardImage || body.heroImage || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, ''),
    cardImageAlt: String(body.cardImageAlt || body.heroAlt || '').trim(),
    seoTitle: String(body.seoTitle || title).trim(),
    metaDescription: String(body.metaDescription || '').trim(),
    canonicalUrl: String(body.canonicalUrl || existing?.canonicalUrl || `https://www.annadulebaphotography.de/blog/${slug}`).trim(),
    sourceFile: existing?.sourceFile || body.sourceFile || '',
    blocks: Array.isArray(body.blocks) ? body.blocks.map(normalizeBlogBlock) : [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function writeBlogPostsBoth(posts) {
  writeJson(blogPostsPath(projectRoot), posts);
  writeJson(blogPostsPath(publicRoot), posts);
}

async function handleBlogPostSave(req, res, postId) {
  try {
    const body = JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString('utf8'));
    const posts = readBlogPosts(projectRoot);
    const index = posts.findIndex((item) => item.id === postId);
    if (index === -1) {
      sendJson(res, 404, { error: 'Blog post not found' });
      return;
    }
    const next = normalizeBlogPost(body, posts[index]);
    posts[index] = next;
    writeBlogPostsBoth(posts);
    sendJson(res, 200, { ok: true, post: next });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Blog save failed' });
  }
}

async function handleBlogImageUpload(req, res) {
  try {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.startsWith('image/')) {
      sendJson(res, 400, { error: 'Only image files are allowed' });
      return;
    }
    const postId = String(req.headers['x-blog-post'] || '');
    const target = String(req.headers['x-blog-target'] || '');
    const blockId = String(req.headers['x-blog-block'] || '');
    const originalName = decodeURIComponent(String(req.headers['x-file-name'] || 'blog-image'));
    const ext = extensionFrom(originalName, contentType);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const baseName = safePart(path.basename(originalName, path.extname(originalName)));
    const fileName = `${baseName}-${stamp}${ext}`;
    const relative = `assets/images/blog/${fileName}`;
    const body = await readBody(req);

    for (const base of [projectRoot, publicRoot]) {
      const targetPath = path.join(base, relative);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, body);
    }

    const posts = readBlogPosts(projectRoot);
    const index = posts.findIndex((item) => item.id === postId);
    if (index !== -1) {
      const post = { ...posts[index] };
      if (target === 'heroImage') {
        post.heroImage = relative;
        if (!post.cardImage || post.cardImage === posts[index].heroImage) post.cardImage = relative;
      } else if (target === 'cardImage') {
        post.cardImage = relative;
      } else if (target === 'blockImage' && blockId) {
        post.blocks = (post.blocks || []).map((block) => block.id === blockId ? { ...block, src: relative } : block);
      }
      post.updatedAt = new Date().toISOString();
      posts[index] = post;
      writeBlogPostsBoth(posts);
    }

    sendJson(res, 200, { src: relative, url: publicAssetUrl(relative) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Blog image upload failed' });
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let file = path.normalize(path.join(publicRoot, urlPath));
  if (!file.startsWith(publicRoot)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.split('?')[0] === '/__cms/images') {
    handleImageUpload(req, res);
    return;
  }
  if (req.method === 'POST' && req.url.split('?')[0] === '/__cms/gallery-images') {
    handleGalleryImageUpload(req, res);
    return;
  }
  const gallerySaveMatch = req.url.split('?')[0].match(/^\/__cms\/galleries\/([^/]+)$/);
  if (req.method === 'PUT' && gallerySaveMatch) {
    handleGalleryJsonSave(req, res, gallerySaveMatch[1]);
    return;
  }
  const blogPostSaveMatch = req.url.split('?')[0].match(/^\/__cms\/blog-posts\/([^/]+)$/);
  if (req.method === 'PUT' && blogPostSaveMatch) {
    handleBlogPostSave(req, res, decodeURIComponent(blogPostSaveMatch[1]));
    return;
  }
  if (req.method === 'POST' && req.url.split('?')[0] === '/__cms/blog-images') {
    handleBlogImageUpload(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('method not allowed');
    return;
  }
  serveStatic(req, res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Netlify CMS preview: http://127.0.0.1:${port}/index.html?edit=1`);
});
