/* BROKEN — paint whatever comes back, whenever it comes back. */
let count = 0;

async function show(pick) {
  const sel = ++count;                       // only a label; never checked
  clearCard(pick, sel);

  // 1. entry — nothing else can start before it: the meal id is inside it
  let list;
  try { list = await getJson(pick.path, sel); }
  catch (err) { fail('meal', sel, err); return; }

  // 2. meal — needs the id from step 1
  let meal;
  try { meal = (await getJson(`/meal/${list.meals[0].id}`, sel)).meal; }
  catch (err) { fail('meal', sel, err); return; }
  paint('meal', sel, mealHtml(meal));        // <- no check: whatever arrives, paints

  // 3. area + ingredient — both need only the meal, so they start together
  getJson(`/area/${encodeURIComponent(meal.area)}`, sel)
    .then((a) => paint('area', sel, areaHtml(a)))
    .catch((err) => fail('area', sel, err));
  getJson(`/ingredient/${encodeURIComponent(meal.ingredients[0].name)}`, sel)
    .then((i) => paint('ingredient', sel, ingHtml(i.ingredient)))
    .catch((err) => fail('ingredient', sel, err));
}

buildButtons(show);
