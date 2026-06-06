const DEFAULT_OWNER = 'annadulebaphotography-source';
const DEFAULT_REPO = 'anna-duleba-photography-netlify';
const DEFAULT_BRANCH = 'main';

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
    if (method === 'POST' && path === '/reviews') return createReview(event, config);

    return response(405, { error: `Unsupported CMS route: ${method} ${path}` });
  } catch (error) {
    return response(error.statusCode || 500, { error: error.message || 'CMS function failed' });
  }
};
