const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { getAll, getWhere, findById, insert, update, remove, readDb } = require('./db/store');
const { requireAuth } = require('./middleware/auth');
const { trackVisit, updateSessionTime, getAnalyticsSummary, getRecentVisitors, getVisitorPages } = require('./db/analytics');

// Auto-seed on first run (e.g. Railway deploy)
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DB_FILE)) {
  console.log('No database found, seeding...');
  require('./db/seed');
}

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Only JPG, PNG, GIF, WEBP, SVG files are allowed'));
    }
    cb(null, true);
  }
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: No SESSION_SECRET env var. Using random secret (sessions won\'t persist across restarts).');
}

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: 'auto', maxAge: 24 * 60 * 60 * 1000 }
}));

// Security: CSRF protection
function generateCsrfToken() { return crypto.randomBytes(32).toString('hex'); }

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!req.session.csrfToken) req.session.csrfToken = generateCsrfToken();
    res.locals.csrfToken = req.session.csrfToken;
    return next();
  }
  if (!req.session || !req.session.csrfToken) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Session expired' });
    return res.redirect(req.originalUrl);
  }
  const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
  if (!token || token !== req.session.csrfToken) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Invalid CSRF token' });
    return res.redirect('back');
  }
  next();
}
app.use(csrfProtection);

// Security: Rate limiter
const loginAttempts = new Map();
function rateLimitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < windowMs);
  if (attempts.length >= maxAttempts) {
    return res.status(429).render('admin/login', { error: 'Too many attempts. Try again in 15 minutes.', csrfToken: req.session ? req.session.csrfToken : '' });
  }
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  next();
}

// Security: Input sanitization
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = Array.isArray(obj) ? [] : {};
  for (const [key, val] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    clean[key] = typeof val === 'object' && val !== null ? sanitizeInput(val) : val;
  }
  return clean;
}

// Security: Block common bot scanner paths
const BLOCKED_PATHS = /^\/(\.git|\.env|\.htaccess|\.htpasswd|\.svn|\.hg|wp-admin|wp-login|wp-json|xmlrpc\.php|credentials|debug|\.well-known|vendor\/|node_modules|composer\.json|package\.json|\.DS_Store)/i;
app.use((req, res, next) => {
  if (BLOCKED_PATHS.test(req.path) || BLOCKED_PATHS.test(decodeURIComponent(req.path))) {
    return res.status(404).end();
  }
  next();
});

// Security: Block suspicious User-Agents
const BLOCKED_UA = /sqlmap|nikto|nmap|masscan|zgrab|dirbuster|gobuster|wfuzz|ffuf|nuclei|httpx|censys|shodan|majestic|dotbot|semrush|ahrefsbot|mj12bot|petalbot|yandexbot|bingpreview/i;
app.use((req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (BLOCKED_UA.test(ua)) {
    return res.status(403).end();
  }
  next();
});

// Security: Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.removeHeader('X-Powered-By');
  next();
});

// Security: Global rate limiter (100 requests/min per IP)
const globalRateLimit = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxReqs = 100;
  const hits = (globalRateLimit.get(ip) || []).filter(t => now - t < windowMs);
  if (hits.length >= maxReqs) {
    return res.status(429).end();
  }
  hits.push(now);
  globalRateLimit.set(ip, hits);
  // Cleanup stale entries every 1000 requests
  if (hits.length === 1) {
    for (const [key, val] of globalRateLimit) {
      const fresh = val.filter(t => now - t < windowMs);
      if (fresh.length === 0) globalRateLimit.delete(key);
      else globalRateLimit.set(key, fresh);
    }
  }
  next();
});

// Security: Validate numeric ID
function isValidId(id) { return /^\d+$/.test(id); }

// Security: Path traversal prevention
function sanitizeFilename(filename) { return path.basename(filename); }

// Helper: get all settings as object
function getSettings() {
  const db = readDb();
  const settings = {};
  (db.settings || []).forEach(s => settings[s.key] = s.value);
  return settings;
}

// Analytics: track public page visits
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/admin') || req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  if (req.path.match(/\.\w+$/)) return next();
  try {
    const visitorId = trackVisit(req);
    req.visitorId = visitorId;
    res.locals.visitorId = visitorId;
  } catch (e) {
    console.error('Analytics error:', e.message);
  }
  next();
});

// Analytics: heartbeat
app.post('/api/analytics/heartbeat', express.json(), (req, res) => {
  const { visitorId, duration } = req.body;
  if (visitorId && duration) {
    try { updateSessionTime(visitorId, duration); } catch (e) {}
  }
  res.json({ ok: true });
});

// ========== PUBLIC ROUTES ==========

