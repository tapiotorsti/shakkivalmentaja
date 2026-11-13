// ---------- Opi pelaamaan ----------
// Vaiheen tavoite: uci = täsmälleen nämä siirrot, to = mikä tahansa siirto näihin ruutuihin,
// any = mikä tahansa laillinen siirto, mate = siirto, joka tekee matin. Kaikissa asemissa valkea siirtää.
const LESSONS = [
  { id: "p", glyph: "p", name: "Sotilas", sub: "eteneminen, lyönti, korotus, ohestalyönti", steps: [
    { fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", goal: { uci: ["e2e4"] },
      text: "Sotilas liikkuu suoraan eteenpäin yhden ruudun. Ensimmäisellä siirrollaan se saa halutessaan edetä kaksi ruutua.",
      task: "Siirrä sotilas kaksi ruutua eteenpäin ruutuun e4.",
      done: "Taaksepäin sotilas ei koskaan liiku." },
    { fen: "4k3/8/8/3pp3/4P3/8/8/4K3 w - - 0 1", goal: { uci: ["e4d5"] },
      text: "Sotilas lyö vinottain yhden ruudun eteenpäin, ei suoraan. Edessä oleva nappula tukkii sen tien.",
      task: "Lyö musta sotilas ruudussa d5.",
      done: "Sotilas on ainoa nappula, joka lyö eri suuntaan kuin liikkuu." },
    { fen: "4k3/1P6/8/8/8/8/8/4K3 w - - 0 1", goal: { to: ["b8"] },
      text: "Kun sotilas pääsee viimeiselle riville, se korottuu: siitä tulee daami, torni, lähetti tai ratsu. Yleensä valitaan daami.",
      task: "Vie sotilas viimeiselle riville ja valitse uusi nappula.",
      done: "Korotus voi kääntää koko pelin, joten pitkälle edennyt sotilas on vaarallinen." },
    { fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", goal: { uci: ["e5d6"] },
      text: "Ohestalyönti: musta sotilas eteni juuri kaksi ruutua (d7 → d5) ja pysähtyi sotilaasi viereen. Saat lyödä sen kuin se olisi edennyt vain yhden ruudun, mutta vain heti tällä siirrolla.",
      task: "Lyö d5:n sotilas ohestalyönnillä: siirrä sotilas e5 → d6.",
      done: "Lyöty sotilas poistuu ruudusta d5, vaikka sotilaasi siirtyi ruutuun d6." }
  ] },
  { id: "r", glyph: "r", name: "Torni", sub: "suorat linjat ja lyönti", steps: [
    { fen: "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1", goal: { to: ["a4"] },
      text: "Torni liikkuu suoraan pysty- tai vaakasuunnassa niin pitkälle kuin tie on vapaa.",
      task: "Siirrä torni ruutuun a4.",
      done: "Torni on vahvimmillaan avoimilla linjoilla, joilla ei ole sotilaita." },
    { fen: "4k3/8/3P4/8/3R2n1/8/8/4K3 w - - 0 1", goal: { uci: ["d4g4"] },
      text: "Mikään nappula ei voi siirtyä oman nappulan ruutuun tai sen yli. Vastustajan nappulan saa lyödä siirtymällä sen ruutuun.",
      task: "Oma sotilas tukkii tien ylöspäin. Lyö musta ratsu.",
      done: "Lyöty nappula poistuu laudalta." }
  ] },
  { id: "b", glyph: "b", name: "Lähetti", sub: "vinot linjat", steps: [
    { fen: "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", goal: { to: ["h6"] },
      text: "Lähetti liikkuu vinottain niin pitkälle kuin tie on vapaa. Se pysyy koko pelin saman värisillä ruuduilla.",
      task: "Siirrä lähetti ruutuun h6.",
      done: "Kummallakin pelaajalla on yksi vaalearuutuinen ja yksi tummaruutuinen lähetti." },
    { fen: "4k3/8/5r2/8/8/8/1B6/4K3 w - - 0 1", goal: { uci: ["b2f6"] },
      text: "Lähetti lyö samalla tavalla kuin liikkuu: vinottain, jos tie on vapaa.",
      task: "Lyö musta torni.",
      done: "Torni on arvokkaampi kuin lähetti (5 ja 3), joten tämä vaihto kannattaa aina." }
  ] },
  { id: "n", glyph: "n", name: "Ratsu", sub: "L-muoto ja hypyt", steps: [
    { fen: "4k3/8/8/8/3N4/8/8/4K3 w - - 0 1", goal: { to: ["e6"] },
      text: "Ratsu liikkuu L-muodossa: kaksi ruutua yhteen suuntaan ja yksi sivulle. Se vaihtaa joka siirrolla ruudun väriä.",
      task: "Siirrä ratsu ruutuun e6.",
      done: "Keskellä lautaa ratsulla on jopa kahdeksan siirtoa, nurkassa vain kaksi." },
    { fen: "4k3/8/8/8/8/8/PPPPPPPP/1N2K3 w - - 0 1", goal: { uci: ["b1c3"] },
      text: "Ratsu on ainoa nappula, joka hyppää muiden nappuloiden yli.",
      task: "Hyppää sotilaiden yli ruutuun c3.",
      done: "Siksi ratsu pääsee peliin jo ensimmäisellä siirrolla." },
    { fen: "4k3/8/8/2b5/8/1N6/8/4K3 w - - 0 1", goal: { uci: ["b3c5"] },
      text: "Ratsu lyö siihen ruutuun, johon se hyppää.",
      task: "Lyö musta lähetti.",
      done: "Ratsun uhkaa on vaikea huomata, koska se tulee L-muodossa." }
  ] },
  { id: "q", glyph: "q", name: "Daami", sub: "vahvin nappula", steps: [
    { fen: "4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1", goal: { to: ["h8"] },
      text: "Daami liikkuu kuin torni ja lähetti yhdessä: suoraan tai vinottain niin pitkälle kuin tie on vapaa.",
      task: "Siirrä daami vinottain ruutuun h8.",
      done: "Daami h8:ssa uhkaa koko kahdeksatta riviä ja antaa shakin mustalle kuninkaalle." },
    { fen: "4k3/6r1/8/8/3Q4/8/8/4K3 w - - 0 1", goal: { uci: ["d4g7"] },
      text: "Daami on arvokkain nappula (noin 9 sotilasta), joten älä jätä sitä lyötäväksi.",
      task: "Lyö musta torni.",
      done: "Ennen siirtoa kannattaa aina tarkistaa, voiko vastustaja lyödä daamisi." }
  ] },
  { id: "k", glyph: "k", name: "Kuningas", sub: "turvallisuus ja linnoitus", steps: [
    { fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", goal: { to: ["e2"] },
      text: "Kuningas liikkuu yhden ruudun mihin suuntaan tahansa.",
      task: "Siirrä kuningas ruutuun e2.",
      done: "Kuningasta ei lyödä koskaan. Peli päättyy, kun se on matissa." },
    { fen: "4k3/8/8/8/8/8/r7/4K3 w - - 0 1", goal: { any: true },
      text: "Kuningas ei saa siirtyä ruutuun, jota vastustaja uhkaa. Musta torni uhkaa koko toista riviä.",
      task: "Siirrä kuningas turvalliseen ruutuun. Pisteet näyttävät sallitut ruudut.",
      done: "Sovellus ei hyväksy laittomia siirtoja, joten kuningas pysyy aina turvassa." },
    { fen: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", goal: { uci: ["e1g1", "e1c1"] },
      text: "Linnoitus: kuningas siirtyy kaksi ruutua tornia kohti, ja torni hyppää sen toiselle puolelle. Se on ainoa siirto, jossa liikkuu kaksi nappulaa.",
      task: "Linnoittaudu: siirrä kuningas kaksi ruutua kohti tornia (esim. e1 → g1).",
      done: "Linnoitus on sallittu vain, jos kuningas ja torni eivät ole liikkuneet, niiden välissä ei ole nappuloita eikä kuningas ole shakissa tai kulje uhatun ruudun kautta." }
  ] },
  { id: "m", glyph: "k", name: "Shakki ja matti", sub: "pelin tavoite", steps: [
    { fen: "4k3/8/8/8/8/8/8/r3K3 w - - 0 1", goal: { any: true },
      text: "Shakki tarkoittaa, että kuningasta uhataan. Shakki on aina torjuttava: siirrä kuningas, lyö uhkaaja tai asetu väliin.",
      task: "Kuninkaasi on shakissa. Pelasta se!",
      done: "Kun napautat nappulaa, sovellus näyttää vain shakin torjuvat siirrot." },
    { fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", goal: { mate: true },
      text: "Matti on shakki, jota ei voi torjua. Se voittaa pelin. Tässä mustan kuninkaan omat sotilaat estävät sitä pakenemasta.",
      task: "Tee matti yhdellä siirrolla.",
      done: "Tämä on takarivimatti, yksi yleisimmistä mateista. Jätä omalle kuninkaallesi pakoruutu." }
  ] }
];
const LESSON_KEY = "shakkivalmentaja.lessons";
const tutorial = { active: false, li: 0, si: 0, solved: false, note: "", noteCls: "", snapshot: null };
let lessonProgress = {};
try { lessonProgress = JSON.parse(localStorage.getItem(LESSON_KEY) || "{}"); } catch (e) { /* ignore */ }
const tempSnap = () => (tutorial.active && tutorial.snapshot) || (practice.active && practice.snapshot) || null;
const curStep = () => LESSONS[tutorial.li].steps[tutorial.si];

