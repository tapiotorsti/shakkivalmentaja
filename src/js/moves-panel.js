function sanOf(fen, uci) {
  const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return m ? fiSan(m.san) : uci;
}

function moveMarks(pos) {
  const out = [];
  for (let i = 0; i < pos.length - 1; i++) { const r = classify(i, pos); out.push(r ? r.kind : ""); }
  return out;
}

// Katkoviivanuoli: parempi siirto, kun laudalla on asema heti oman virheen jälkeen
function reviewArrow() {
  const ply = curPly();
  if (!ply) return null;
  const r = classify(ply - 1, positions());
  if (!r || !BAD.includes(r.kind) || r.move.color !== state.myColor || !r.before.best) return null;
  return r.before.best;
}

const moveLabel = (pos, i) => pos[i].fen.split(" ")[5] + (pos[i + 1].move.color === "w" ? ". " : "… ") + fiSan(pos[i + 1].move.san);

function moveButton(pos, i, marks, line, isCur) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "mv"; b.dataset.ply = i + 1; b.dataset.line = line;
  b.textContent = fiSan(pos[i + 1].move.san);
  const q = QUALITY[marks[i]];
  if (q && q.mark) { const s = document.createElement("span"); s.className = "q " + marks[i]; s.textContent = q.mark; b.appendChild(s); }
  if (isCur) { b.classList.add("cur"); b.setAttribute("aria-current", "true"); }
  return b;
}

function movesSignature() {
  const posMain = positionsOf(mainMoves());
  if (assistOff()) return ["play", posMain.length, curPly()].join("|");
  return [moveMarks(posMain).join(","), variation ? moveMarks(positions()).join(",") + "@" + variation.base : "-", curPly(), state.myColor].join("|");
}

let movesSig = "";
function renderMoves() {
  movesSig = movesSignature();
  const posMain = positionsOf(mainMoves()), n = posMain.length - 1;
  const marks = assistOff() ? [] : moveMarks(posMain), ply = curPly();
  const onMain = !variation || ply <= variation.base;
  movesEl.replaceChildren();
  if (!n) {
    const d = document.createElement("div"); d.className = "none";
    d.textContent = "Ei siirtoja vielä. Napauta nappulaa ja sitten ruutua.";
    movesEl.appendChild(d);
  } else {
    const num = (no) => { const s = document.createElement("span"); s.className = "n"; s.textContent = no + "."; return s; };
    const mk = (i) => {
      const b = moveButton(posMain, i, marks, "main", onMain && ply === i + 1);
      if (variation && i >= variation.base) b.classList.add("off");
      return b;
    };
    const start = posMain[0].fen.split(" ");
    let no = +start[5] || 1, i = 0;
    if (start[1] === "b") {
      const dots = document.createElement("span"); dots.textContent = "…";
      movesEl.append(num(no++), dots, mk(0)); i = 1;
    }
    for (; i < n; i += 2) movesEl.append(num(no++), mk(i), i + 1 < n ? mk(i + 1) : document.createElement("span"));
    const cur = movesEl.querySelector(".cur");
    if (cur) {
      // vieritetään vain siirtolistaa, ei koko sivua
      const top = cur.offsetTop, bottom = top + cur.offsetHeight;
      if (top < movesEl.scrollTop) movesEl.scrollTop = top - 8;
      else if (bottom > movesEl.scrollTop + movesEl.clientHeight) movesEl.scrollTop = bottom - movesEl.clientHeight + 8;
    } else if (viewPly === null && !variation) movesEl.scrollTop = movesEl.scrollHeight;
  }

  // Sivuvariantti omana laatikkonaan
  const box = $("varBox");
  if (!variation) { box.hidden = true; $("varMoves").replaceChildren(); return; }
  const pos = positions(), vmarks = assistOff() ? [] : moveMarks(pos);
  const list = $("varMoves");
  list.replaceChildren();
  for (let i = variation.base; i < pos.length - 1; i++) {
    const white = pos[i + 1].move.color === "w";
    if (white || i === variation.base) {
      const s = document.createElement("span"); s.className = "n";
      s.textContent = pos[i].fen.split(" ")[5] + (white ? "." : "…");
      list.appendChild(s);
    }
    list.appendChild(moveButton(pos, i, vmarks, "var", !onMain && ply === i + 1));
  }
  $("varFrom").textContent = variation.base
    ? "haarautuu siirron " + moveLabel(posMain, variation.base - 1) + " jälkeen"
    : "haarautuu alkuasemasta";
  box.hidden = false;
}
function renderMovesIfChanged() {
  if (movesSignature() !== movesSig) renderMoves();
}

function onMoveClick(e) {
  const b = e.target.closest(".mv");
  if (!b) return;
  const ply = +b.dataset.ply;
  // Pelin siirto haarautumiskohdan jälkeen: poistutaan sivuvariantista
  if (b.dataset.line === "main" && variation && ply > variation.base) variation = null;
  goTo(ply);
}
movesEl.addEventListener("click", onMoveClick);
$("varMoves").addEventListener("click", onMoveClick);
$("varExit").addEventListener("click", leaveVariation);

let promoteArmed = null;
$("varPromote").addEventListener("click", () => {
  const btn = $("varPromote");
  const lost = mainMoves().length - variation.base;
  if (!promoteArmed && lost > 0) {
    btn.textContent = "Vahvista: " + lost + " pelin siirtoa korvataan";
    btn.classList.add("warn");
    promoteArmed = setTimeout(() => { promoteArmed = null; btn.textContent = "Korvaa peli tällä"; btn.classList.remove("warn"); }, 3000);
    return;
  }
  clearTimeout(promoteArmed); promoteArmed = null;
  btn.textContent = "Korvaa peli tällä"; btn.classList.remove("warn");
  promoteVariation();
});

