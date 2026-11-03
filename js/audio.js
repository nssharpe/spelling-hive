// English text-to-speech (the browser's own voices) and little synthesized sound effects
// (WebAudio, no files to download). Adapted from Les Cartes de Mamou's audio.js.

let settings = { sound: true, voice: null, rate: 0.9 };
export function setAudioSettings(s) { settings = { ...settings, ...s }; }

// ---------- speech ----------

let voices = [];
const listeners = new Set();

const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Best first: en-US, then en-GB, then any other English; local voices (they work offline) and
// natural-sounding names break ties.
function score(v) {
  let s = 0;
  if (/en[-_]US/i.test(v.lang)) s += 8;
  else if (/en[-_]GB/i.test(v.lang)) s += 4;
  if (v.localService) s += 1;
  if (/google|enhanced|premium|natural|samantha|alex|daniel|aaron|nicky|zira|jenny|aria/i.test(v.name)) s += 2;
  return s;
}

function loadVoices() {
  if (!hasSpeech()) { voices = []; return; }
  let all = [];
  try { all = speechSynthesis.getVoices() || []; } catch { all = []; }
  voices = all.filter(v => /^en(-|_|$)/i.test(v.lang)).sort((a, b) => score(b) - score(a));
  listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });
}
if (hasSpeech()) {
  loadVoices();
  try { speechSynthesis.onvoiceschanged = loadVoices; } catch { /* ignore */ }
}

export function englishVoices() { return voices; }
export function canSpeak() { return hasSpeech() && voices.length > 0; }
export function refreshVoices() { loadVoices(); }
// Called whenever the voice list changes (voices often arrive a moment after load).
export function onVoicesChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Voices often load a moment after the page does. Resolves true as soon as there is an English
// voice, or false after `ms` with none (then the app falls back to text clues).
let waitedForVoices = false;
export function voicesReady(ms = 1500) {
  loadVoices();
  if (canSpeak()) return Promise.resolve(true);
  if (waitedForVoices || !hasSpeech()) return Promise.resolve(false); // already waited once: don't stall every screen
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; waitedForVoices = true; off(); clearTimeout(t); resolve(v); } };
    const off = onVoicesChanged(() => { if (canSpeak()) finish(true); });
    const t = setTimeout(() => { loadVoices(); finish(canSpeak()); }, ms);
  });
}

function pickVoice() {
  return voices.find(v => v.voiceURI === settings.voice) || voices[0] || null;
}

export function speak(text, { rate, onend } = {}) {
  if (!hasSpeech() || !text) { onend && onend(); return false; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) try { u.voice = v; } catch { /* not a real SpeechSynthesisVoice */ }
    u.lang = v ? v.lang : 'en-US';
    u.rate = rate || settings.rate || 0.9;
    u.pitch = 1;
    if (onend) { u.onend = onend; u.onerror = onend; }
    speechSynthesis.speak(u);
    return true;
  } catch {
    onend && onend();
    return false;
  }
}

export function stopSpeech() {
  if (!hasSpeech()) return;
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
}

// "word. sentence. word." in one go. A word with no sentence is just "word."
export function sayWord(word, sentence, opts = {}) {
  const w = String(word || '').trim();
  const s = String(sentence || '').trim();
  const text = s ? `${w}. ${s}${/[.!?…]$/.test(s) ? '' : '.'} ${w}.` : `${w}.`;
  return speak(text, opts);
}

// iOS only lets speech start from a user gesture; a silent utterance during
// the first tap unlocks it for later automatic speech.
export function primeSpeech() {
  if (!hasSpeech()) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* ignore */ }
}

// ---------- sound effects ----------

let ctx = null;
function ac() {
  if (!settings.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, start, dur, { type = 'sine', vol = 0.18, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const N = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, D4: 293.66, F4: 349.23 };

export const sfx = {
  unlock() { ac(); },
  tap() { tone(900, 0, 0.05, { type: 'triangle', vol: 0.07 }); },
  correct() { tone(N.C6, 0, 0.12, { vol: 0.16 }); tone(N.E6, 0.08, 0.22, { vol: 0.16 }); },
  // Gentle on purpose: a miss is part of learning, not a buzzer.
  wrong() { tone(260, 0, 0.18, { type: 'triangle', vol: 0.12, slide: -70 }); tone(200, 0.14, 0.26, { type: 'triangle', vol: 0.1, slide: -50 }); },
  fanfare() {
    [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.1, 0.3, { type: 'triangle', vol: 0.14 }));
    tone(N.C6, 0.45, 0.6, { type: 'triangle', vol: 0.12 });
  },
  coin() { tone(1567, 0, 0.07, { type: 'square', vol: 0.05 }); tone(2093, 0.06, 0.16, { type: 'square', vol: 0.05 }); },
};
