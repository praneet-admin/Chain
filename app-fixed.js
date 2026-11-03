/* FIXED — everything on screen belongs to the most recent pick.
   Each click gets a number. After every await the chain asks
   "is my number still the newest?" and stops if not. The number only
   goes up, so an old response can never become fresh again.
   AbortController also cancels the old chain, but that is best-effort —
   a response already downloaded still resolves — so the check stays. */
let latest = 0;
let controller = null;

async function show(pick) {
  const sel = ++latest;                      // this click's number
  if (controller) controller.abort();        // cancel the previous chain
  controller = new AbortController();
  const { signal } = controller;
  const stale = () => sel !== latest;        // THE CHECK
  clearCard(pick, sel);

  // 1. entry — nothing else can start before it
  let list;
  try { list = await getJson(pick.path, sel, signal); }
  catch (err) { if (!stale()) fail('meal', sel, err); return; }
  if (stale()) { markIgnored(sel, pick.path); return; }

  // 2. meal — needs the id from step 1
  const mealPath = `/meal/${list.meals[0].id}`;
  let meal;
  try { meal = (await getJson(mealPath, sel, signal)).meal; }
  catch (err) { if (!stale()) fail('meal', sel, err); return; }
  if (stale()) { markIgnored(sel, mealPath); return; }
  paint('meal', sel, mealHtml(meal));

  // 3. area + ingredient — start together; each checks on its own return
  const areaPath = `/area/${encodeURIComponent(meal.area)}`;
  const ingPath = `/ingredient/${encodeURIComponent(meal.ingredients[0].name)}`;
  getJson(areaPath, sel, signal)
    .then((a) => stale() ? markIgnored(sel, areaPath) : paint('area', sel, areaHtml(a)))
    .catch((err) => { if (!stale()) fail('area', sel, err); });
  getJson(ingPath, sel, signal)
    .then((i) => stale() ? markIgnored(sel, ingPath) : paint('ingredient', sel, ingHtml(i.ingredient)))
    .catch((err) => { if (!stale()) fail('ingredient', sel, err); });
}

buildButtons(show);
