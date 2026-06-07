const crypto = require('crypto');

const DEFAULT_OWNER = 'annadulebaphotography-source';
const DEFAULT_REPO = 'anna-duleba-photography-netlify';
const DEFAULT_BRANCH = 'main';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let firebaseCertCache = { expiresAt: 0, certs: {} };

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function response(statusCode, data) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(data),
  };
}

function textBody(event) {
  if (!event.body) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

function binaryBody(event) {
  if (!event.body) return Buffer.alloc(0);
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'binary');
}

function routePath(event) {
  const raw = event.rawUrl ? new URL(event.rawUrl).pathname : event.path || '';
  return raw
    .replace(/^\/\.netlify\/functions\/cms\/?/, '/')
    .replace(/^\/__cms\/?/, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/';
}

function githubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
    owner: process.env.GITHUB_OWNER || DEFAULT_OWNER,
    repo: process.env.GITHUB_REPO || DEFAULT_REPO,
    branch: process.env.GITHUB_BRANCH || DEFAULT_BRANCH,
  };
}

function requireToken(config) {
  if (!config.token) {
    const error = new Error('Missing GITHUB_TOKEN in Netlify environment variables.');
    error.statusCode = 500;
    throw error;
  }
}

function cmsAccessToken() {
  return String(process.env.CMS_ACCESS_TOKEN || '').trim();
}

function firebaseConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  };
}