function tutorialGoalSquares() {
  if (!tutorial.active || tutorial.solved || game.history().length) return [];
  const g = curStep().goal;
  return g.to || (g.uci ? g.uci.map((u) => u.slice(2, 4)) : []);
}

function renderLessonList() {
  const list = $("lessonList");
  list.replaceChildren();
  LESSONS.forEach((l, i) => {
    const done = Math.min(lessonProgress[l.id] || 0, l.steps.length);
    const b = el("button", "lesson");
    b.type = "button";
    const glyph = el("span", "piece w", GLYPH[l.glyph] + "\uFE0E");
    const name = el("span", "lname", l.name);
    name.appendChild(el("small", null, l.sub));
    const prog = el("span", "lprog" + (done === l.steps.length ? " done" : ""), done === l.steps.length ? "✓ valmis" : done + "/" + l.steps.length);
    b.append(glyph, name, prog);
    b.addEventListener("click", () => startTutorial(i));
    list.appendChild(b);
  });
}

function startTutorial(li) {
  if (play.active && !playOver()) { setTab("now"); playMsg("Peli konetta vastaan on kesken. Lopeta tai luovuta se ensin.", true); return; }
  if (practice.active) exitPractice();
  if (!tutorial.active) {
    stopPlayMode();
    tutorial.snapshot = { pgn: game.pgn(), myColor: state.myColor, flipped: state.flipped, gameId: state.gameId };
    tutorial.active = true;
  }
  const l = LESSONS[li];
  const firstOpen = Math.min(lessonProgress[l.id] || 0, l.steps.length - 1);
  loadStep(li, (lessonProgress[l.id] || 0) >= l.steps.length ? 0 : firstOpen);
  setTab("now");
}

