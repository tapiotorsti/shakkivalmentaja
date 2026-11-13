// ---------- Pelin analyysi (varsinainen peli) ----------
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVG_NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const playerName = (color) => {
  const h = game.header(), name = color === "w" ? h.White : h.Black;
  return name && name !== "?" ? name : (color === "w" ? "Valkea" : "Musta");
};

// Siirry pelin kohtaan (poistuu sivuvariantista, jos kohta on haarautumisen jälkeen)
function goToMain(ply) {
  if (variation && ply > variation.base) variation = null;
  goTo(ply);
}

// Tarkkuus 0–100 % (Lichessin kaava), keskiarvo pelaajan siirroista
function accuracyOf(pos, color) {
  const sign = color === "w" ? 1 : -1, accs = [];
  for (let i = 0; i < pos.length - 1; i++) {
    if (pos[i + 1].move.color !== color) continue;
    const b = evalOf(pos[i].fen), a = evalOf(pos[i + 1].fen);
    if (!b || !a || b.depth < MIN_REVIEW_DEPTH || a.depth < MIN_REVIEW_DEPTH) continue;
    const drop = Math.max(0, 50 * (winChance(b.score) - winChance(a.score)) * sign);
    accs.push(Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669)));
  }
  return accs.length ? accs.reduce((s, x) => s + x, 0) / accs.length : null;
}

let anaSig = "";
function renderAnalysis() {
  const pos = positionsOf(mainMoves()), n = pos.length - 1;
  const evs = pos.map((p) => evalOf(p.fen));
  const onMain = !variation || curPly() <= variation.base;
  if (assistOff()) {
    anaSig = "";
    $("anaEmpty").textContent = tutorial.active ? "Analyysi on piilossa opetuksen ajan." : practice.active ? "Analyysi on piilossa tehtävän ajan." : "Analyysi avautuu, kun peli päättyy. Moottori arvioi siirtoja jo taustalla.";
    $("anaEmpty").hidden = false;
    $("anaBody").hidden = true;
    return;
  }
  const sig = [evs.map((e) => (e ? e.score + ":" + e.depth : "-")).join(","), curPly(), onMain, state.myColor,
    $("graphWrap").clientWidth, game.header().White || "", game.header().Black || ""].join("|");
  if (sig === anaSig) return;
  anaSig = sig;

  $("anaEmpty").textContent = "Analyysi näkyy, kun pelissä on siirtoja. Voit myös tuoda valmiin pelin kohdasta \"Tuo tai vie peli\".";
  $("anaEmpty").hidden = n > 0;
  $("anaBody").hidden = n === 0;
  if (!n) return;

  const target = Math.min(BG_DEPTH, state.depth);
  const done = evs.filter((e) => e && e.depth >= target).length;
  const prog = $("anaProgress");
  // rivi pysyy paikallaan myös valmiina, ettei sen alla oleva sisältö hyppää
  prog.hidden = false;
  $("anaBar").style.width = (100 * done / pos.length).toFixed(1) + "%";
  $("anaText").textContent = done >= pos.length
    ? "Analyysi valmis · syvyys " + target
    : "Analysoidaan: " + done + "/" + pos.length + " asemaa";

  const results = [];
  for (let i = 0; i < n; i++) results.push(classify(i, pos));

  renderGameInfo();
  renderGraph(pos, evs, results, onMain);
  renderPlayerCards(pos, results, done >= pos.length);
  renderTurns(pos, results, done >= pos.length);
}

function renderGameInfo() {
  const box = $("gameInfo"), h = game.header();
  if (!h.White && !h.Black) { box.hidden = true; return; }
  box.replaceChildren();
  const row = el("div", "players");
  row.appendChild(el("span", "lbl", "Pelasin:"));
  ["w", "b"].forEach((c) => {
    const b = el("button", "pbtn");
    b.type = "button";
    b.setAttribute("aria-pressed", String(state.myColor === c));
    const elo = c === "w" ? h.WhiteElo : h.BlackElo;
    b.append(el("span", "pdot " + c), el("span", null, playerName(c)));
    if (elo && elo !== "?") b.appendChild(el("small", null, elo));
    b.addEventListener("click", () => {
      state.myColor = c; state.flipped = c === "b";
      syncSettingsUI(); save(); renderAll();
    });
    row.appendChild(b);
  });
  box.appendChild(row);
  const meta = [h.Result && h.Result !== "*" ? h.Result : null, h.Date && !/\?/.test(h.Date) ? h.Date : null, h.Event && h.Event !== "?" ? h.Event : null]
    .filter(Boolean).join(" · ");
  if (meta) box.appendChild(el("div", "meta", meta));
  box.hidden = false;
}

let graphGeom = null; // hiiren ja kosketuksen kohdistusta varten
function renderGraph(pos, evs, results, onMain) {
  const svg = $("graph"), wrap = $("graphWrap");
  const n = pos.length - 1;
  const W = Math.max(200, wrap.clientWidth || 300), H = wrap.clientHeight || 120, P = 6;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  const x = (i) => P + i * (W - 2 * P) / n;
  const y = (s) => H / 2 - winChance(s) * (H / 2 - P);
  let last = 0;
  const ys = evs.map((e) => { if (e) last = e.score; return y(last); });
  graphGeom = { W, P, n, pos, evs, results };

  svg.replaceChildren();
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: W, height: H, style: "fill: var(--bar-black)" }));
  let d = "M0 " + H + " L0 " + ys[0].toFixed(1);
  ys.forEach((yy, i) => { d += " L" + x(i).toFixed(1) + " " + yy.toFixed(1); });
  d += " L" + W + " " + ys[n].toFixed(1) + " L" + W + " " + H + " Z";
  svg.appendChild(svgEl("path", { d, style: "fill: var(--bar-white)" }));
  svg.appendChild(svgEl("line", { x1: 0, x2: W, y1: H / 2, y2: H / 2, "stroke-dasharray": "3 4", style: "stroke: var(--muted); stroke-width: 1; opacity: .7" }));
  if (onMain) {
    const cx = x(curPly()).toFixed(1);
    svg.appendChild(svgEl("line", { x1: cx, x2: cx, y1: 0, y2: H, style: "stroke: var(--accent); stroke-width: 2" }));
  }
  results.forEach((r, i) => {
    if (!r || !BAD.includes(r.kind)) return;
    svg.appendChild(svgEl("circle", {
      cx: x(i + 1).toFixed(1), cy: ys[i + 1].toFixed(1), r: r.kind === "inacc" ? 3.5 : 5,
      style: "fill: var(--q-" + (r.kind === "inacc" ? "inacc" : r.kind) + "); stroke: var(--surface); stroke-width: 2"
    }));
  });
}

