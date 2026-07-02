const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
  }
}

function readDb() {
  ensureDataDir();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeDb(data) {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getCollection(name) {
  const db = readDb();
  return db[name] || [];
}

function setCollection(name, items) {
  const db = readDb();
  db[name] = items;
  writeDb(db);
}

function getNextId(items) {
  return items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
}

function findById(collection, id) {
  const items = getCollection(collection);
  return items.find(i => i.id === Number(id)) || null;
}

function insert(collection, data) {
  const items = getCollection(collection);
  const item = { id: getNextId(items), ...data };
  items.push(item);
  setCollection(collection, items);
  return item;
}

function update(collection, id, data) {
  const items = getCollection(collection);
  const idx = items.findIndex(i => i.id === Number(id));
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...data, id: Number(id) };
  setCollection(collection, items);
  return items[idx];
}

function remove(collection, id) {
  const items = getCollection(collection);
  const filtered = items.filter(i => i.id !== Number(id));
  setCollection(collection, filtered);
  return filtered.length < items.length;
}

function getAll(collection, sortBy = 'sort_order') {
  const items = getCollection(collection);
  return items.sort((a, b) => (a[sortBy] || 0) - (b[sortBy] || 0));
}

function getWhere(collection, filterFn, sortBy = 'sort_order') {
  return getCollection(collection).filter(filterFn).sort((a, b) => (a[sortBy] || 0) - (b[sortBy] || 0));
}

module.exports = { getCollection, setCollection, findById, insert, update, remove, getAll, getWhere, readDb, writeDb };
