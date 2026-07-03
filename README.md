# RAKI Coffee CMS

A full-stack content management system for **RAKI Coffee Co.**, a Ugandan specialty coffee brand based near Sezibwa Falls, Mukono District. The site showcases coffee experiences, a Meraki hiking trail, subscription plans, community impact programs, and an online shop.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 18 |
| Server | Express 4 |
| Templating | EJS |
| Database | JSON file (`data/db.json`) via custom store |
| Auth | express-session + bcryptjs (single-admin, password-only) |
| File Upload | multer + sharp (auto-compress/resize) |
| CSS | Tailwind CSS v4 (CLI) |
| Icons | Lucide (admin panel) |
| Fonts | Inter (Google Fonts) |

---

## Project Structure

```
raki-main/
├── server.js              # Express app — all routes, API, upload logic
├── package.json           # Dependencies and scripts
├── Procfile               # Railway/Heroku: `web: npm start`
├── site.html              # Static HTML prototype (Tailwind CDN, not served)
│
├── db/
│   ├── store.js           # JSON file CRUD (readDb, writeDb, insert, update, remove)
│   ├── seed.js            # Seeds default data on first run
│   └── schema.js          # SQLite schema (UNUSED — better-sqlite3 not in deps)
│
├── middleware/
│   └── auth.js            # Session-based requireAuth middleware
│
├── views/
│   ├── index.ejs          # Public homepage
│   └── admin/
│       ├── dashboard.ejs  # Admin dashboard with collection counts
│       ├── login.ejs      # Admin login page
│       ├── settings.ejs   # Site-wide settings editor
│       ├── section.ejs    # Generic CRUD section editor
│       └── partials/
│           └── nav.ejs    # Admin sidebar navigation
│
├── public/
│   ├── css/               # Compiled Tailwind + admin CSS
│   ├── js/                # Client-side JS
│   ├── favicon.ico
│   ├── favicon.png
│   └── uploads/           # User-uploaded images (gitignored)
│
├── src/
│   └── input.css          # Tailwind source file
│
├── data/
│   └── db.json            # Runtime database (gitignored, auto-seeded)
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

All admin API routes require session auth (`requireAuth`).

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get all settings |
| GET | `/api/settings/:category` | Get settings by category |
| PUT | `/api/settings` | Batch update settings |

### Generic CRUD (for each collection)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/:collection` | List all items |
| GET | `/api/:collection/:id` | Get item by ID |
| POST | `/api/:collection` | Create item |
| PUT | `/api/:collection/:id` | Update item |
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
| DELETE | `/api/upload/:filename` | Delete uploaded file |

Upload limits: 50MB max, auto-compressed/resized by sharp (max width 1920px).

---

## Public Routes

| Route | Description |
|-------|-------------|
| `GET /` | Homepage — renders all active collections into `index.ejs` |

---

## Admin Routes

| Route | Description |
|-------|-------------|
| `GET /admin/login` | Login page |
| `POST /admin/login` | Authenticate (password only) |
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
| `GET /admin/navigation` | Navigation management |
| `GET /admin/footer` | Footer links management |
| `GET /admin/gallery` | Gallery management |
| `POST /admin/change-password` | Change admin password |

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
- **Font:** Inter (all weights: 400–900)
- **Headings:** 900 weight, uppercase, tight tracking
- **Body:** 400–500 weight
- **Mono:** ui-monospace, SFMono-Regular, Menlo

### Admin Panel
- Dark theme (`bg-[#1A1008]`)
- Sidebar navigation (60px/240px responsive)
- Card-based layout
- Lucide icons throughout

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `SESSION_SECRET` | **(required)** | Session signing secret — app exits if missing |
| `NODE_ENV` | `development` | Set to `production` to enable secure cookies |

---

## Deployment

### Railway
- `Procfile` is configured: `web: npm start`
- Auto-seeds database on first deploy (no DB_FILE found)
- **Required:** Set `SESSION_SECRET` env var in production
- **Required:** Set `NODE_ENV=production` for secure cookies

### General
- `data/` directory is created automatically
- `public/uploads/` is created automatically
- `node_modules/`, `data/db.json`, `public/uploads/` are gitignored

---

## Security

### Protections Implemented

| Protection | Implementation |
|-----------|---------------|
| Session secret | **Required** via `SESSION_SECRET` env var — app refuses to start without it |
| Secure cookies | Cookie `secure` flag enabled when `NODE_ENV=production` |
| CSRF | Double-submit token pattern — token in meta tag + `X-CSRF-Token` header on all state-changing requests |
| Rate limiting | Login endpoint: 5 attempts per IP per 15-minute window |
| Input sanitization | Strips `__proto__`, `constructor`, `prototype` keys from all API input |
| ID validation | All `:id` params validated as numeric digits only |
| Path traversal | File delete uses `path.basename()` + resolved path check to stay within uploads dir |
| Password policy | Minimum 8 characters enforced on password change |

### Notes
- Single admin user (password-only auth, no username)
- `site.html` is a static prototype using Tailwind CDN — not served by the app
