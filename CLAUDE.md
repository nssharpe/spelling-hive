# Spell Hive — CLAUDE.md

Spelling app for Nate's kids (Zyler and Kadyn), grades 5 to 12. The kid hears a word,
then a sentence using it, then the word again, and types it. Missed words come back with
spaced repetition. Progress syncs through the family hub's Firebase project, and
first-try-correct words become hub tickets. Structure and back end are copied from
Les Cartes de Mamou (`C:\dev\mamou-french`); the look is its own (bee and honeycomb).

Status: working app. Back end, word bank (grades 5-12), spelling engine, screens, voice,
the bee/honeycomb look, and hub tickets are in. Not published yet (no GitHub repo or Pages). Live URL (once published): https://nssharpe.github.io/spell-hive/

## Ground rules

- **No build step.** Plain ES modules loaded by `index.html`. Use relative URLs only, with no leading `/`, because the site will live under `/spell-hive/` on GitHub Pages.
- **Shared origin.** Every Pages app on `nssharpe.github.io` shares localStorage and the Cache API.
  - All data lives under the single key `spell-hive:v1` (`js/store.js`).
  - The service worker (when added) touches only caches that start with `spell-hive-`.
- **Light theme only** (`color-scheme: light`). Every text/background pair must pass WCAG AA; resolve the tokens and compute the ratios.
- **`translate="no"`** on `<html>` plus `<meta name="google" content="notranslate">`. The answer input uses `autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"`.
- **Pure logic stays pure.** `srs.js`, `session.js`, `store.js`, `sync.js` and `util.js` must not touch the DOM at import time, because `npm test` imports them in node. `cloud.js` only touches `fetch`/`navigator` when called.
- **New JS files** must be added to the service worker's `SHELL` list once `sw.js` exists.

## Files

| File | What it does |
|---|---|
| `js/srs.js` | Anki SM-2 (copied as is from Les Cartes). States new/learning/review/relearning, 4am day start. `formatDelay` still returns French suffixes (`j`, `mois`, `an`); fix it if a screen ever shows intervals. |
| `js/session.js` | One card per word, id `w:<wordId>`. `Session` (learning cards come back in-session with a 20-minute learn-ahead). |
| `js/spell.js` | `normalize`, `checkSpelling` (+ letter diff), `recordAttempt` (history, `card.miss`, stats; does not schedule), `buildSpellingQueue`. |
| `js/level.js` | `updateGrade` (adapts grade from first-try rates since `gradeChangedAt`), `placementStart`. |
| `js/store.js` | Data model, `loadDB`/`saveDB`/`migrate`, kids, custom-word edits with tombstones. |
| `js/sync.js` | Pure three-way merge (base / local / remote), `syncDoc`/`applyDoc`, `isHubCode`. |
| `js/cloud.js` | Firestore REST: pull, `merge3`, conditional PATCH, retried on conflict. |
| `js/app.js` | Singleton `app` (db, save, go, sync) and the sync loop. |
| `js/main.js` | Hash router. Screens live in `js/screens/*`, each exporting `render({pid, arg, params})`. |
| `js/ui.js`, `js/fx.js` | Modals, confirm, `setView` (also draws the top bar, with "← Hub" when the device came from the hub); confetti, toasts, floaters. |
| `js/hub-client.js` | Copied verbatim from `nssharpe/family-hub` `js/hub-client.js` (first line is the only difference). Keep identical. `readHandoff`, `createOutbox`, `getHub`, `effectiveSettings`. |
| `js/practice-core.js` | `applyAnswer`: the per-answer bookkeeping, pure. recordAttempt, ticket unit and updateGrade only on a word's FIRST showing in a session (R13); every showing schedules the SRS card. |
| `js/routes.js` | Route table, `resolve`, `redirectFor` (unknown kid goes home). Pure. |
| `js/hubtickets.js` | `awardTickets`, `settleSession`, hub-rate cache (`spell-hive:hub-settings`), outbox key (`spell-hive:outbox`). Pure. |
| `js/audio.js` | English voice picking (en-US, en-GB, any en), `sayWord` ("word. sentence. word."), `voicesReady`, sound effects. |
| `js/art.js` | Bea the bee (moods happy/wow/sad/wink/think) and a hex shape, as inline SVG. |
| `js/screens/` | `home.js` (players, kid page), `practice.js` (+ `summary.js`, not a route), `placement.js`, `grownups.js`, `common.js` (prompt, diff rows). |

## Practice rules