function graphPly(e) {
  const g = graphGeom;
  if (!g || !g.n) return null;
  const rect = $("graph").getBoundingClientRect();
  const px = (e.clientX - rect.left) * (g.W / rect.width);
  return { ply: Math.max(0, Math.min(g.n, Math.round((px - g.P) / ((g.W - 2 * g.P) / g.n)))), rect };
}
$("graphWrap").addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  const hit = graphPly(e);
  if (!hit) return;
  const g = graphGeom, i = hit.ply;
  const left = g.P + i * (g.W - 2 * g.P) / g.n;
  const pxLeft = left * (hit.rect.width / g.W);
  const cross = $("gcross"), tip = $("gtip");
  cross.style.left = pxLeft + "px";
  cross.hidden = false;
  let text = "Alkuasema";
  if (i > 0) {
    const r = g.results[i - 1];
    text = moveLabel(g.pos, i - 1) + (r && QUALITY[r.kind].mark ? QUALITY[r.kind].mark : "");
  }
  if (g.evs[i]) text += " · " + evalText(g.evs[i]);
  tip.textContent = text;
  tip.hidden = false;
  const tw = tip.offsetWidth;
  tip.style.left = Math.max(4, Math.min(hit.rect.width - tw - 4, pxLeft + 8)) + "px";
});
$("graphWrap").addEventListener("pointerleave", () => { $("gcross").hidden = true; $("gtip").hidden = true; });
$("graphWrap").addEventListener("click", (e) => {
  const hit = graphPly(e);
  if (hit) goToMain(hit.ply);
});
if (window.ResizeObserver) new ResizeObserver(() => { anaSig = ""; renderAnalysis(); }).observe($("graphWrap"));

// Pelaajien vertailu taulukkona: tarkkuus ja virheiden määrät rinnakkain
function renderPlayerCards(pos, results, complete) {
  const table = $("pcards");
  table.replaceChildren();
  const head = el("tr");
  const th = (content, title) => { const c = el("th"); c.append(content); if (title) c.title = title; return c; };
  head.append(th(""), th("Tarkkuus"),
    th(el("span", "q blunder", "??"), "Mokat"), th(el("span", "q mistake", "?"), "Virheet"), th(el("span", "q inacc", "?!"), "Epätarkkuudet"));
  const thead = el("thead"); thead.appendChild(head);
  const tbody = el("tbody");
  ["w", "b"].forEach((color) => {
    const tr = el("tr");
    const who = el("div", "who");
    who.append(el("span", "pdot " + color), el("span", null, playerName(color)));
    if (color === state.myColor) who.appendChild(el("small", null, "sinä"));
    const c0 = el("td"); c0.appendChild(who);
    // tarkkuus vasta kun koko peli on analysoitu, ettei osittainen luku johda harhaan
    const acc = complete ? accuracyOf(pos, color) : null;
    const c1 = el("td", "acc" + (acc == null ? " zero" : ""), acc == null ? (complete ? "–" : "…") : Math.round(acc) + " %");
    if (!complete) c1.title = "Lasketaan, kun analyysi on valmis";
    const cnt = { blunder: 0, mistake: 0, inacc: 0 };
    results.forEach((r, i) => { if (r && r.kind in cnt && pos[i + 1].move.color === color) cnt[r.kind]++; });
    tr.append(c0, c1, ...["blunder", "mistake", "inacc"].map((k) => el("td", cnt[k] ? null : "zero", String(cnt[k]))));
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
}

// Käännekohdat: suurimmat virheet ja mokat aikajärjestyksessä
function renderTurns(pos, results, complete) {
  const box = $("turns");
  box.replaceChildren();
  const items = [];
  results.forEach((r, i) => { if (r && (r.kind === "blunder" || r.kind === "mistake")) items.push({ i, r }); });
  items.sort((a, b) => b.r.loss - a.r.loss);
  const top = items.slice(0, 5).sort((a, b) => a.i - b.i);
  if (!top.length) {
    box.appendChild(el("p", "none", complete
      ? "Pelissä ei ollut yhtään virhettä tai mokaa."
      : "Käännekohdat ilmestyvät tähän analyysin edetessä."));
    return;
  }
  top.forEach(({ i, r }) => {
    const b = el("button", "turn");
    b.type = "button";
    b.title = QUALITY[r.kind].label;
    b.append(
      el("span", "q " + r.kind, QUALITY[r.kind].mark),
      el("span", "rv-move", moveLabel(pos, i)),
      el("span", "tev", evalText(r.before) + " → " + evalText(r.after)),
      el("small", null, r.move.color === state.myColor ? "sinun siirtosi" : "vastustaja")
    );
    b.addEventListener("click", () => goToMain(i + 1));
    box.appendChild(b);
  });
}
