/* Shared by BOTH versions: API helper, rendering, wiring. Nothing here
   decides whether a response is stale — see app-broken.js / app-fixed.js. */
const API = 'https://api-hub-50046202742.development.catalystappsail.in/api/mealdb';
const $ = (s) => document.querySelector(s);
const enc = encodeURIComponent;
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);

/* Every request is recorded here so the race view can draw it. */
const reqs = [];
let roundStart = 0;
async function getJson(path, { signal, sel } = {}) {
  const now = ms();
  const lastEnd = reqs.length ? Math.max(...reqs.map((r) => r.end ?? Infinity)) : -Infinity;
  if (!reqs.some((r) => !r.end) && now - lastEnd > 4000) { reqs.length = 0; roundStart = now; } // a new round
  const row = { sel, path: decodeURIComponent(path), start: now, end: null, state: 'running' };
  reqs.push(row);
  try {
    const res = await fetch(API + path, { signal });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error.message || msg; } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    row.end = ms(); row.state = 'landed'; drawRace();
    return data;
  } catch (err) {
    row.end = ms(); row.state = err.name === 'AbortError' ? 'aborted' : 'failed'; drawRace();
    throw err;
  }
}

/* ---------- race view: timeline bars + verdict ---------- */
const isList = (r) => r.path.startsWith('/search/') || r.path.startsWith('/category/');
const isMeal = (r) => r.path.startsWith('/meal/');
function verdictFor(kind, filter) {
  const rows = reqs.filter(filter);
  if (!rows.length) return null;
  const wanted = rows[rows.length - 1];                               // last one the user asked for
  const landed = rows.filter((r) => r.state === 'landed').sort((a, b) => a.end - b.end);
  const shown = landed[landed.length - 1];                             // last one that painted
  const open = rows.some((r) => r.state === 'running');
  if (!shown) return { ok: null, text: `${kind}: waiting for ${wanted.sel} ${wanted.path}…` };
  if (shown.sel === wanted.sel) return { ok: true, text: `${kind}: showing ${shown.sel} ${shown.path} — the last one you picked${open ? ' (older requests still open)' : ''}` };
  return { ok: false, text: `${kind}: you picked ${wanted.sel} ${wanted.path} last — the page is showing ${shown.sel} ${shown.path}` };
}
function drawRace() {
  const track = $('#track'); if (!track) return;
  const now = ms();
  const span = Math.max(6000, (reqs.some((r) => !r.end) ? now : Math.max(...reqs.map((r) => r.end))) - roundStart + 300);
  const pct = (t) => `${Math.max(0, Math.min(100, ((t - roundStart) / span) * 100))}%`;
  track.innerHTML = reqs.map((r) => {
    const end = r.end ?? now;
    return `<div class="tl__row"><span class="tl__label"><b>${r.sel ?? 'load'}</b> ${r.path}</span><span class="tl__lane">` +
      `<span class="tl__bar tl__bar--${r.state}" style="left:${pct(r.start)};width:${pct(end).slice(0, -1) - pct(r.start).slice(0, -1)}%">${((end - r.start) / 1000).toFixed(1)}s ${r.state}</span></span></div>`;
  }).join('');
  const ticks = []; for (let t = 0; t <= span; t += 1000) ticks.push(`<span class="tl__tick" style="left:${pct(roundStart + t)}">${t / 1000}s</span>`);
  $('#axis').innerHTML = ticks.join('');
  const v = [verdictFor('Meal list', isList), verdictFor('Recipe', isMeal)].filter(Boolean);
  const el = $('#verdict');
  el.innerHTML = v.map((x) => `<span class="${x.ok === null ? 'wait' : x.ok ? 'good' : 'bad'}">${x.text}</span>`).join('');
  el.hidden = !v.length;
}
(function tick() { if (reqs.some((r) => !r.end)) drawRace(); requestAnimationFrame(tick); })();

/* ---------- on-page log (so the demo can be followed without DevTools) ---------- */
function log(sel, text, kind = '') {
  if (kind === 'stale') { const r = [...reqs].reverse().find((x) => x.sel === sel && text.includes(x.path)); if (r) { r.state = 'ignored'; drawRace(); } }
  const li = document.createElement('li'); li.className = kind;
  li.innerHTML = `<span class="t">${String(ms()).padStart(5)} ms</span><span class="sel">${sel}</span>${text}`;
  $('#log').prepend(li);
}

