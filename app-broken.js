/* BROKEN VERSION — paint whatever arrives, whenever it arrives. */
let clicks = 0;                                   // for the log only; never checked

/* A list selection: search (level 1, 2000 ms) or category (level 2, 1000 ms). */
async function showList(sel) {
  const id = `list#${++clicks}`;
  setListLoading(listTitle(sel), 'loading…');
  log(id, `${listTitle(sel)} → GET ${listPath(sel)}`, 'start');
  try {
    const data = await getJson(listPath(sel), { sel: id });
    log(id, `✓ ${listPath(sel)} (${data.count} meals)`, 'done');
    renderList(data, showRecipe);                 // <- no check: paints whatever arrived
  } catch (err) {
    log(id, `✗ ${listPath(sel)} failed: ${err.message}`, 'error');
    renderListError(err);
  }
}

/* A meal selection: meal (L3) → area + ingredient together (L4) → by-ingredient (L5). */
async function showRecipe(mealId, name) {
  const id = `meal#${++clicks}`;
  clearRecipe(name);
  log(id, `${name} → GET /meal/${mealId}`, 'start');

  let m;
  try { m = (await getJson(`/meal/${mealId}`, { sel: id })).meal; }
  catch (err) { log(id, `✗ /meal/${mealId} failed: ${err.message}`, 'error'); renderError('meal', err); return; }
  log(id, `✓ /meal/${mealId} (${m.name})`, 'done');
  renderMeal(m);                                  // <- no check

  // area and ingredient both need only the meal → start together
  const ing = m.ingredients[0].name;
  log(id, `→ GET /area/${m.area}  +  GET /ingredient/${ing} (together)`, 'start');
  const areaP = !m.area ? Promise.resolve(renderArea({ area: '—', count: 0, meals: [] }))
    : getJson(`/area/${enc(m.area)}`, { sel: id }).then((a) => { log(id, `✓ /area/${a.area}`, 'done'); renderArea(a); })
      .catch((err) => { log(id, `✗ area failed: ${err.message}`, 'error'); renderError('area', err); });
  const ingP = getJson(`/ingredient/${enc(ing)}`, { sel: id })
    .then((r) => { log(id, `✓ /ingredient/${r.ingredient.name}`, 'done'); renderIngredient(r.ingredient); return r.ingredient; })
    .catch((err) => { log(id, `✗ ingredient failed: ${err.message}`, 'error'); renderError('ingredient', err); });

  // by-ingredient needs the canonical name from /ingredient → waits for that one only
  const canon = await ingP;
  if (canon) {
    log(id, `→ GET /by-ingredient/${canon.name} (needs ingredient)`, 'start');
    try { const s = await getJson(`/by-ingredient/${enc(canon.name)}`, { sel: id }); log(id, `✓ /by-ingredient/${s.ingredient} (${s.count})`, 'done'); renderShared(s); }
    catch (err) { log(id, `✗ by-ingredient failed: ${err.message}`, 'error'); renderError('shared', err); }
  }
  await areaP;
}

wire(showList);