// Selauspainikkeet ja nuolinäppäimet
$("navStart").addEventListener("click", () => goTo(0));
$("navPrev").addEventListener("click", () => goTo(curPly() - 1));
$("navNext").addEventListener("click", () => goTo(curPly() + 1));
$("navEnd").addEventListener("click", () => goTo(activeMoves().length));
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if ((t && t.closest && t.closest("input, textarea, select")) || !$("help").hidden || !$("promo").hidden) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const map = { ArrowLeft: -1, ArrowRight: 1 };
  if (e.key in map) goTo(curPly() + map[e.key]);
  else if (e.key === "f" || e.key === "F") { state.flipped = !state.flipped; save(); renderBoard(); drawArrows(); }
  else if (e.key === "Home") goTo(0);
  else if (e.key === "End") goTo(activeMoves().length);
  else return;
  e.preventDefault();
});

function renderNav() {
  const n = activeMoves().length, ply = curPly();
  $("navStart").disabled = $("navPrev").disabled = ply === 0;
  $("navNext").disabled = $("navEnd").disabled = ply === n;
  $("navEnd").classList.toggle("primary", ply < n);
  const label = $("navPos");
  label.replaceChildren();
  if (variation && ply > variation.base) {
    const t = document.createElement("span"); t.className = "navtag"; t.textContent = "Sivuvariantti"; label.appendChild(t);
  }
  const pos = positions();
  label.append(ply ? moveLabel(pos, ply - 1) : tutorial.active ? "Opetus" : practice.active ? "Tehtävä" : "Alkuasema");
  const c = document.createElement("small");
  c.textContent = ply === n ? (n ? " · viimeisin" : "") : " · " + ply + "/" + n;
  label.appendChild(c);
}

function renderReview() {
  const el = $("review");
  const pos = positions(), n = pos.length - 1, ply = curPly();
  renderAnalysis();
  el.replaceChildren();
  if (assistOff()) {
    el.className = "review empty";
    el.textContent = tutorial.active ? "Opetuksessa siirtoja ei arvioida." : practice.active ? "Arvio näkyy, kun tehtävä on ratkaistu." : "Siirtojen arviot näkyvät, kun peli päättyy.";
    return;
  }
  if (!n || !ply) {
    el.className = "review empty";
    el.textContent = n ? "Alkuasema. Siirry eteenpäin, niin näet siirtojen arviot." : "Tee siirto, niin näet tässä, kuinka hyvä se oli.";
    return;
  }
  el.className = "review";
  const i = ply - 1;
  const m = pos[i + 1].move, r = classify(i, pos);
  const no = pos[i].fen.split(" ")[5];

  const head = document.createElement("div"); head.className = "rv-head";
  const badge = document.createElement("span");
  badge.className = "badge " + (r ? r.kind : "pending");
  badge.textContent = r ? QUALITY[r.kind].label + (QUALITY[r.kind].mark ? " " + QUALITY[r.kind].mark : "") : "Arvioidaan…";
  const mv = document.createElement("span"); mv.className = "rv-move";
  mv.textContent = no + (m.color === "w" ? ". " : "… ") + fiSan(m.san);
  const who = document.createElement("small");
  who.textContent = m.color === state.myColor ? "sinun siirtosi" : "vastustajan siirto";
  head.append(badge, mv, who);
  el.appendChild(head);

  const para = (...parts) => {
    const p = document.createElement("p");
    parts.forEach((x) => p.append(x));
    el.appendChild(p);
    return p;
  };
  const bold = (t) => { const b = document.createElement("b"); b.textContent = t; return b; };

  if (!r) {
    para("Moottori laskee asemaa ennen siirtoa ja sen jälkeen.");
  } else {
    const bestSan = r.before.best ? sanOf(pos[i].fen, r.before.best) : null;
    if (state.beginner) {
      const best = r.before.best ? describeMove(pos[i].fen, r.before.best) : null;
      const reply = r.after.best ? describeMove(pos[i + 1].fen, r.after.best) : null;
      const mine = m.color === state.myColor;
      const low = (t) => t.charAt(0).toLowerCase() + t.slice(1);
      if (r.kind === "best") para(mine ? "Hienoa! Juuri tämän siirron moottorikin olisi valinnut." : "Vastustaja pelasi parhaan siirron.");
      else if (r.kind === "good") {
        if (best) para("Hyvä siirto. Moottori olisi pelannut ", bold(best.san), " (" + low(best.text) + "), mutta ero on pieni.");
        else para("Hyvä siirto.");
      } else if (mine) {
        para("Parempi oli ", bold(best ? best.san : "?"), best ? ": " + low(best.text) + "." : ".");
        if (reply) para("Miksi? Vastustaja voi nyt vastata ", bold(reply.san), ": " + low(reply.text) + ".");
      } else if (reply) {
        para("Vastustaja teki virheen. Paras vastauksesi on ", bold(reply.san), ": " + low(reply.text) + ".");
      }
      return;
    }
    para("Arvio: ", bold(evalText(r.before)), " → ", bold(evalText(r.after)));
    if (r.kind === "best") {
      para("Sama siirto, jota moottori olisi suositellut.");
    } else if (r.kind === "good") {
      if (bestSan) para("Moottorin ykkösvaihtoehto oli ", bold(bestSan), ", mutta ero on pieni.");
    } else {
      // yksi kappale, jotta kortin korkeus pysyy samana siirrosta toiseen
      const p = para("Parempi oli ", bold(bestSan || "?"), " (" + evalText(r.before) + ").");
      p.append(m.color === state.myColor ? " Näkyy laudalla katkoviivanuolena." : " Vastustaja heikensi asemaansa – etsi tapa hyödyntää se.");
    }
  }
}