/* ---------- list side ---------- */
function setListLoading(title, sub) {
  $('#listTitle').textContent = title; $('#listSub').textContent = sub; $('#meals').innerHTML = '';
}
function renderList(data, onPick) {
  $('#listSub').textContent = `${data.count} meals`;
  $('#meals').innerHTML = data.meals.map((m) =>
    `<li><button data-id="${m.id}"><img src="${API}${m.thumb.replace('/api/mealdb', '')}" alt=""><span>${m.name}<small>${m.country ?? m.area ?? ''}</small></span></button></li>`).join('');
  $('#meals').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    $('#meals').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    onPick(b.dataset.id, b.textContent);
  }));
}
function renderListError(err) {
  $('#listSub').textContent = 'failed';
  $('#meals').innerHTML = `<li class="err">${err.message}</li>`;
}

/* ---------- recipe side ---------- */
const PANELS = ['meal', 'area', 'ingredient', 'shared'];
const DEPENDANTS = { meal: ['area', 'ingredient', 'shared'], area: [], ingredient: ['shared'], shared: [] };
function setStatus(p, text, kind) { const el = $(`#${p} .status`); el.textContent = text; el.className = `status ${kind}`; }
function clearRecipe(title) {
  $('#recipeTitle').textContent = title; $('#hero').removeAttribute('src');
  for (const p of PANELS) { $(`#${p} .body`).innerHTML = ''; setStatus(p, 'loading…', 'loading'); }
}
function renderMeal(m) {
  $('#recipeTitle').textContent = m.name;
  $('#hero').src = API + m.image.replace('/api/mealdb', ''); $('#hero').alt = m.name;
  $('#meal .body').innerHTML =
    `<p class="muted">${m.category ?? ''} · ${m.area ?? 'no area'} · ${m.tags.join(', ') || 'no tags'}</p>` +
    `<ul class="ings">${m.ingredients.map((i) => `<li>${i.measure ?? ''} ${i.name}</li>`).join('')}</ul>` +
    `<p>${m.instructions.slice(0, 2).join(' ')}</p>`;
  setStatus('meal', 'done', 'done');
}
function renderArea(a) {
  $('#area .body').innerHTML = `<p><b>${a.area}</b> cuisine has ${a.count} recipes here: ${a.meals.slice(0, 6).map((x) => x.name).join(', ')}${a.count > 6 ? '…' : ''}</p>`;
  setStatus('area', 'done', 'done');
}
function renderIngredient(i) {
  $('#ingredient .body').innerHTML = `<p><b>${i.name}</b>${i.type ? ` · ${i.type}` : ''}</p><p>${i.description ? i.description.slice(0, 260) + '…' : '<span class="muted">no description in the dataset</span>'}</p>`;
  setStatus('ingredient', 'done', 'done');
}
function renderShared(s) {
  $('#shared .body').innerHTML = `<p>${s.count} recipes use <b>${s.ingredient}</b>: ${s.meals.slice(0, 8).map((x) => x.name).join(', ')}${s.count > 8 ? '…' : ''}</p>`;
  setStatus('shared', 'done', 'done');
}
function renderError(p, err) {
  $(`#${p} .body`).innerHTML = `<p class="err">${err.message}</p>`; setStatus(p, 'failed', 'error');
  for (const d of DEPENDANTS[p]) setStatus(d, `skipped · needs ${p}`, 'error');
}

/* ---------- wiring: search box, category chips (level 1 on load) ---------- */
function wire(onList) {
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#q').value.trim(); if (!q) return;
    $('#chips').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    onList({ kind: 'search', key: q });
  });
  log('load', '→ GET /categories (level 1, 2000 ms) builds the chips', 'start');
  getJson('/categories', { sel: 'load' }).then((d) => {
    log('load', `✓ /categories (${d.count})`, 'done');
    $('#chips').innerHTML = d.categories.map((c) => `<button class="chip" type="button" data-name="${c.name}">${c.name}</button>`).join('');
    $('#chips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
      $('#chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
      $('#q').value = '';
      onList({ kind: 'category', key: c.dataset.name });
    }));
  }).catch((err) => { log('load', `✗ /categories failed: ${err.message}`, 'error'); $('#chips').innerHTML = `<span class="err">categories failed: ${err.message}</span>`; });
}
const listPath = (sel) => sel.kind === 'search' ? `/search/${enc(sel.key)}` : `/category/${enc(sel.key)}`;
const listTitle = (sel) => sel.kind === 'search' ? `Search “${sel.key}”` : sel.key;