function loadStep(li, si) {
  Object.assign(tutorial, { li, si, solved: false, note: "", noteCls: "" });
  game.load(curStep().fen);
  variation = null; viewPly = null; selected = null; legalFromSel = [];
  state.myColor = "w"; state.flipped = false;
  syncSettingsUI(); rebuildView(); renderAll();
}

function exitTutorial() {
  const snap = tutorial.snapshot;
  Object.assign(tutorial, { active: false, snapshot: null });
  if (snap) {
    if (snap.pgn && snap.pgn.trim()) game.load_pgn(snap.pgn, PGN_OPTS); else game.reset();
    state.myColor = snap.myColor; state.flipped = snap.flipped; state.gameId = snap.gameId;
  }
  variation = null; viewPly = null; selected = null; legalFromSel = [];
  libSig = "";
  syncSettingsUI(); save(); rebuildView(); renderAll(); analyze(true);
  refreshLibraryUI();
}

function goalMet(goal, mv) {
  if (goal.any) return true;
  if (goal.mate) return game.in_checkmate();
  if (goal.uci) return goal.uci.includes(mv.from + mv.to);
  if (goal.to) return goal.to.includes(mv.to);
  return false;
}

function tutorialMove(m) {
  if (game.history().length) return;
  const step = curStep();
  const mv = game.move(m);
  if (!mv) { renderBoard(); return; }
  viewPly = null; rebuildView(); renderAll();
  if (goalMet(step.goal, mv)) {
    tutorial.solved = true;
    tutorial.note = "Oikein! " + step.done;
    tutorial.noteCls = "win";
    const l = LESSONS[tutorial.li];
    lessonProgress[l.id] = Math.max(lessonProgress[l.id] || 0, tutorial.si + 1);
    try { localStorage.setItem(LESSON_KEY, JSON.stringify(lessonProgress)); } catch (e) { /* ignore */ }
    renderAll();
    return;
  }
  const g = step.goal;
  tutorial.note = "Ei aivan. " + (g.mate ? "Tämä siirto ei tee mattia." : g.to || g.uci ? "Tavoiteruutu on merkitty katkoviivaympyrällä." : "") + " Yritä uudelleen.";
  tutorial.noteCls = "miss";
  renderTutorial();
  const at = { li: tutorial.li, si: tutorial.si };
  setTimeout(() => {
    if (tutorial.active && tutorial.li === at.li && tutorial.si === at.si && !tutorial.solved && game.history().length) {
      game.undo(); rebuildView(); renderAll();
    }
  }, 900);
}