- `recordAttempt`, the ticket unit and `updateGrade` happen only on a word's FIRST showing in a session. A card still in learning steps comes back later in the same session (learn-ahead); those re-shows only schedule the SRS card (AGAIN on a miss, GOOD on a right answer). The forced retype after a miss is never recorded.
- Grown-up (custom) words are logged with grade `'custom'`, so they never move the kid's grade (they still earn tickets).
- A ticket unit is banked only if the card was new or due before the answer (R17): the queue pads a short session with not-yet-due known cards, and those pay 0 (history and SRS still update). A miss on any showing stamps `card.miss`, so the word can't re-earn the same day.
- First-try-correct words are banked into `prog.ticketUnits` as they happen (only with a hub code and a hub kid, `zyler`/`kadyn`). `settleSession` turns whole multiples of `spellingWordsPerTicket` (hub rate, default 3) into one `spelling:<kid>:<ts>` event for the outbox; the remainder stays. Leaving mid-session still settles.
- Without an English voice (`voicesReady` waits ~1.5 s once), the prompt shows the sentence with the word blanked, plus the meaning, and replay is hidden.
- Placement (3 words per grade, stop at a grade with 2 misses) never records attempts or tickets; leaving part-way saves nothing.
- Listeners must go on a wrapper element a screen creates, not on `#app` (it outlives screens).
- Grown-ups is gated by the AMC 8 Quest parent password (SHA-256 only is in the source).
- The hub opens the app with `#hub=<code>&kid=<kid>`; `main.js` reads it before routing, joins sync with that code, and opens `#/p/<kid>`.

## Data model (`spell-hive:v1`)

```
{ v, profiles:[{id, name, avatar, u}], customWords:[Word], deleted:{id:ts},
  deletedProfiles:{id:ts}, progress:{[pid]: Progress},
  settings:{sound, voice, rate}, sync: null | {code, base, last}, hub: null | {code, kid} }
Word     = { id, word, sentence?, definition?, grade: 5..12 | 'custom', u? }
Progress = { cards:{[cardId]: Card}, grade, placementDone,
             history:[{wordId, grade (5..12, or 'custom' for grown-up words), firstTry, ts}] (last 200),
             gradeChangedAt, ticketUnits, stats:{attempted, firstTryRight}, days:{}, epoch }
```

- Built-in bank words are code (`data/grade5.js` to `grade12.js`), not in `db`. Only grown-up words live in `customWords`.
- Default kid ids are fixed (`zyler`, `kadyn`, the hub's canonical ids) so devices merge.
- Card ids are `w:<wordId>`. Word ids are stable, so edits keep progress.

## Sync (`sharpe-family` Firebase project)

- **Project:** `sharpe-family` (the family hub's project, on Nate's personal Google account, Spark plan). No SDK and no sign-in; REST calls only.
- **Document:** `spelling/<hubCode>`, where `<hubCode>` is the hub family code (`hub-xxxxx-xxxxx-xxxxx-xxxxx`). The code is the secret. The Firestore rules belong to the hub project.
- **Merge rules (`js/sync.js`):**
  - Cards: the latest `last` wins.
  - `history`: union by `(wordId, ts)`, newest 200 kept.
  - `ticketUnits`, `stats`, per-day numbers: counters, `remote + (local − base)`.
  - `grade`: the side that changed wins (local wins a tie). `placementDone`: a single value like grade (the side that changed it since the last sync wins, so "Run placement again" sticks); with no base, finished on either side counts.
  - `customWords`: last writer wins by `u`; deletions leave a tombstone in `deleted`, and the tombstone beats any edit older than it.
  - A progress reset bumps `epoch`, and the newest epoch wins outright.
  - Only cards of *tombstoned* words are dropped on merge. Built-in words are not in `customWords`, so never drop "cards for unknown words".
  - `db.sync.base` is the last synced document. Without a base (first join), the family's single values win and counters add.
- **Not synced:** `settings` (sound, voice, rate) and `hub` are per device.
- **Applying a sync:** `applyDoc` refills profile and progress objects in place, because open screens hold references to them. Don't replace them with new objects.
- **When it syncs:** 4 s after any `app.save()`, every 60 s while visible, and on visibility change or coming back online.

## Testing

`npm test` runs node's built-in test runner over `tests/*.test.js` (no network: `cloud.test.js` stubs `fetch`). For the UI, run `npm run serve` (port 8782, also `.claude/launch.json`) and click through. The browser caches ES modules aggressively; hard-reload while developing.
