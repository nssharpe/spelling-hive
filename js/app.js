// Shared app state: the database, saving, navigation and cloud sync.

import { loadDB, saveDB } from './store.js';
import { toast } from './fx.js';
import { syncNow } from './cloud.js';

export const app = {
  db: null,
  storage: null,

  init() {
    try { this.storage = window.localStorage; this.storage.getItem('x'); }
    catch { this.storage = memoryStorage(); }
    this.db = loadDB(this.storage);
  },

  save() {
    if (!saveDB(this.db, this.storage)) toast('Could not save!', { sub: 'Storage is full or blocked.', icon: '⚠️' });
    if (this.db.sync) scheduleSync();
  },

  // Sync with the family's cloud copy now. Re-renders calm screens when
  // something arrived from another device (never mid-practice or mid-placement).
  async sync() {
    if (!this.db.sync) return { ok: false };
    clearTimeout(syncTimer);
    const res = await syncNow(() => this.db, this.storage);
    if (res.ok && res.changed && !/^#\/p\/[\w-]+\/(practice|placement)/.test(location.hash) && !document.querySelector('#modal-root .modal-back')) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    return res;
  },

  go(path) {
    const h = '#' + path;
    if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = h;
  },

  profile(pid) { return this.db.profiles.find(p => p.id === pid); },
  prog(pid) { return this.db.progress[pid]; },
};

// Saving schedules a sync a few seconds later, so a burst of answers is one upload.
let syncTimer = null;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => app.sync(), 4000);
}

export function startSyncLoop() {
  if (app.db.sync) setTimeout(() => app.sync(), 300);
  setInterval(() => { if (app.db.sync && document.visibilityState === 'visible') app.sync(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (app.db.sync) app.sync(); });
  window.addEventListener('online', () => { if (app.db.sync) app.sync(); });
}

function memoryStorage() {
  const m = new Map();
  toast('Private mode: progress won\'t be saved', { icon: '⚠️', ms: 6000 });
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}
