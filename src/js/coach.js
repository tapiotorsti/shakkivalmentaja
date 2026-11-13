// ---------- Aloittelijatila: nappulat, vaarat ja siirrot sanoin ----------
const NAME = { p: "sotilas", n: "ratsu", b: "lähetti", r: "torni", q: "daami", k: "kuningas" };
const GEN = { p: "sotilaan", n: "ratsun", b: "lähetin", r: "tornin", q: "daamin", k: "kuninkaan" };
const MY = { p: "sotilaasi", n: "ratsusi", b: "lähettisi", r: "tornisi", q: "daamisi", k: "kuninkaasi" };
const MY_PART = { p: "sotilastasi", n: "ratsuasi", b: "lähettiäsi", r: "torniasi", q: "daamiasi", k: "kuningastasi" };
const TRANSL = { q: "daamiksi", r: "torniksi", b: "lähetiksi", n: "ratsuksi" };
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const colorName = (c) => (c === "w" ? "Valkea" : "Musta");
const HOW = {
  p: "Sotilas liikkuu suoraan eteenpäin yhden ruudun, ensimmäisellä siirrollaan halutessaan kaksi. Se lyö vinottain eteenpäin. Viimeisellä rivillä siitä tulee daami tai muu nappula.",
  n: "Ratsu liikkuu L-muodossa: kaksi ruutua yhteen suuntaan ja yksi sivulle. Ainoana nappulana se hyppää muiden yli.",
  b: "Lähetti liikkuu vinottain niin pitkälle kuin tie on vapaa. Se pysyy aina saman värisillä ruuduilla.",
  r: "Torni liikkuu suoraan pysty- tai vaakasuunnassa niin pitkälle kuin tie on vapaa.",
  q: "Daami liikkuu kuin torni ja lähetti yhdessä: suoraan tai vinottain niin pitkälle kuin tie on vapaa. Se on vahvin nappula.",
  k: "Kuningas liikkuu yhden ruudun mihin suuntaan tahansa, mutta ei saa siirtyä uhattuun ruutuun."
};

// Asema, jossa vuorossa on annettu väri (ohestalyönti nollataan, jotta asema on aina kelvollinen)
function withTurn(fen, color) {
  const parts = fen.split(" ");
  parts[1] = color; parts[3] = "-";
  const c = new Chess();
  return c.load(parts.join(" ")) ? c : null;
}

// Omat nappulat, jotka vastustaja voi lyödä: suojaamattomat tai halvemman nappulan uhkaamat
const dangerCache = new Map();
function dangersFor(fen, owner) {
  const key = fen + "|" + owner;
  if (dangerCache.has(key)) return dangerCache.get(key);
  const opp = owner === "w" ? "b" : "w";
  const out = new Map();
  const atk = withTurn(fen, opp);
  if (atk) {
    const byTarget = new Map();
    atk.moves({ verbose: true }).forEach((m) => {
      if (!m.captured || m.color !== opp) return;
      if (!byTarget.has(m.to)) byTarget.set(m.to, []);
      byTarget.get(m.to).push(m);
    });
    byTarget.forEach((captures, sq) => {
      const piece = atk.get(sq);
      if (!piece || piece.color !== owner || piece.type === "k") return;
      const cheapest = captures.reduce((a, b) => (PIECE_VALUE[a.piece] <= PIECE_VALUE[b.piece] ? a : b));
      // suojaako jokin? halvin hyökkääjä lyö, ja katsotaan, voiko omistaja lyödä takaisin
      // (näin myös kuninkaan suoja lasketaan oikein: lyöjä ei enää uhkaa ruutua sen takaa)
      const after = new Chess(atk.fen());
      after.move({ from: cheapest.from, to: sq, promotion: cheapest.promotion });
      const defended = after.moves({ verbose: true }).some((m) => m.to === sq && m.captured);
      if (!defended || PIECE_VALUE[cheapest.piece] < PIECE_VALUE[piece.type]) {
        out.set(sq, { type: piece.type, hanging: !defended, by: cheapest.piece });
      }
    });
  }
  if (dangerCache.size > 200) dangerCache.clear();
  dangerCache.set(key, out);
  return out;
}

