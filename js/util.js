// Small helpers shared by every module. Nothing here touches the DOM at import
// time, so the pure modules (and their tests under node) can import it.

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

// A "study day" starts at 4am local time (like Anki), so a late-night session
// still counts for the evening it belongs to.
export const DAY_START_HOUR = 4;

export function dayStart(ts, startHour = DAY_START_HOUR) {
  const d = new Date(ts);
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  d.setHours(startHour, 0, 0, 0);
  return d.getTime();
}

// Start of the study day `n` days after the one containing ts. Uses calendar
// math rather than adding 24h so daylight-saving changes don't drift it.
export function dayStartPlus(ts, n, startHour = DAY_START_HOUR) {
  const d = new Date(dayStart(ts, startHour));
  d.setDate(d.getDate() + n);
  d.setHours(startHour, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts, startHour = DAY_START_HOUR) {
  const d = new Date(dayStart(ts, startHour));
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Whole study days between two day keys (b - a).
export function daysBetweenKeys(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  const ta = Date.UTC(ya, ma - 1, da);
  const tb = Date.UTC(yb, mb - 1, db);
  return Math.round((tb - ta) / DAY);
}

export function addDaysToKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-4);
  return prefix + t + r;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
