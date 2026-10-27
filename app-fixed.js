/* FIXED VERSION — everything on screen belongs to the most recent selection.

   Two counters, because the page has two things the user can select:
     listSel  — bumps on every search / category click
     mealSel  — bumps on every meal click, AND on every list click
                (a new list replaces the meals, so the recipe pane is cleared too)
   Each request keeps the number it was started for. After EVERY await it asks
   "is my number still the latest?" and returns before rendering if not.
   Counters only go up, so a stale response can never become fresh again.

   AbortController is added as a bonus: it drops the old connections so the
   Network panel shows them as (canceled). It is best-effort — a response that
   already finished still resolves — so the counter check stays. ?noabort=1 turns it off. */

const USE_ABORT = !location.search.includes('noabort');
let listSel = 0, mealSel = 0;
let listCtl = null, mealCtl = null;
const abortable = () => { const c = USE_ABORT ? new AbortController() : null; return [c, c ? c.signal : undefined]; };

async function showList(sel) {
  const my = ++listSel; ++mealSel;                       // a new list also retires the old recipe
  if (listCtl) listCtl.abort(); if (mealCtl) mealCtl.abort();
  let signal; [listCtl, signal] = abortable();
  const id = `list#${my}`;
  const stale = () => my !== listSel;                    // THE CHECK

  setListLoading(listTitle(sel), 'loading…');
  clearRecipe('Pick a meal'); for (const p of PANELS) setStatus(p, '', 'idle');
  log(id, `${listTitle(sel)} → GET ${listPath(sel)}`, 'start');
  try {
    const data = await getJson(listPath(sel), { signal, sel: id });
    if (stale()) { log(id, `ignored (stale) ${listPath(sel)} (${data.count} meals)`, 'stale'); return; }
    log(id, `✓ ${listPath(sel)} (${data.count} meals)`, 'done');
    renderList(data, showRecipe);
  } catch (err) {
    if (stale()) { log(id, `ignored (stale) ${listPath(sel)}: ${err.message}`, 'stale'); return; }
    log(id, `✗ ${listPath(sel)} failed: ${err.message}`, 'error');
    renderListError(err);
  }
}

async function showRecipe(mealId, name) {
  const my = ++mealSel;
  if (mealCtl) mealCtl.abort();
  let signal; [mealCtl, signal] = abortable();
  const id = `meal#${my}`;
  const stale = () => my !== mealSel;                    // THE CHECK

  clearRecipe(name);
  log(id, `${name} → GET /meal/${mealId}`, 'start');

  let m;
  try { m = (await getJson(`/meal/${mealId}`, { signal, sel: id })).meal; }
  catch (err) {
    if (stale()) { log(id, `ignored (stale) /meal/${mealId}: ${err.message}`, 'stale'); return; }
    log(id, `✗ /meal/${mealId} failed: ${err.message}`, 'error'); renderError('meal', err); return;
  }
  if (stale()) { log(id, `ignored (stale) /meal/${mealId} (${m.name})`, 'stale'); return; }
  log(id, `✓ /meal/${mealId} (${m.name})`, 'done');
  renderMeal(m);

  // area and ingredient both need only the meal → start together
  const ing = m.ingredients[0].name;
  log(id, `→ GET /area/${m.area}  +  GET /ingredient/${ing} (together)`, 'start');
  const areaP = !m.area ? Promise.resolve(renderArea({ area: '—', count: 0, meals: [] }))
    : getJson(`/area/${enc(m.area)}`, { signal, sel: id })
      .then((a) => { if (stale()) { log(id, `ignored (stale) /area/${a.area}`, 'stale'); return; } log(id, `✓ /area/${a.area}`, 'done'); renderArea(a); })
      .catch((err) => { if (stale()) { log(id, `ignored (stale) area`, 'stale'); return; } log(id, `✗ area failed: ${err.message}`, 'error'); renderError('area', err); });
  const ingP = getJson(`/ingredient/${enc(ing)}`, { signal, sel: id })
    .then((r) => { if (stale()) { log(id, `ignored (stale) /ingredient/${r.ingredient.name}`, 'stale'); return null; } log(id, `✓ /ingredient/${r.ingredient.name}`, 'done'); renderIngredient(r.ingredient); return r.ingredient; })
    .catch((err) => { if (stale()) { log(id, `ignored (stale) ingredient`, 'stale'); return null; } log(id, `✗ ingredient failed: ${err.message}`, 'error'); renderError('ingredient', err); return null; });

  // by-ingredient needs the canonical name from /ingredient → waits for that one only
  const canon = await ingP;
  if (canon && !stale()) {
    log(id, `→ GET /by-ingredient/${canon.name} (needs ingredient)`, 'start');
    try {
      const s = await getJson(`/by-ingredient/${enc(canon.name)}`, { signal, sel: id });
      if (stale()) { log(id, `ignored (stale) /by-ingredient/${s.ingredient}`, 'stale'); return; }
      log(id, `✓ /by-ingredient/${s.ingredient} (${s.count})`, 'done'); renderShared(s);
    } catch (err) {
      if (stale()) { log(id, `ignored (stale) by-ingredient`, 'stale'); return; }
      log(id, `✗ by-ingredient failed: ${err.message}`, 'error'); renderError('shared', err);
    }
  }
  await areaP;
}

wire(showList);
