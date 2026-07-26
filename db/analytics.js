const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readDb, writeDb } = require('./store');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

function ensureAnalyticsFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ANALYTICS_FILE)) {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify({ visitors: [], pageviews: [] }, null, 2));
  }
}

function readAnalytics() {
  ensureAnalyticsFile();
  try {
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
  } catch {
    return { visitors: [], pageviews: [] };
  }
}

function writeAnalytics(data) {
  ensureAnalyticsFile();
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip + 'raki-salt-2025').digest('hex').slice(0, 16);
}

function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

  let browser = 'Other';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera';
  else if (ua.includes('MSIE') || ua.includes('Trident/')) browser = 'IE';

  let os = 'Other';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  let device = 'Desktop';
  if (ua.includes('Mobile') || ua.includes('Android')) device = 'Mobile';
  else if (ua.includes('iPad') || ua.includes('Tablet')) device = 'Tablet';

  return { browser, os, device };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.connection.remoteAddress || req.ip || '127.0.0.1';
}

function trackVisit(req) {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const ua = req.headers['user-agent'] || '';
  const referrer = req.headers['referer'] || req.headers['referrer'] || '';
  const now = new Date().toISOString();
  const page = req.originalUrl || req.url;

  const analytics = readAnalytics();

  let visitor = analytics.visitors.find(v => v.ip_hash === ipHash);
  if (!visitor) {
    visitor = {
      id: analytics.visitors.length > 0 ? Math.max(...analytics.visitors.map(v => v.id)) + 1 : 1,
      ip_hash: ipHash,
      first_visit: now,
      last_visit: now,
      visit_count: 1,
      ...parseUserAgent(ua),
      referrer: referrer || 'Direct',
      pages_viewed: 0,
      total_time_seconds: 0
    };
    analytics.visitors.push(visitor);
  } else {
    visitor.last_visit = now;
    visitor.visit_count++;
  }

  visitor.pages_viewed++;

  analytics.pageviews.push({
    id: analytics.pageviews.length > 0 ? Math.max(...analytics.pageviews.map(p => p.id)) + 1 : 1,
    visitor_id: visitor.id,
    page: page,
    timestamp: now,
    referrer: referrer || 'Direct',
    user_agent: ua.slice(0, 500)
  });

  writeAnalytics(analytics);
  return visitor.id;
}

function updateSessionTime(visitorId, durationSeconds) {
  if (!visitorId || !durationSeconds) return;
  const analytics = readAnalytics();
  const visitor = analytics.visitors.find(v => v.id === visitorId);
  if (visitor) {
    visitor.total_time_seconds = (visitor.total_time_seconds || 0) + durationSeconds;
    writeAnalytics(analytics);
  }
}

function getAnalyticsSummary() {
  const analytics = readAnalytics();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thisMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const todayVisitors = new Set(
    analytics.pageviews.filter(p => p.timestamp.startsWith(today)).map(p => p.visitor_id)
  ).size;

  const weekVisitors = new Set(
    analytics.pageviews.filter(p => p.timestamp >= thisWeek).map(p => p.visitor_id)
  ).size;

  const monthVisitors = new Set(
    analytics.pageviews.filter(p => p.timestamp >= thisMonth).map(p => p.visitor_id)
  ).size;

  const todayPageviews = analytics.pageviews.filter(p => p.timestamp.startsWith(today)).length;
  const weekPageviews = analytics.pageviews.filter(p => p.timestamp >= thisWeek).length;
  const monthPageviews = analytics.pageviews.filter(p => p.timestamp >= thisMonth).length;

  const pageCounts = {};
  analytics.pageviews.forEach(p => {
    const key = p.page.split('?')[0];
    pageCounts[key] = (pageCounts[key] || 0) + 1;
  });
  const topPages = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const referrerCounts = {};
  analytics.pageviews.forEach(p => {
    const ref = p.referrer || 'Direct';
    referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
  });
  const topReferrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const browserCounts = {};
  const osCounts = {};
  const deviceCounts = {};
  analytics.visitors.forEach(v => {
    browserCounts[v.browser] = (browserCounts[v.browser] || 0) + 1;
    osCounts[v.os] = (osCounts[v.os] || 0) + 1;
    deviceCounts[v.device] = (deviceCounts[v.device] || 0) + 1;
  });

  const avgTime = analytics.visitors.length > 0
    ? Math.round(analytics.visitors.reduce((sum, v) => sum + (v.total_time_seconds || 0), 0) / analytics.visitors.length)
    : 0;

  const hourly = Array(24).fill(0);
  analytics.pageviews.filter(p => p.timestamp.startsWith(today)).forEach(p => {
    const hour = new Date(p.timestamp).getHours();
    hourly[hour]++;
  });

  return {
    total: {
      visitors: analytics.visitors.length,
      pageviews: analytics.pageviews.length
    },
    today: { visitors: todayVisitors, pageviews: todayPageviews },
    thisWeek: { visitors: weekVisitors, pageviews: weekPageviews },
    thisMonth: { visitors: monthVisitors, pageviews: monthPageviews },
    topPages,
    topReferrers,
    browsers: browserCounts,
    os: osCounts,
    devices: deviceCounts,
    avgTimeSeconds: avgTime,
    hourlyToday: hourly
  };
}

function getRecentVisitors(limit = 50) {
  const analytics = readAnalytics();
  return analytics.visitors
    .sort((a, b) => new Date(b.last_visit) - new Date(a.last_visit))
    .slice(0, limit);
}

function getVisitorPages(visitorId) {
  const analytics = readAnalytics();
  return analytics.pageviews
    .filter(p => p.visitor_id === visitorId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 100);
}

module.exports = {
  trackVisit,
  updateSessionTime,
  getAnalyticsSummary,
  getRecentVisitors,
  getVisitorPages,
  readAnalytics
};
