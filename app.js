/* Recipe card — one page, two modes.
   Every order runs the same chain:  order → meal → (cuisine + ingredient together)
   broken: every answer is painted when it arrives.
   fixed:  an answer is painted only if its order is still the newest. */

const API = 'https://api-hub-50046202742.development.catalystappsail.in/api/mealdb';
const $ = (s) => document.querySelector(s);
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);

const PICKS = [
  { label: 'Chicken', path: '/search/chicken',   note: 'search · 2 s · slow' },
  { label: 'Goat',    path: '/category/Goat',    note: 'category · 1 s · fast' },
  { label: 'Seafood', path: '/category/Seafood', note: 'category · 1 s' },
  { label: 'Dessert', path: '/category/Dessert', note: 'category · 1 s' },
  { label: 'Unicorn', path: '/category/Unicorn', note: 'not on the menu · 404' },
];
const HINT = {
  broken: 'Order Chicken (slow), then Goat (fast) straight away. Goat lands first, then the older Chicken answer paints over it.',
  fixed:  'Same test: Chicken, then Goat straight away. The Chicken answer is cancelled or ignored and the card stays Goat.',
};

let mode = 'broken';
let latest = 0;            // number of the newest order
let controller = null;     // cancels the previous order's requests (fixed mode only)
let lastPick = null, names = {}, nums = {}, orderNo = 0, shownBy = {}, failedSel = null;
const reqs = [];

/* ================== THE PART THAT PREVENTS STALE DATA ==================
   Each click gets a number (sel). After every await the chain asks
   "is my number still the newest?". In fixed mode a stale chain stops
   before it paints anything; in broken mode the question is never asked. */
const isStale = (sel) => mode === 'fixed' && sel !== latest;
/* ======================================================================= */

async function order(pick) {
  const sel = ++latest;
  if (mode === 'fixed') { if (controller) controller.abort(); controller = new AbortController(); }
  const signal = mode === 'fixed' ? controller.signal : undefined;
  clearCard(pick, sel);

  // 1. the order — nothing else can start before it: the meal id is inside it
  let list;
  try { list = await get(pick.path, sel, signal); }
  catch (err) { if (!isStale(sel)) fail('meal', sel, err); return; }
  if (isStale(sel)) { ignore(sel, pick.path); return; }

  // 2. the meal — needs the id from step 1
  const mealPath = `/meal/${list.meals[0].id}`;
  let meal;
  try { meal = (await get(mealPath, sel, signal)).meal; }
  catch (err) { if (!isStale(sel)) fail('meal', sel, err); return; }
  if (isStale(sel)) { ignore(sel, mealPath); return; }
  paint('meal', sel, mealHtml(meal));

  // 3. cuisine + ingredient — both need only the meal, so they start together
  const areaPath = `/area/${encodeURIComponent(meal.area)}`;
  const ingPath = `/ingredient/${encodeURIComponent(meal.ingredients[0].name)}`;
  if (!meal.area) paint('area', sel, 'No cuisine listed for this meal, so nothing to request.');
  else get(areaPath, sel, signal)
    .then((a) => isStale(sel) ? ignore(sel, areaPath) : paint('area', sel, areaHtml(a)))
    .catch((err) => { if (!isStale(sel)) fail('area', sel, err); });
  get(ingPath, sel, signal)
    .then((i) => isStale(sel) ? ignore(sel, ingPath) : paint('ingredient', sel, ingHtml(i.ingredient)))
    .catch((err) => { if (!isStale(sel)) fail('ingredient', sel, err); });
}

/* ---- fetch: every request is recorded for the board ---- */
async function get(path, sel, signal) {
  const row = { sel, path: decodeURIComponent(path), start: ms(), end: null, state: 'running' };
  reqs.push(row);
  try {
    const res = await fetch(API + path, { signal });
    if (!res.ok) { let m = `HTTP ${res.status}`; try { m = (await res.json()).error.message || m; } catch (_) {} throw new Error(m); }
    const data = await res.json();
    row.end = ms(); row.state = 'landed'; return data;
  } catch (err) {
    row.end = ms(); row.state = err.name === 'AbortError' ? 'cancelled' : 'failed'; throw err;
  }
}
function ignore(sel, path) { const r = reqs.find((x) => x.sel === sel && x.path === decodeURIComponent(path)); if (r) r.state = 'ignored'; }

