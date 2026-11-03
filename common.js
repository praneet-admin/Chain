/* Shared by both versions: picks, fetch, rendering, race strip. */
const API = 'https://api-hub-50046202742.development.catalystappsail.in/api/mealdb';
const $ = (s) => document.querySelector(s);
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);

/* What the user can pick. Chicken is a SEARCH (level 1, 2000 ms) — the slow one.
   The rest are CATEGORIES (level 2, 1000 ms) — fast. Unicorn does not exist → 404. */
const PICKS = [
  { label: 'Chicken', path: '/search/chicken',    note: 'search, 2 s, slow' },
  { label: 'Goat',    path: '/category/Goat',     note: 'category, 1 s, fast' },
  { label: 'Seafood', path: '/category/Seafood',  note: 'category, 1 s' },
  { label: 'Dessert', path: '/category/Dessert',  note: 'category, 1 s' },
  { label: 'Unicorn', path: '/category/Unicorn',  note: 'not on the menu, 404' },
];

/* ---- fetch: every call is recorded so the race strip can draw it ---- */
const reqs = [];
async function getJson(path, sel, signal) {
  const row = { sel, path: decodeURIComponent(path), start: ms(), end: null, state: 'running' };
  reqs.push(row);
  try {
    const res = await fetch(API + path, { signal });
    if (!res.ok) { let m = `HTTP ${res.status}`; try { m = (await res.json()).error.message || m; } catch (_) {} throw new Error(m); }
    const data = await res.json();
    row.end = ms(); row.state = 'landed'; return data;
  } catch (err) {
    row.end = ms(); row.state = err.name === 'AbortError' ? 'aborted' : 'failed'; throw err;
  }
}
const markIgnored = (sel, path) => { const r = reqs.find((x) => x.sel === sel && x.path === decodeURIComponent(path)); if (r) r.state = 'ignored'; };

/* ---- rendering ---- */
let lastPick = null, shownBy = {}, names = {}, failedSel = null; // which selection painted each panel
function clearCard(pick, sel) {
  lastPick = { pick, sel }; shownBy = {}; names[sel] = pick.label; failedSel = null;
  $('#title').textContent = pick.label; $('#photo').removeAttribute('src');
  for (const p of ['meal', 'area', 'ingredient']) { $(`#${p} .body`).textContent = ''; $(`#${p} .who`).textContent = 'loading…'; }
}
function paint(panel, sel, html) {
  shownBy[panel] = sel;
  $(`#${panel} .body`).innerHTML = html;
  $(`#${panel} .who`).textContent = `from order ${sel} (${names[sel]}), ${(ms() / 1000).toFixed(1)}s`;
}
function fail(panel, sel, err) {
  shownBy[panel] = sel; if (panel === 'meal') failedSel = sel;
  $(`#${panel} .body`).innerHTML = `<span class="err">${err.message}</span>`;
  $(`#${panel} .who`).textContent = 'failed';
  if (panel === 'meal') for (const p of ['area', 'ingredient']) $(`#${p} .who`).textContent = 'skipped, needs the meal';
}
const mealHtml = (m) => { $('#photo').src = API + m.thumb.replace('/api/mealdb', ''); return `<b>${m.name}</b><br>${m.ingredients.slice(0, 5).map((i) => i.name).join(', ')}…`; };
const areaHtml = (a) => `<b>${a.area}</b> cuisine · ${a.count} recipes · ${a.meals.slice(0, 3).map((x) => x.name).join(', ')}…`;
const ingHtml  = (i) => `<b>${i.name}</b> · ${i.description ? i.description.slice(0, 140) + '…' : 'no description'}`;

/* ---- race strip ---- */
function drawRace() {
  if (!reqs.length) return;
  const now = ms(), start = reqs[0].start;
  const span = Math.max(5000, (reqs.some((r) => !r.end) ? now : Math.max(...reqs.map((r) => r.end))) - start + 200);
  const pct = (t) => ((t - start) / span) * 100;
  $('#track').innerHTML = reqs.map((r) => { const end = r.end ?? now;
    return `<div class="row"><span class="lbl"><em>${r.sel}</em> ${r.path}</span><span class="lane"><span class="bar ${r.state}" style="left:${pct(r.start)}%;width:${pct(end) - pct(r.start)}%">${((end - r.start) / 1000).toFixed(1)}s ${r.state}</span></span></div>`; }).join('');
  const v = $('#verdict');
  if (!lastPick || shownBy.meal === undefined) { v.hidden = true; return; }
  const sels = [...new Set(Object.values(shownBy))];
  const ok = sels.length === 1 && sels[0] === lastPick.sel;
  v.hidden = false; v.className = ok ? 'good' : 'bad';
  const got = sels.map((x) => names[x]);
  if (failedSel === lastPick.sel) { v.className = 'bad'; v.textContent = `You asked for ${lastPick.pick.label}. The kitchen could not make it.`; return; }
  v.textContent = ok ? `You asked for ${lastPick.pick.label}. You got ${lastPick.pick.label}.`
    : got.length === 1 ? `You asked for ${lastPick.pick.label}. You got ${got[0]}.`
    : `You asked for ${lastPick.pick.label}. You got a mix of ${got.join(' and ')}.`;
}
(function tick() { drawRace(); requestAnimationFrame(tick); })();

/* ---- buttons ---- */
function buildButtons(onPick) {
  $('#picks').innerHTML = PICKS.map((p, i) => `<button data-i="${i}"><b>${p.label}</b><small>${p.note}</small></button>`).join('');
  let n = 0; $('#picks').addEventListener('click', (e) => { if (e.target.closest('button')) { n++; $('#order').textContent = `order ${n}`; } });
  $('#picks').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return;
    $('#picks').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); onPick(PICKS[b.dataset.i]); });
  $('#reset').addEventListener('click', () => { reqs.length = 0; lastPick = null; shownBy = {}; $('#track').innerHTML = ''; $('#verdict').hidden = true; });
}