function publicFirebaseConfig() {
  const config = firebaseConfig();
  return {
    ok: Boolean(config.apiKey && config.authDomain && config.projectId && config.appId),
    config,
    adminEmails: adminEmails(),
  };
}

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(/[,\s;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function timingSafeMatch(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function base64UrlJson(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function base64UrlBuffer(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

async function firebaseCerts() {
  if (firebaseCertCache.expiresAt > Date.now() && Object.keys(firebaseCertCache.certs).length) {
    return firebaseCertCache.certs;
  }
  const res = await fetch(FIREBASE_CERTS_URL);
  const certs = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error('Firebase certificate fetch failed.');
    error.statusCode = 401;
    throw error;
  }
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300);
  firebaseCertCache = {
    expiresAt: Date.now() + Math.max(60, maxAge) * 1000,
    certs,
  };
  return certs;
}

async function verifyFirebaseToken(token) {
  const config = firebaseConfig();
  const allowedEmails = adminEmails();
  if (!config.projectId || !allowedEmails.length) {
    const error = new Error('Firebase CMS login is not configured. Set FIREBASE_PROJECT_ID and ADMIN_EMAILS in Netlify.');
    error.statusCode = 401;
    throw error;
  }

  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    const error = new Error('Invalid Firebase token.');
    error.statusCode = 401;
    throw error;
  }

  let header;
  let payload;
  try {
    header = base64UrlJson(parts[0]);
    payload = base64UrlJson(parts[1]);
  } catch {
    const error = new Error('Invalid Firebase token.');
    error.statusCode = 401;
    throw error;
  }
  const cert = (await firebaseCerts())[header.kid];
  if (!cert) {
    const error = new Error('Unknown Firebase token key.');
    error.statusCode = 401;
    throw error;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(cert, base64UrlBuffer(parts[2]))) {
    const error = new Error('Invalid Firebase token signature.');
    error.statusCode = 401;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${config.projectId}`;
  const email = String(payload.email || '').toLowerCase();
  if (
    payload.aud !== config.projectId ||
    payload.iss !== expectedIssuer ||
    !payload.sub ||
    Number(payload.exp || 0) <= now ||
    payload.email_verified === false ||
    !allowedEmails.includes(email)
  ) {
    const error = new Error('This Google account is not allowed to use the CMS.');
    error.statusCode = 401;
    throw error;
  }

  return { email, uid: payload.sub };
}

async function requireCmsAuthorization(event) {
  const expected = cmsAccessToken();
  const header = String(event.headers?.authorization || event.headers?.Authorization || '').trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  const actual = match ? String(match[1] || '').trim() : '';
  if (!actual) {
    const error = new Error('Unauthorized CMS request.');
    error.statusCode = 401;
    throw error;
  }
  if (expected && timingSafeMatch(actual, expected)) return { type: 'static-token' };
  return verifyFirebaseToken(actual);
}

function isWriteMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function safePart(value, fallback = 'file') {
  return String(value || fallback)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
}

function extensionFrom(fileName, contentType) {
  const ext = String(fileName || '').toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/);
  if (ext) return ext[1] === 'jpeg' ? '.jpg' : `.${ext[1]}`;
  if (String(contentType || '').includes('png')) return '.png';
  if (String(contentType || '').includes('webp')) return '.webp';
  if (String(contentType || '').includes('gif')) return '.gif';
  return '.jpg';
}

function normalizePath(filePath) {
  const clean = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..')) throw new Error('Invalid file path');
  return clean;
}

function githubUrl(config, filePath) {
  const encodedPath = normalizePath(filePath).split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}`;
}

async function githubFetch(config, filePath, options = {}) {
  requireToken(config);
  const url = `${githubUrl(config, filePath)}?ref=${encodeURIComponent(config.branch)}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || `GitHub request failed for ${filePath}`);
    error.statusCode = res.status;
    throw error;
  }
  return data;
}

async function readGithubFile(config, filePath, fallback) {
  try {
    const data = await githubFetch(config, filePath);
    if (!data.content) return fallback;
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.statusCode === 404) return fallback;
    throw error;
  }
}

async function getSha(config, filePath) {
  try {
    const data = await githubFetch(config, filePath);
    return data.sha || null;
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function deleteGithubFile(config, filePath, message) {
  requireToken(config);
  const sha = await getSha(config, filePath);
  if (!sha) return false;
  const res = await fetch(githubUrl(config, filePath), {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message,
      sha,
      branch: config.branch,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || `GitHub delete failed for ${filePath}`);
    error.statusCode = res.status;
    throw error;
  }
  return true;
}

async function writeGithubFile(config, filePath, contentBuffer, message) {
  requireToken(config);
  const sha = await getSha(config, filePath);
  const body = {
    message,
    content: Buffer.from(contentBuffer).toString('base64'),
    branch: config.branch,
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(githubUrl(config, filePath), {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || `GitHub write failed for ${filePath}`);
    error.statusCode = res.status;
    throw error;
  }
  return data;
}

async function writeJsonFile(config, filePath, data, message) {
  const formatted = `${JSON.stringify(data, null, 2)}\n`;
  await writeGithubFile(config, filePath, Buffer.from(formatted, 'utf8'), message);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function newBlogSourceHtml(post) {
  const title = escapeHtml(post.title);
  const description = escapeHtml(post.metaDescription || '');
  const image = escapeHtml(post.heroImage || 'assets/images/anna-duleba-fotografie-blog.jpg');
  return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} | Anna Duleba Photography</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="https://www.annadulebaphotography.de/blog/${escapeHtml(post.slug)}" />
    <link rel="icon" type="image/png" href="../assets/images/logo.png" />
    <link rel="stylesheet" href="../css/style.css" />
</head>
<body>
<header class="main-header">
<div class="container">
<nav class="navbar">
    <div class="nav-left">
        <a href="../index.html">Home</a>
        <a href="blog.html">Blog</a>
        <a href="newborn.html">Newborn</a>
        <a href="babybauch.html">Babybauch</a>
        <a href="studio.html">Studio</a>
    </div>
    <div class="nav-right">
        <a href="familie.html">Familie</a>
        <a href="frauenfotografie.html">Frauenfotografie</a>
        <a href="saisonale-angebote.html">Saisonale Angebote</a>
        <a href="digital-atelier.html">Digital Atelier</a>
        <a href="workshop.html">Workshop</a>
        <a href="preisliste.html">Preise</a>
        <a href="kontakt.html">Kontakt</a>
    </div>
</nav>
<button class="mobile-menu-toggle" type="button" aria-label="Menü öffnen" aria-expanded="false">
    <span></span><span></span><span></span>
</button>
</div>
</header>
<main id="main-content">
<section class="content-section">
<div class="content-wrapper">
<div class="content-frame">
<div class="content-card blog-article">
    <p class="section-label">${escapeHtml(post.category || 'Blog')}</p>
    <h1 class="main-title">${title}</h1>
    <p class="subtitle">${description}</p>
    <img class="blog-article-hero" src="../${image}" alt="${title}">
    <p>${escapeHtml(post.blocks?.[0]?.text || 'Neuer Blogbeitrag.')}</p>
</div>
</div>
</div>
</section>
</main>
<footer class="site-footer">
    <div class="site-footer-inner">
        <div class="site-footer-brand">
            <p class="site-footer-title">Anna Duleba Photography</p>
            <p>Fotografie für Neugeborene, Babybauch, Familie und Fine Art in Walzbachtal & Karlsruhe.</p>
        </div>
        <nav class="site-footer-links" aria-label="Footer Navigation">
            <a href="kontakt.html">Kontakt</a>
            <a href="impressum.html">Impressum</a>
            <a href="datenschutz.html">Datenschutz</a>
        </nav>
    </div>
</footer>
<script src="../js/mobile-nav.js"></script>
</body>
</html>
`;
}

function normalizeContentPage(page) {
  const value = String(page || '').replace(/\\/g, '/').trim();
  if (value === 'home' || value === 'blog' || /^pages\/[a-z0-9-]+\.html$/.test(value)) return value;
  throw new Error('Invalid content page');
}

function normalizeContentFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Invalid content fields');
  const normalized = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[a-z0-9.-]+$/i.test(key)) throw new Error('Invalid content key');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      normalized[key] = {
        src: String(value.src || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, ''),
        alt: String(value.alt || ''),
        title: String(value.title || ''),
      };
    } else {
      normalized[key] = String(value || '');
    }
  }
  return normalized;
}

