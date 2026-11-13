// ---------- Nappuloiden liike ----------
// Lauta piirretään aina kokonaan uudelleen. Piirron jälkeen verrataan edelliseen asemaan ja liu'utetaan
// siirtyneet nappulat lähtöruuduista paikoilleen (toimii myös linnoituksessa, korotuksessa ja selatessa).
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOVE_MS = 220;
let prevPieces = null, prevFlipped = null;

function snapshotPieces() {
  const m = new Map();
  for (const f of FILES) for (let r = 1; r <= 8; r++) {
    const p = view.get(f + r);
    if (p) m.set(f + r, p.color + p.type);
  }
  return m;
}

function animatePieces(next) {
  const prev = prevPieces, sameSide = prevFlipped === state.flipped;
  prevPieces = next; prevFlipped = state.flipped;
  if (!prev || !sameSide || reduceMotion || !boardEl.animate) return;
  const gone = [], came = [];
  prev.forEach((code, sq) => { if (next.get(sq) !== code) gone.push({ sq, code }); });
  next.forEach((code, sq) => { if (prev.get(sq) !== code) came.push({ sq, code }); });
  if (!came.length || came.length > 8) return; // isot hypyt (uusi peli, tuonti) ilman animaatiota

  const coords = (sq) => {
    const f = FILES.indexOf(sq[0]), r = +sq[1] - 1;
    return state.flipped ? { x: 7 - f, y: r } : { x: f, y: 7 - r };
  };
  const dist = (a, b) => { const p = coords(a), q = coords(b); return Math.hypot(p.x - q.x, p.y - q.y); };
  const pairs = [];
  came.forEach((c) => {
    // sama nappula lähimmästä ruudusta; korotuksessa saman värin sotilas viereiseltä riviltä
    let best = -1, bestD = Infinity;
    gone.forEach((g, i) => { if (g.code === c.code) { const d = dist(g.sq, c.sq); if (d < bestD) { bestD = d; best = i; } } });
    if (best < 0) gone.forEach((g, i) => { if (best < 0 && g.code === c.code[0] + "p" && dist(g.sq, c.sq) < 1.5) best = i; });
    if (best >= 0) { pairs.push({ from: gone[best].sq, to: c.sq }); gone.splice(best, 1); }
  });

  const size = boardEl.clientWidth / 8;
  const square = (sq) => boardEl.querySelector('.sq[data-sq="' + sq + '"]');
  pairs.forEach(({ from, to }) => {
    const btn = square(to), piece = btn && btn.querySelector(".piece");
    if (!piece) return;
    const a = coords(from), b = coords(to);
    btn.style.zIndex = "3"; // liikkuva nappula muiden ruutujen ja nuolten yläpuolelle
    piece.animate(
      [{ transform: `translate(${(a.x - b.x) * size}px, ${(a.y - b.y) * size}px) translateY(-2%)` }, { transform: "translateY(-2%)" }],
      { duration: MOVE_MS, easing: "cubic-bezier(.2, .7, .25, 1)" }
    ).onfinish = () => { btn.style.zIndex = ""; };
  });
  // lyödyt nappulat häivytetään pois paikaltaan
  gone.forEach(({ sq, code }) => {
    const btn = square(sq);
    if (!btn) return;
    const g = document.createElement("span");
    g.className = "piece ghost " + code[0];
    g.textContent = GLYPH[code[1]] + "︎";
    btn.appendChild(g);
    g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOVE_MS, easing: "ease-out" }).onfinish = () => g.remove();
  });
}

// Materiaali: kumpi on lyönyt enemmän ja kuinka monta pistettä
const VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1 };
function renderMaterial() {
  const cnt = { w: { q: 0, r: 0, b: 0, n: 0, p: 0 }, b: { q: 0, r: 0, b: 0, n: 0, p: 0 } };
  view.board().forEach((row) => row.forEach((p) => { if (p && p.type !== "k") cnt[p.color][p.type]++; }));
  let score = 0;
  const extra = { w: [], b: [] };
  for (const t of ["q", "r", "b", "n", "p"]) {
    const d = cnt.w[t] - cnt.b[t];
    score += d * VALUE[t];
    for (let i = 0; i < Math.abs(d); i++) extra[d > 0 ? "w" : "b"].push(t);
  }
  const fill = (el, color) => {
    const who = document.createElement("span"); who.className = "who";
    who.textContent = color === "w" ? "Valkea" : "Musta";
    if (color === state.myColor) { const s = document.createElement("small"); s.textContent = " (sinä)"; who.appendChild(s); }
    const caps = document.createElement("span"); caps.className = "caps";
    const opp = color === "w" ? "b" : "w";
    extra[color].forEach((t, i) => {
      if (i && extra[color][i - 1] !== t) { const g = document.createElement("span"); g.className = "gap"; caps.appendChild(g); }
      const s = document.createElement("span"); s.className = "piece " + opp; s.textContent = GLYPH[t] + "︎";
      caps.appendChild(s);
    });
    const parts = [who, caps];
    const adv = color === "w" ? score : -score;
    if (adv > 0) {
      const a = document.createElement("span"); a.className = "adv"; a.textContent = "+" + adv;
      a.title = "Materiaaliero nappuloiden arvoilla";
      parts.push(a);
    }
    el.replaceChildren(...parts);
  };
  const top = state.flipped ? "w" : "b";
  fill($("matTop"), top);
  fill($("matBottom"), top === "w" ? "b" : "w");
}
