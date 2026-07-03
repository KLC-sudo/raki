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
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    return next();
  }
  express.json()(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ extended: true })(req, res, next);
  });
});
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is required.');
  process.exit(1);
}

// Security: CSRF protection on all routes
app.use(csrfProtection);

// Helper: get all settings as object
function getSettings() {
  const db = readDb();
  const settings = {};
  (db.settings || []).forEach(s => settings[s.key] = s.value);
  return settings;
}

// Security: Simple in-memory rate limiter
const loginAttempts = new Map();
function rateLimitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < windowMs);
  if (attempts.length >= maxAttempts) {
    return res.status(429).render('admin/login', { error: 'Too many attempts. Try again in 15 minutes.' });
  }
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  next();
}

// Security: Input sanitization - strip dangerous keys
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = Array.isArray(obj) ? [] : {};
  for (const [key, val] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (typeof val === 'object' && val !== null) {
      clean[key] = sanitizeInput(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

// Security: Validate numeric ID parameter
function isValidId(id) {
  return /^\d+$/.test(id);
}

// Security: Path traversal prevention
function sanitizeFilename(filename) {
  return path.basename(filename);
}

// Security: CSRF token (double-submit cookie pattern)
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!req.session.csrfToken) {
      req.session.csrfToken = generateCsrfToken();
    }
    res.locals.csrfToken = req.session.csrfToken;
    return next();
  }
  const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
  if (!token || !req.session.csrfToken || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

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
