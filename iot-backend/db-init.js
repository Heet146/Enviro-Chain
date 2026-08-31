'use strict';

const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const log = require('./logger');

let db;

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const hasKey = fs.existsSync(serviceAccountPath);

if (hasKey && process.env.FIREBASE_URL && !process.env.FIREBASE_URL.includes('<your-project-id>')) {
  try {
    const app = getApps().length === 0 ? initializeApp({
      credential: cert(require(serviceAccountPath)),
      databaseURL: process.env.FIREBASE_URL,
    }) : getApps()[0];
    db = getDatabase(app);
    log.info('Firebase Realtime Database connected');
  } catch (err) {
    log.warn(`Firebase initialization failed (${err.message}). Using local store.`);
    db = createLocalDb();
  }
} else {
  log.info('No serviceAccountKey.json found or FIREBASE_URL not configured. Running with local in-memory/file storage.');
  db = createLocalDb();
}

function createLocalDb() {
  const store = {
    blocks: {},
    nodes: {},
    anchors: {}
  };

  const storeFilePath = path.join(__dirname, '.local-db.json');
  if (fs.existsSync(storeFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(storeFilePath, 'utf8'));
      if (data.blocks) store.blocks = data.blocks;
      if (data.nodes) store.nodes = data.nodes;
      if (data.anchors) store.anchors = data.anchors;
    } catch (_) {}
  }

  function persist() {
    try {
      fs.writeFileSync(storeFilePath, JSON.stringify(store, null, 2));
    } catch (_) {}
  }

  class MockQuery {
    constructor(pathStr, filterFn = null, sortProp = null, limit = null) {
      this.pathStr = pathStr;
      this.filterFn = filterFn;
      this.sortProp = sortProp;
      this.limit = limit;
    }

    orderByChild(prop) {
      return new MockQuery(this.pathStr, this.filterFn, prop, this.limit);
    }

    equalTo(val) {
      const prevFilter = this.filterFn;
      const prop = this.sortProp;
      return new MockQuery(this.pathStr, (item) => {
        if (prevFilter && !prevFilter(item)) return false;
        return item && prop && item[prop] === val;
      }, this.sortProp, this.limit);
    }

    limitToLast(n) {
      return new MockQuery(this.pathStr, this.filterFn, this.sortProp, n);
    }

    async once(eventType) {
      const parts = this.pathStr.split('/').filter(Boolean);
      let target = store;
      for (const p of parts) {
        if (!target) break;
        target = target[p];
      }

      let items = [];
      if (target && typeof target === 'object') {
        items = Object.keys(target).map(key => ({
          key,
          val: target[key]
        }));
      }

      if (this.filterFn) {
        items = items.filter(i => this.filterFn(i.val));
      }

      if (this.sortProp) {
        items.sort((a, b) => {
          const av = a.val ? a.val[this.sortProp] : 0;
          const bv = b.val ? b.val[this.sortProp] : 0;
          return (av > bv ? 1 : av < bv ? -1 : 0);
        });
      }

      if (this.limit && items.length > this.limit) {
        items = items.slice(items.length - this.limit);
      }

      const val = parts.length === 2 ? target : (items.length ? {} : null);
      if (parts.length < 2 && val) {
        items.forEach(i => { val[i.key] = i.val; });
      }

      return {
        val: () => (parts.length === 2 ? target : (Object.keys(val || {}).length ? val : null)),
        forEach: (callback) => {
          items.forEach(i => {
            callback({
              key: i.key,
              val: () => i.val
            });
          });
        }
      };
    }
  }

  class MockRef extends MockQuery {
    constructor(pathStr) {
      super(pathStr);
    }

    async set(value) {
      const parts = this.pathStr.split('/').filter(Boolean);
      if (parts.length === 1) {
        store[parts[0]] = value;
      } else if (parts.length === 2) {
        if (!store[parts[0]]) store[parts[0]] = {};
        store[parts[0]][parts[1]] = value;
      }
      persist();
    }

    async update(values) {
      const parts = this.pathStr.split('/').filter(Boolean);
      if (parts.length === 1) {
        store[parts[0]] = { ...(store[parts[0]] || {}), ...values };
      } else if (parts.length === 2) {
        if (!store[parts[0]]) store[parts[0]] = {};
        store[parts[0]][parts[1]] = { ...(store[parts[0]][parts[1]] || {}), ...values };
      }
      persist();
    }

    async remove() {
      const parts = this.pathStr.split('/').filter(Boolean);
      if (parts.length === 1) {
        delete store[parts[0]];
      } else if (parts.length === 2) {
        if (store[parts[0]]) delete store[parts[0]][parts[1]];
      }
      persist();
    }

    push(value) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const parts = this.pathStr.split('/').filter(Boolean);
      const root = parts[0] || 'items';
      if (!store[root]) store[root] = {};
      if (value) {
        store[root][id] = value;
        persist();
      }
      return {
        key: id,
        set: async (val) => {
          store[root][id] = val;
          persist();
        }
      };
    }
  }

  return {
    ref: (p) => new MockRef(p || '')
  };
}

module.exports = { db };