async function saveContent(event, config) {
  const body = JSON.parse(textBody(event) || '{}');
  const page = normalizeContentPage(body.page);
  const fields = normalizeContentFields(body.fields);
  const content = await readGithubFile(config, 'content/site-content.json', {});
  content[page] = { ...(content[page] || {}), ...fields };
  await writeJsonFile(config, 'content/site-content.json', content, `CMS: update ${page}`);
  return response(200, content);
}

async function uploadContentImage(event, config) {
  const page = safePart(event.headers['x-cms-page'] || event.headers['X-CMS-Page'] || 'page');
  const key = safePart(event.headers['x-cms-key'] || event.headers['X-CMS-Key'] || 'image');
  const originalName = decodeURIComponent(String(event.headers['x-file-name'] || event.headers['X-File-Name'] || 'image'));
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || 'image/jpeg';
  const ext = extensionFrom(originalName, contentType);
  const relative = `assets/images/content/cms/${page}-${key}-${nowStamp()}${ext}`;
  await writeGithubFile(config, relative, binaryBody(event), `CMS: upload ${key}`);
  return response(200, { src: relative });
}

async function saveGallery(event, config, galleryId) {
  const id = safePart(galleryId, 'gallery');
  const body = JSON.parse(textBody(event) || '{}');
  await writeJsonFile(config, `content/galleries/${id}.json`, body, `CMS: update gallery ${id}`);
  return response(200, { ok: true });
}

async function uploadGalleryImage(event, config) {
  const galleryId = safePart(event.headers['x-gallery-id'] || event.headers['X-Gallery-Id'] || 'gallery');
  const originalName = decodeURIComponent(String(event.headers['x-file-name'] || event.headers['X-File-Name'] || 'image'));
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || 'image/jpeg';
  const baseName = safePart(originalName.replace(/\.[^.]+$/, ''), 'image');
  const ext = extensionFrom(originalName, contentType);
  const relative = `assets/images/galerie/${galleryId}/${galleryId}-${baseName}-${nowStamp()}${ext}`;
  await writeGithubFile(config, relative, binaryBody(event), `CMS: upload gallery image ${galleryId}`);
  return response(200, { src: relative });
}

async function saveBlogPost(event, config, postId) {
  const body = JSON.parse(textBody(event) || '{}');
  const posts = await readGithubFile(config, 'content/blog-posts.json', []);
  const index = posts.findIndex((item) => item.id === postId);
  if (index === -1) return response(404, { error: 'Blog post not found' });
  posts[index] = { ...posts[index], ...body, id: postId, updatedAt: new Date().toISOString() };
  await writeJsonFile(config, 'content/blog-posts.json', posts, `CMS: update blog ${posts[index].slug || postId}`);
  return response(200, { ok: true, post: posts[index] });
}

async function deleteBlogPost(event, config, postId) {
  const posts = await readGithubFile(config, 'content/blog-posts.json', []);
  const index = posts.findIndex((item) => item.id === postId);
  if (index === -1) return response(404, { error: 'Blog post not found' });
  const [removed] = posts.splice(index, 1);
  await writeJsonFile(config, 'content/blog-posts.json', posts, `CMS: delete blog ${removed.slug || postId}`);
  const sourceFile = String(removed.sourceFile || `pages/blog-${removed.slug}.html`);
  if (/^pages\/blog-[a-z0-9-]+\.html$/.test(sourceFile)) {
    await deleteGithubFile(config, sourceFile, `CMS: delete blog page ${removed.slug || postId}`);
  }
  return response(200, { ok: true, post: removed });
}