app.get('/', (req, res) => {
  const db = readDb();
  const settings = getSettings();
  const navigation = getAll('navigation').filter(n => n.is_active);
  const products = getAll('products').filter(p => p.is_active && p.category !== 'coffee');
  const shopProducts = getAll('products').filter(p => p.is_active && p.category === 'coffee');
  const subscriptions = getAll('subscriptions').filter(s => s.is_active);
  const events = getAll('events').filter(e => e.is_active);
  const trails = getAll('trails').filter(t => t.is_active);
  const partners = getAll('partners').filter(p => p.is_active);
  const programs = getAll('community_programs').filter(p => p.is_active);
  const outgrowers = getAll('outgrowers');
  const stats = getAll('stats');
  const footerLinks = getAll('footer_links');
  const gallery = getAll('gallery').filter(g => g.is_active);
  const heroImages = (settings.hero_images || '').split(',').map(s => s.trim()).filter(Boolean);

  const footerGrouped = {};
  footerLinks.forEach(l => {
    if (!footerGrouped[l.category]) footerGrouped[l.category] = [];
    footerGrouped[l.category].push(l);
  });

  const heroStats = stats.filter(s => ['Outgrower Farmers', 'Trail Levels', 'Ugandan Grown', 'Districts'].includes(s.label));
  const communityStats = stats.filter(s => ['Outgrower Farmers', 'Women Empowered', 'Youths Trained', 'Communities'].includes(s.label));

  res.render('index', {
    settings, navigation, products, shopProducts, subscriptions,
    events, trails, partners, programs, outgrowers, stats,
    heroStats, communityStats, footerGrouped, gallery, heroImages
  });
});

// ========== ADMIN ROUTES ==========

app.get('/admin/login', (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = generateCsrfToken();
  res.render('admin/login', { error: null, csrfToken: req.session.csrfToken });
});

app.post('/admin/login', rateLimitLogin, (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    if (!req.session.csrfToken) req.session.csrfToken = generateCsrfToken();
    return res.render('admin/login', { error: 'Invalid password', csrfToken: req.session.csrfToken });
  }
  const settings = getSettings();
  if (settings.admin_password_hash && bcrypt.compareSync(password, settings.admin_password_hash)) {
    req.session.isAdmin = true;
    req.session.csrfToken = generateCsrfToken();
    return res.redirect('/admin');
  }
  if (!req.session.csrfToken) req.session.csrfToken = generateCsrfToken();
  res.render('admin/login', { error: 'Invalid password', csrfToken: req.session.csrfToken });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

app.get('/admin', requireAuth, (req, res) => {
  const settings = getSettings();
  const counts = {
    products: getAll('products').length,
    subscriptions: getAll('subscriptions').length,
    events: getAll('events').length,
    trails: getAll('trails').length,
    partners: getAll('partners').length,
    programs: getAll('community_programs').length,
    outgrowers: getAll('outgrowers').length,
    gallery: getAll('gallery').length,
  };
  res.render('admin/dashboard', { settings, counts, csrfToken: req.session.csrfToken });
});

// ========== API: SETTINGS ==========
app.get('/api/settings', requireAuth, (req, res) => {
  const db = readDb();
  res.json(db.settings || []);
});

app.get('/api/settings/:category', requireAuth, (req, res) => {
  const db = readDb();
  res.json((db.settings || []).filter(s => s.category === req.params.category));
});

app.put('/api/settings', requireAuth, (req, res) => {
  const db = readDb();
  const items = Array.isArray(req.body) ? req.body : [];
  items.forEach(item => {
    const clean = sanitizeInput(item);
    if (!clean.key || typeof clean.key !== 'string') return;
    const idx = db.settings.findIndex(s => s.key === clean.key);
    if (idx >= 0) {
      db.settings[idx].value = clean.value;
      if (clean.category) db.settings[idx].category = clean.category;
    } else {
      db.settings.push(clean);
    }
  });
  fs.writeFileSync(path.join(__dirname, 'data', 'db.json'), JSON.stringify(db, null, 2));
  res.json({ success: true });
});

// ========== API: NAVIGATION ==========
app.get('/api/navigation', requireAuth, (req, res) => res.json(getAll('navigation')));
app.post('/api/navigation', requireAuth, (req, res) => res.json(insert('navigation', sanitizeInput(req.body))));
app.put('/api/navigation/:id', requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(update('navigation', req.params.id, sanitizeInput(req.body)));
});
app.delete('/api/navigation/:id', requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  res.json({ success: remove('navigation', req.params.id) });
});