/* ---- card ---- */
function clearCard(pick, sel) {
  lastPick = { pick, sel }; names[sel] = pick.label; nums[sel] = ++orderNo; shownBy = {}; failedSel = null;
  $('#title').textContent = `${pick.label}`; $('#photo').removeAttribute('src'); $('#photo').hidden = true;
  for (const p of ['meal', 'area', 'ingredient']) { $(`#${p} .body`).textContent = ''; $(`#${p} .who`).textContent = 'loading'; }
}
function paint(panel, sel, html) {
  shownBy[panel] = sel;
  $(`#${panel} .body`).innerHTML = html;
  $(`#${panel} .who`).textContent = `from order ${nums[sel]}, ${names[sel]}`;
  draw();
}
function fail(panel, sel, err) {
  shownBy[panel] = sel; if (panel === 'meal') failedSel = sel;
  $(`#${panel} .body`).innerHTML = `<span class="err">${err.message}</span>`;
  $(`#${panel} .who`).textContent = 'failed';
  if (panel === 'meal') for (const p of ['area', 'ingredient']) $(`#${p} .who`).textContent = 'skipped, needs the meal';
  draw();
}
const mealHtml = (m) => { $('#photo').src = API + m.thumb.replace('/api/mealdb', ''); $('#photo').hidden = false; return `<b>${m.name}</b> — ${m.ingredients.slice(0, 5).map((i) => i.name).join(', ')}`; };
const areaHtml = (a) => `<b>${a.area}</b>, ${a.count} recipes — ${a.meals.slice(0, 3).map((x) => x.name).join(', ')}`;
const ingHtml  = (i) => `<b>${i.name}</b> — ${i.description ? i.description.slice(0, 120) + '…' : 'no description'}`;

/* ---- board: bars + verdict ---- */
function draw() {
  if (!reqs.length) { $('#track').innerHTML = ''; $('#verdict').hidden = true; return; }
  const now = ms(), start = reqs[0].start;
  const span = Math.max(5000, (reqs.some((r) => !r.end) ? now : Math.max(...reqs.map((r) => r.end))) - start + 200);
  const pct = (t) => ((t - start) / span) * 100;
  $('#track').innerHTML = reqs.map((r) => { const end = r.end ?? now;
    return `<div class="row"><span class="lbl"><b>${nums[r.sel]}</b> ${r.path}</span><span class="lane"><span class="bar ${r.state}" style="left:${pct(r.start)}%;width:${pct(end) - pct(r.start)}%">${((end - r.start) / 1000).toFixed(1)}s ${r.state}</span></span></div>`; }).join('');
  const v = $('#verdict');
  if (!lastPick || shownBy.meal === undefined) { v.hidden = true; return; }
  const want = lastPick.pick.label, got = [...new Set(Object.values(shownBy))].map((s) => names[s]);
  v.hidden = false;
  if (failedSel === lastPick.sel) { v.className = 'bad'; v.textContent = `You asked for ${want}. The kitchen could not make it.`; return; }
  const ok = got.length === 1 && got[0] === want;
  v.className = ok ? 'good' : 'bad';
  v.textContent = ok ? `You asked for ${want}. You got ${want}.`
    : got.length === 1 ? `You asked for ${want}. You got ${got[0]}.` : `You asked for ${want}. You got a mix of ${got.join(' and ')}.`;
}
(function tick() { if (reqs.some((r) => !r.end)) draw(); requestAnimationFrame(tick); })();

/* ---- controls ---- */
function setMode(m) {
  mode = m; document.body.dataset.mode = m; $('#hint').textContent = HINT[m];
  document.querySelectorAll('.switch button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
  reset();
}
function reset() {
  if (controller) controller.abort(); controller = null;
  latest++; orderNo = 0; reqs.length = 0; lastPick = null; shownBy = {}; failedSel = null;
  $('#title').textContent = 'Nothing ordered yet'; $('#photo').hidden = true; $('#photo').removeAttribute('src');
  for (const p of ['meal', 'area', 'ingredient']) { $(`#${p} .body`).textContent = ''; $(`#${p} .who`).textContent = ''; }
  document.querySelectorAll('#picks button').forEach((b) => b.classList.remove('active'));
  draw();
}
$('#picks').innerHTML = PICKS.map((p, i) => `<button type="button" data-i="${i}"><b>${p.label}</b><small>${p.note}</small></button>`).join('');
$('#picks').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#picks button').forEach((x) => x.classList.toggle('active', x === b)); order(PICKS[b.dataset.i]); draw(); });
document.querySelectorAll('.switch button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#reset').addEventListener('click', reset);
setMode('broken');