async function createBlogPost(event, config) {
  const body = JSON.parse(textBody(event) || '{}');
  const posts = await readGithubFile(config, 'content/blog-posts.json', []);
  const title = String(body.title || 'Neuer Blogbeitrag').trim();
  const baseSlug = safePart(body.slug || title, 'blogbeitrag');
  const used = new Set(posts.map((post) => post.slug));
  let slug = baseSlug;
  let count = 2;
  while (used.has(slug)) {
    slug = `${baseSlug}-${count}`;
    count += 1;
  }
  const post = {
    id: `${slug}-${Date.now().toString(36)}`,
    status: 'published',
    title,
    slug,
    category: String(body.category || 'blog'),
    publishedAt: String(body.publishedAt || new Date().toISOString().slice(0, 10)),
    heroImage: String(body.heroImage || 'assets/images/anna-duleba-fotografie-blog.jpg'),
    heroAlt: title,
    cardImage: String(body.cardImage || body.heroImage || 'assets/images/anna-duleba-fotografie-blog.jpg'),
    cardImageAlt: title,
    seoTitle: title,
    metaDescription: String(body.metaDescription || ''),
    canonicalUrl: `https://www.annadulebaphotography.de/blog/${slug}`,
    sourceFile: `pages/blog-${slug}.html`,
    blocks: [{ id: `block-${Date.now()}`, type: 'paragraph', text: String(body.intro || 'Neuer Blogbeitrag.') }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  posts.unshift(post);
  await writeGithubFile(
    config,
    post.sourceFile,
    Buffer.from(newBlogSourceHtml(post), 'utf8'),
    `CMS: create blog page ${slug}`
  );
  await writeJsonFile(config, 'content/blog-posts.json', posts, `CMS: create blog ${slug}`);
  return response(200, { ok: true, post });
}

async function uploadBlogImage(event, config) {
  const postId = String(event.headers['x-blog-post'] || event.headers['X-Blog-Post'] || '');
  const target = String(event.headers['x-blog-target'] || event.headers['X-Blog-Target'] || '');
  const blockId = String(event.headers['x-blog-block'] || event.headers['X-Blog-Block'] || '');
  const originalName = decodeURIComponent(String(event.headers['x-file-name'] || event.headers['X-File-Name'] || 'blog-image'));
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || 'image/jpeg';
  const baseName = safePart(originalName.replace(/\.[^.]+$/, ''), 'blog-image');
  const ext = extensionFrom(originalName, contentType);
  const relative = `assets/images/blog/${baseName}-${nowStamp()}${ext}`;
  await writeGithubFile(config, relative, binaryBody(event), `CMS: upload blog image`);

  const posts = await readGithubFile(config, 'content/blog-posts.json', []);
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
    await writeJsonFile(config, 'content/blog-posts.json', posts, `CMS: update blog image ${post.slug || postId}`);
  }
  return response(200, { src: relative, url: `/${relative}` });
}

async function createReview(event, config) {
  const body = JSON.parse(textBody(event) || '{}');
  const reviews = await readGithubFile(config, 'content/reviews.json', []);
  const author = String(body.author || 'Neue Meinung').trim();
  const text = String(body.text || '').trim();
  if (!text) return response(400, { error: 'Review text is required' });
  const review = {
    id: `${safePart(author, 'meinung')}-${Date.now().toString(36)}`,
    author,
    rating: Math.max(1, Math.min(5, Number(body.rating) || 5)),
    translated: Boolean(body.translated),
    text,
  };
  reviews.unshift(review);
  await writeJsonFile(config, 'content/reviews.json', reviews, `CMS: add review ${author}`);
  return response(200, { ok: true, review, reviews });
}

exports.handler = async (event) => {
  try {
    const config = githubConfig();
    const method = event.httpMethod || 'GET';
    const path = routePath(event);

    if (method === 'GET' && path === '/config') return response(200, publicFirebaseConfig());

    if (isWriteMethod(method)) await requireCmsAuthorization(event);

    if (method === 'GET' && path === '/api/content') {
      return response(200, await readGithubFile(config, 'content/site-content.json', {}));
    }
    if (method === 'POST' && path === '/api/content') return saveContent(event, config);
    if (method === 'POST' && (path === '/images' || path === '/api/content/images')) return uploadContentImage(event, config);
    if (method === 'POST' && path === '/gallery-images') return uploadGalleryImage(event, config);
    if (method === 'PUT' && /^\/galleries\/[^/]+$/.test(path)) return saveGallery(event, config, path.split('/').pop());
    if (method === 'POST' && path === '/blog-images') return uploadBlogImage(event, config);
    if (method === 'POST' && path === '/blog-posts') return createBlogPost(event, config);
    if (method === 'PUT' && /^\/blog-posts\/[^/]+$/.test(path)) return saveBlogPost(event, config, decodeURIComponent(path.split('/').pop()));
    if (method === 'DELETE' && /^\/blog-posts\/[^/]+$/.test(path)) return deleteBlogPost(event, config, decodeURIComponent(path.split('/').pop()));
    if (method === 'POST' && path === '/reviews') return createReview(event, config);

    return response(405, { error: `Unsupported CMS route: ${method} ${path}` });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || 'CMS function failed' });
  }
};