// ========== API: GENERIC CRUD ==========
function createCrudRoutes(collectionName) {
  app.get(`/api/${collectionName}`, requireAuth, (req, res) => res.json(getAll(collectionName)));
  app.get(`/api/${collectionName}/:id`, requireAuth, (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const item = findById(collectionName, req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });
  app.post(`/api/${collectionName}`, requireAuth, (req, res) => {
    try { res.json(insert(collectionName, sanitizeInput(req.body))); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.put(`/api/${collectionName}/:id`, requireAuth, (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    try { res.json(update(collectionName, req.params.id, sanitizeInput(req.body))); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete(`/api/${collectionName}/:id`, requireAuth, (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    res.json({ success: remove(collectionName, req.params.id) });
  });
}

createCrudRoutes('products');
createCrudRoutes('subscriptions');
createCrudRoutes('events');
createCrudRoutes('trails');
createCrudRoutes('partners');
createCrudRoutes('community_programs');
createCrudRoutes('outgrowers');
createCrudRoutes('stats');
createCrudRoutes('footer_links');
createCrudRoutes('gallery');

// ========== API: IMAGE UPLOAD ==========
app.post('/api/upload', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    handleUpload(req, res);
  });
});

async function handleUpload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isSvg = ext === '.svg';

    if (!isSvg) {
      const metadata = await sharp(inputPath).metadata();
      const maxWidth = 1920;
      const maxBytes = 500 * 1024;
      const needsResize = metadata.width > maxWidth;
      const needsCompress = req.file.size > maxBytes;

      if (needsResize || needsCompress) {
        let pipeline = sharp(inputPath);
        if (needsResize) {
          pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
        }
        if (['.jpg', '.jpeg'].includes(ext)) {
          pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
        } else if (ext === '.png') {
          pipeline = pipeline.png({ compressionLevel: 9 });
        } else if (ext === '.webp') {
          pipeline = pipeline.webp({ quality: 82 });
        } else if (ext === '.gif') {
          pipeline = pipeline.gif();
        }
        const compressedPath = inputPath;
        await pipeline.toFile(compressedPath + '.tmp');
        fs.renameSync(compressedPath + '.tmp', compressedPath);
        req.file.size = fs.statSync(compressedPath).size;
      }
    }

    const url = '/uploads/' + req.file.filename;
    res.json({ url, filename: req.file.filename, size: req.file.size });
  } catch (err) {
    console.error('Upload compress error:', err.message);
    if (req.file) {
      const url = '/uploads/' + req.file.filename;
      return res.json({ url, filename: req.file.filename, size: req.file.size });
    }
    res.status(500).json({ error: 'Upload failed' });
  }
}

app.delete('/api/upload/:filename', requireAuth, (req, res) => {
  const safeFilename = sanitizeFilename(req.params.filename);
  if (!safeFilename || safeFilename !== req.params.filename) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(UPLOADS_DIR, safeFilename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'File not found' });
});

// ========== ADMIN PAGES ==========
function renderAdminSection(collectionName, title) {
  return (req, res) => {
    let data = getAll(collectionName);
    if (collectionName === 'navigation') data = data;
    if (collectionName === 'footer_links') data = getAll('footer_links');
    res.render('admin/section', { sectionKey: collectionName, title, data, csrfToken: req.session.csrfToken });
  };
}

app.get('/admin/settings', requireAuth, (req, res) => {
  const allSettings = getAll('settings');
  const grouped = {};
  allSettings.forEach(s => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });
  res.render('admin/settings', { grouped, csrfToken: req.session.csrfToken });
});

app.get('/admin/products', requireAuth, renderAdminSection('products', 'Products & Experiences'));
app.get('/admin/subscriptions', requireAuth, renderAdminSection('subscriptions', 'Subscription Plans'));
app.get('/admin/events', requireAuth, renderAdminSection('events', 'Events'));
app.get('/admin/trails', requireAuth, renderAdminSection('trails', 'Meraki Trails'));
app.get('/admin/partners', requireAuth, renderAdminSection('partners', 'Partners'));
app.get('/admin/community', requireAuth, renderAdminSection('community_programs', 'Community Programs'));
app.get('/admin/outgrowers', requireAuth, renderAdminSection('outgrowers', 'Outgrowers'));
app.get('/admin/stats', requireAuth, renderAdminSection('stats', 'Statistics'));
app.get('/admin/navigation', requireAuth, renderAdminSection('navigation', 'Navigation'));
app.get('/admin/footer', requireAuth, renderAdminSection('footer_links', 'Footer Links'));
app.get('/admin/gallery', requireAuth, renderAdminSection('gallery', 'Gallery'));

// ========== ADMIN: ANALYTICS ==========
app.get('/admin/analytics', requireAuth, (req, res) => {
  try {
    const summary = getAnalyticsSummary();
    const visitors = getRecentVisitors(50);
    res.render('admin/analytics', { summary, visitors, csrfToken: req.session.csrfToken });
  } catch (e) {
    console.error('Analytics page error:', e);
    res.status(500).render('admin/login', { error: 'Analytics load failed: ' + e.message, csrfToken: req.session ? req.session.csrfToken : '' });
  }
});

// ========== API: ANALYTICS ==========
app.get('/api/analytics/summary', requireAuth, (req, res) => {
  res.json(getAnalyticsSummary());
});

app.get('/api/analytics/visitors', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json(getRecentVisitors(limit));
});

app.get('/api/analytics/visitor/:id', requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  const pages = getVisitorPages(parseInt(req.params.id));
  res.json(pages);
});

// Change password
app.post('/admin/change-password', requireAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const db = readDb();
  const idx = db.settings.findIndex(s => s.key === 'admin_password_hash');
  if (idx >= 0) db.settings[idx].value = bcrypt.hashSync(newPassword, 10);
  fs.writeFileSync(path.join(__dirname, 'data', 'db.json'), JSON.stringify(db, null, 2));
  res.json({ success: true });
});

// ========== START ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`RAKI CMS running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`Default password: raki2025`);
});
