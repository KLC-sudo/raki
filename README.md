# RAKI Coffee CMS

A full-stack content management system for **RAKI Coffee Co.**, a Ugandan specialty coffee brand based near Sezibwa Falls, Mukono District. The site showcases coffee experiences, a Meraki hiking trail, subscription plans, community impact programs, and an online shop.

**Live:** [raki.coffee](https://raki.coffee)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 18 |
| Server | Express 4 |
| Templating | EJS |
| Database | JSON file (`data/db.json`) via custom store |
| Analytics | JSON file (`data/analytics.json`) — separate store |
| Auth | express-session + bcryptjs (single-admin, password-only) |
| File Upload | multer + sharp (auto-compress/resize) |
| CSS | Tailwind CSS v4 (CLI) |
| Icons | Lucide v0.460.0 (pinned) |
| Fonts | Inter (Google Fonts, weights 300–900) |

---

## Project Structure

```
raki-main/
├── server.js              # Express app — all routes, API, upload, analytics middleware
├── package.json           # Dependencies and scripts
├── Procfile               # Railway: `web: npm start`
├── site.html              # Static HTML prototype (Tailwind CDN, not served)
├── README.md              # This file
│
├── db/
│   ├── store.js           # JSON file CRUD (readDb, writeDb, insert, update, remove)
│   ├── seed.js            # Seeds default data on first run
│   └── analytics.js       # Visitor tracking (IP hashing, UA parsing, pageviews)
│
├── middleware/
│   └── auth.js            # Session-based requireAuth middleware
│
├── views/
│   ├── index.ejs          # Public homepage (triple-click admin button in footer)
│   └── admin/
│       ├── dashboard.ejs  # Admin dashboard with collection counts
│       ├── login.ejs      # Admin login page
│       ├── settings.ejs   # Site-wide settings editor
│       ├── section.ejs    # Generic CRUD section editor
│       ├── analytics.ejs  # Visitor analytics dashboard
│       └── partials/
│           └── nav.ejs    # Admin sidebar navigation
│
├── public/
│   ├── css/               # Compiled Tailwind + admin CSS
│   ├── js/
│   │   └── main.js        # Client-side JS + analytics heartbeat
│   ├── favicon.ico
│   ├── favicon.png
│   └── uploads/           # User-uploaded images (gitignored)
│
├── src/
│   └── input.css          # Tailwind source file
│
├── data/
│   ├── db.json            # Runtime database (gitignored, auto-seeded)
│   └── analytics.json     # Visitor analytics (gitignored, auto-created)
│
└── .gitignore
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Start the server (auto-seeds DB on first run)
npm start

# Or with dev mode (same as start)
npm run dev

# Manually re-seed the database
npm run seed
```

**Default admin URL:** `http://localhost:3000/admin`
**Default password:** `raki2025`
**Front-page admin access:** Triple-click the tiny `·` dot in the footer bar (resets after 2s inactivity)

---

## Data Model

All data is stored in `data/db.json` as a flat JSON object with array collections.

### Collections

| Collection | Description | Key Fields |
|-----------|-------------|------------|
| `settings` | Site-wide key-value config | `key`, `value`, `type`, `category` |
| `navigation` | Top nav menu items | `label`, `href`, `is_active`, `is_cta` |
| `products` | Products & experiences | `name`, `slug`, `price`, `category`, `badge` |
| `subscriptions` | Subscription tiers | `name`, `slug`, `price`, `weight`, `features` |
| `events` | Upcoming events | `title`, `event_date`, `event_month`, `event_day` |
| `trails` | Meraki Trail levels | `level`, `name`, `difficulty`, `duration`, `features` |
| `partners` | Partner types | `name`, `description`, `icon` |
| `community_programs` | Community impact programs | `title`, `description`, `icon`, `image_url` |
| `outgrowers` | Regional farmer networks | `name`, `region`, `description` |
| `stats` | Key metrics | `label`, `value` |
| `footer_links` | Footer navigation | `category`, `label`, `href` |
| `gallery` | Photo gallery | `title`, `image_url`, `category` |

### Settings Categories

| Category | Controls |
|----------|----------|
| `general` | Site name, tagline, contact info, logo, copyright |
| `design` | Colors, fonts, layout, border radius, shadows |
| `hero` | Hero section text, CTAs, background images |
| `sections` | Section labels, titles, descriptions (per section) |
| `visibility` | Toggle visibility of each homepage section |
| `subscribe` | Subscription form title/description |
| `social` | Social media links |
| `admin` | Admin password hash |

---

## API Endpoints

All admin API routes require session auth (`requireAuth`) and CSRF token (`X-CSRF-Token` header or `_csrf` body field).

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get all settings |
| GET | `/api/settings/:category` | Get settings by category |
| PUT | `/api/settings` | Batch update settings (sanitized) |

### Generic CRUD (for each collection)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/:collection` | List all items |
| GET | `/api/:collection/:id` | Get item by ID (numeric validation) |
| POST | `/api/:collection` | Create item (input sanitized) |
| PUT | `/api/:collection/:id` | Update item (input sanitized) |
| DELETE | `/api/:collection/:id` | Delete item |

**Collections:** `products`, `subscriptions`, `events`, `trails`, `partners`, `community_programs`, `outgrowers`, `stats`, `footer_links`, `gallery`

### Navigation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/navigation` | List navigation items |
| POST | `/api/navigation` | Create nav item |
| PUT | `/api/navigation/:id` | Update nav item |
| DELETE | `/api/navigation/:id` | Delete nav item |

### File Upload
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload image (multipart/form-data, field: `image`) |
| DELETE | `/api/upload/:filename` | Delete uploaded file (path traversal protected) |

Upload limits: 50MB max, auto-compressed/resized by sharp (max width 1920px).

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analytics/heartbeat` | Track session time (public, no auth) |
| GET | `/api/analytics/summary` | Full analytics summary (admin) |
| GET | `/api/analytics/visitors` | Recent visitors list (admin) |
| GET | `/api/analytics/visitor/:id` | Pages viewed by visitor (admin) |

---

## Public Routes

| Route | Description |
|-------|-------------|
| `GET /` | Homepage — renders all active collections into `index.ejs` |
| `POST /api/analytics/heartbeat` | Client sends session duration beacon |

---

## Admin Routes

| Route | Description |
|-------|-------------|
| `GET /admin/login` | Login page |
| `POST /admin/login` | Authenticate (rate-limited, 5 attempts/15min) |
| `GET /admin/logout` | Destroy session |
| `GET /admin` | Dashboard with collection counts |
| `GET /admin/settings` | Site settings editor |
| `GET /admin/products` | Products management |
| `GET /admin/subscriptions` | Subscriptions management |
| `GET /admin/events` | Events management |
| `GET /admin/trails` | Trails management |
| `GET /admin/partners` | Partners management |
| `GET /admin/community` | Community programs management |
| `GET /admin/outgrowers` | Outgrowers management |
| `GET /admin/stats` | Statistics management |
| `GET /admin/analytics` | Visitor analytics dashboard |
| `GET /admin/navigation` | Navigation management |
| `GET /admin/footer` | Footer links management |
| `GET /admin/gallery` | Gallery management |
| `POST /admin/change-password` | Change admin password (min 8 chars) |

---

## Analytics System

Tracks visitor activity with zero third-party dependencies — all data stored locally in `data/analytics.json`.

### What's Tracked

| Data Point | Method |
|-----------|--------|
| Visitor identity | IP address (SHA-256 hashed, never stored raw) |
| Browser / OS / Device | Parsed from User-Agent header |
| Referrer | HTTP Referer header or "Direct" |
| Pages visited | Every public GET request with timestamp |
| Time on site | Client-side heartbeat (30s interval + page unload beacon) |
| Hourly distribution | Derived from pageview timestamps |

### Admin Analytics Dashboard (`/admin/analytics`)

- Summary cards: total/today/week/month visitors and pageviews
- Average time on site
- Top pages with proportional bar chart
- Top referrers with proportional bar chart
- Browser, OS, and device breakdowns
- 24-hour activity bar chart for today
- Recent visitors table — click any row to see full page history

### Privacy

- IPs are hashed with SHA-256 + salt — raw IPs are never stored
- No cookies set by analytics (uses existing session only)
- No external services called — all data stays on your server
- Analytics data is gitignored (`data/analytics.json`)

---

## Front-Page Admin Access

A subtle triple-click button is embedded in the footer bar:

- Renders as a tiny `·` dot at 20% opacity — nearly invisible
- **1st click** — opacity increases to ~45%
- **2nd click** — opacity increases to ~70%
- **3rd click** — redirects to `/admin/login`
- **2 second timeout** — resets to 0 clicks, fades back to invisible

Implemented in `views/index.ejs` with inline `<script>`.

---

## Design System

### Color Palette
- **Primary (Bark):** `#4A3518` — dark coffee brown
- **Background:** `#FAF7F2` — warm cream
- **Surface:** `#FFFFFF` — white cards
- **Accent:** `#F5F0E8` — sand
- **Text Muted:** `#8B6E3C` — medium brown
- **Border:** `#4A3518` — matches primary

### Typography
- **Font:** Inter (all weights: 300–900)
- **Headings:** 900 weight, uppercase, tight tracking
- **Body:** 400–500 weight
- **Mono:** ui-monospace, SFMono-Regular, Menlo

### Admin Panel
- Dark theme (`bg-[#1A1008]`)
- Sidebar navigation (60px/240px responsive)
- Card-based layout
- Lucide icons v0.460.0 (pinned)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `SESSION_SECRET` | random (auto-generated) | Session signing secret — random if not set (warns, sessions won't persist across restarts) |
| `NODE_ENV` | `development` | Set to `production` for Railway/proxy deployments |

---

## Deployment

### Railway
- `Procfile` is configured: `web: npm start`
- Auto-seeds database on first deploy (no DB_FILE found)
- `trust proxy: 1` is set — reads `X-Forwarded-Proto` from Railway's edge
- `cookie.secure: 'auto'` — only sets secure flag when behind HTTPS proxy
- **Recommended:** Set `SESSION_SECRET` env var for persistent sessions

### General
- `data/` directory is created automatically
- `public/uploads/` is created automatically
- `node_modules/`, `data/db.json`, `data/analytics.json`, `public/uploads/` are gitignored

---

## Security

### Protections Implemented

| Protection | Implementation |
|-----------|---------------|
| Session secret | Auto-generated random if `SESSION_SECRET` not set (warns in console) |
| Secure cookies | `secure: 'auto'` — respects `X-Forwarded-Proto` via `trust proxy` |
| CSRF | Double-submit token pattern — token in `<meta>` tag + `X-CSRF-Token` header on all state-changing requests; form submissions use `_csrf` hidden field |
| Rate limiting | Login endpoint: 5 attempts per IP per 15-minute window |
| Input sanitization | Strips `__proto__`, `constructor`, `prototype` keys from all API input |
| ID validation | All `:id` params validated as numeric digits only |
| Path traversal | File delete uses `path.basename()` + resolved path check to stay within uploads dir |
| Password policy | Minimum 8 characters enforced on password change |
| Resilient CSRF | If session is lost, redirects to login instead of returning 403 |

### Deployment Fixes Applied

| Issue | Fix |
|-------|-----|
| `process.exit(1)` crashed server when `SESSION_SECRET` missing | Removed — now auto-generates and warns |
| `cookie.secure: true` broke sessions behind Railway proxy | Changed to `secure: 'auto'` + `trust proxy: 1` |
| Nested body parser consumed stream before URL-encoded parser | Simplified to separate `express.urlencoded()` + `express.json()` calls |
| All admin routes missing `csrfToken` in template render | Every `res.render('admin/...')` now passes `csrfToken: req.session.csrfToken` |
| Google Fonts URL broken by conditional EJS | Hardcoded full weight range `300;400;500;600;700;800;900` |
| Lucide `@latest` CDN broke icons on version changes | Pinned to `v0.460.0` |
| Deprecated Lucide icons (`river`, `instagram`, etc.) | Replaced: `droplets`, `camera`, `message-circle`, `users`, `play` |
| Dead `db/schema.js` imported uninstalled `better-sqlite3` | Deleted |

### Notes
- Single admin user (password-only auth, no username)
- `site.html` is a static prototype using Tailwind CDN — not served by the app

---

## Changelog

### v1.0 (Current)
- Initial codebase analysis and documentation
- Security hardening: CSRF, rate limiting, input sanitization, path traversal prevention
- Fixed Railway deployment issues (session cookies, proxy trust, body parsing)
- Added visitor analytics system (IP hashing, pageviews, time-on-site, referrers, UA parsing)
- Added admin analytics dashboard at `/admin/analytics`
- Added triple-click hidden admin login button in footer
- Fixed Lucide icon compatibility and Google Fonts URL
- Pinned Lucide to v0.460.0 for stability