// Siirto selkokielellä, esim. "Ratsu f3 → e5, lyö sotilaan, shakki"
function describeMove(fen, uci) {
  const c = new Chess(fen);
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (!m) return { san: uci, text: "" };
  const parts = [];
  if (m.flags.includes("k") || m.flags.includes("q")) parts.push("linnoitus " + (m.flags.includes("k") ? "lyhyelle puolelle" : "pitkälle puolelle") + " – kuningas turvaan");
  else parts.push(cap(NAME[m.piece]) + " " + m.from + " → " + m.to);
  if (m.captured) parts.push("lyö " + GEN[m.captured]);
  if (m.promotion) parts.push("korottuu " + TRANSL[m.promotion]);
  if (c.in_checkmate()) parts.push("matti!");
  else if (c.in_check()) parts.push("shakki");
  return { san: fiSan(m.san), text: cap(parts.join(", ")) };
}

function renderCoach(dangers) {
  const box = $("coach");
  box.hidden = !state.beginner;
  if (!state.beginner) return;
  box.replaceChildren();
  const add = (...parts) => parts.forEach((p) => box.append(p));
  const b = (t, cls) => { const e = document.createElement("b"); e.textContent = t; if (cls) e.className = cls; return e; };
  const turn = view.turn();
  if (selected) {
    const p = view.get(selected);
    if (p) {
      add(b(cap(NAME[p.type]) + ". "), HOW[p.type] + " ");
      if (p.type === "k" && legalFromSel.some((m) => m.flags.includes("k") || m.flags.includes("q"))) add("Voit myös linnoittautua: kuningas siirtyy kaksi ruutua tornia kohti. ");
      add(legalFromSel.length ? "Laillisia siirtoja: " + legalFromSel.length + "." : "Tällä nappulalla ei nyt ole laillisia siirtoja.");
      if (view.in_check()) add(" Kuningas on shakissa, joten vain shakin poistavat siirrot ovat sallittuja.");
      if (dangers.get(selected)) add(" ", b("Tämä nappula on vaarassa.", "cwarn"));
      return;
    }
  }
  if (view.game_over() && !tutorial.active) {
    if (view.in_checkmate()) add(b("Matti! "), colorName(turn === "w" ? "b" : "w") + " voitti, koska kuningasta ei voi enää pelastaa.");
    else add(b("Tasapeli. "), view.in_stalemate() ? "Pattitilanne: vuorossa olevalla ei ole laillisia siirtoja, mutta kuningas ei ole shakissa." : "Peli päättyi tasan.");
    return;
  }
  if (view.in_check()) {
    add(b("Shakki! ", "cwarn"), turn === state.myColor
      ? "Kuninkaasi on uhattuna. Siirrä kuningas turvaan, lyö uhkaava nappula tai asetu väliin."
      : "Vastustajan kuningas on uhattuna, ja sen on seuraavaksi päästävä turvaan.");
    return;
  }
  if (dangers.size) {
    const list = [...dangers.entries()].sort((x, y) => PIECE_VALUE[y[1].type] - PIECE_VALUE[x[1].type]).slice(0, 2);
    add(b("Varo: ", "cwarn"));
    list.forEach(([sq, d], i) => {
      if (i) add(" ");
      add(d.hanging
        ? cap(MY[d.type]) + " ruudussa " + sq + " on suojaamatta, ja vastustaja voi lyödä sen."
        : "Vastustajan " + NAME[d.by] + " uhkaa " + MY_PART[d.type] + " ruudussa " + sq + ".");
    });
    return;
  }
  add(b(colorName(turn) + " vuorossa" + (turn === state.myColor ? " (sinä). " : ". ")), "Napauta nappulaa, niin näet, miten se liikkuu.");
  if (!tutorial.active && !practice.active && !mainMoves().length) add(" Uusi shakissa? Pelit-välilehden Opi pelaamaan näyttää, miten nappulat liikkuvat.");
}