function tutorialGo(delta) {
  let li = tutorial.li, si = tutorial.si + delta;
  if (si >= LESSONS[li].steps.length) { li++; si = 0; }
  if (si < 0) { li--; si = li >= 0 ? LESSONS[li].steps.length - 1 : 0; }
  if (li < 0) { li = 0; si = 0; }
  if (li >= LESSONS.length) { exitTutorial(); setTab("games"); return; }
  loadStep(li, si);
}

function renderTutorial() {
  const sec = $("tutorialSec");
  sec.hidden = !tutorial.active;
  if (!tutorial.active) return;
  const l = LESSONS[tutorial.li], step = curStep();
  $("tuHead").replaceChildren(el("span", null, "Opi pelaamaan"), el("span", "sep", "·"), el("span", null, l.name + " " + (tutorial.si + 1) + "/" + l.steps.length));
  $("tuText").textContent = step.text;
  $("tuTask").textContent = step.task;
  const note = $("tuNote");
  note.textContent = tutorial.note;
  note.className = "prnote" + (tutorial.noteCls ? " " + tutorial.noteCls : "");
  const actions = $("tuActions");
  actions.replaceChildren();
  const btn = (text, cls, fn) => { const b = el("button", "btn" + (cls ? " " + cls : ""), text); b.type = "button"; b.addEventListener("click", fn); actions.appendChild(b); return b; };
  const last = tutorial.si === l.steps.length - 1;
  const lastAll = last && tutorial.li === LESSONS.length - 1;
  if (tutorial.solved) btn(lastAll ? "Valmis" : last ? "Seuraava aihe: " + LESSONS[tutorial.li + 1].name : "Seuraava", "primary", () => tutorialGo(1));
  else {
    btn("Aloita alusta", "", () => loadStep(tutorial.li, tutorial.si));
    if (!lastAll) btn("Ohita", "quiet", () => tutorialGo(1));
  }
  if (tutorial.li > 0 || tutorial.si > 0) btn("Edellinen", "quiet", () => tutorialGo(-1));
  btn("Lopeta", "quiet", () => { exitTutorial(); setTab("games"); });
}
