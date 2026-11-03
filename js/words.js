// Word bank, grades 5 to 12. Pure data, no DOM.
import g5 from '../data/grade5.js';
import g6 from '../data/grade6.js';
import g7 from '../data/grade7.js';
import g8 from '../data/grade8.js';
import g9 from '../data/grade9.js';
import g10 from '../data/grade10.js';
import g11 from '../data/grade11.js';
import g12 from '../data/grade12.js';

export const GRADES = [5, 6, 7, 8, 9, 10, 11, 12];
const BY_GRADE = { 5: g5, 6: g6, 7: g7, 8: g8, 9: g9, 10: g10, 11: g11, 12: g12 };

export const ALL_WORDS = GRADES.flatMap((g) => BY_GRADE[g]);
const BY_ID = new Map(ALL_WORDS.map((w) => [w.id, w]));

export function wordsForGrade(g) {
  return BY_GRADE[g] || [];
}

export function wordById(id) {
  return BY_ID.get(id);
}
