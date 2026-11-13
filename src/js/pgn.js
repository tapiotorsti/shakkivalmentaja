// ---------- PGN-tuonti ja -vienti ----------
const PGN_OPTS = { sloppy: true, newline_char: "\r?\n" };
function pgnMsg(text, err) { const m = $("pgnMsg"); m.textContent = text; m.className = "msg" + (err ? " err" : ""); }

function parsePgn(text) {
  text = String(text || "").replace(/^﻿/, "").trim();
  if (!text) return { error: "Liitä ensin peli tekstikenttään tai valitse tiedosto." };
  const first = text.split(/\r?\n\s*\r?\n(?=\s*\[Event )/)[0]; // vain ensimmäinen peli
  const c = new Chess();
  if (!c.load_pgn(first, PGN_OPTS)) {
    return { error: "Peliä ei voitu lukea. Tarkista, että teksti on PGN-muodossa englanninkielisin merkinnöin (esim. 1. e4 e5 2. Nf3 Nc6)." };
  }
  if (!c.history().length) return { error: "Pelissä ei ole siirtoja." };
  return { pgn: first, plies: c.history().length, multiple: first.length < text.length };
}

let importArmed = null;
function doImport(text) {
  const res = parsePgn(text);
  if (res.error) { pgnMsg(res.error, true); return; }
  const btn = $("importPgn");
  if (!importArmed && game.history().length) {
    btn.textContent = "Vahvista: korvaa nykyinen peli";
    btn.classList.add("warn");
    importArmed = { text, timer: setTimeout(resetImportBtn, 4000) };
    pgnMsg("Tuonti korvaa nykyisen pelin. Paina painiketta uudelleen vahvistaaksesi.");
    return;
  }
  resetImportBtn();
  applyImport(res.pgn);
  $("pgnInput").value = "";
  pgnMsg("Tuotu " + Math.ceil(res.plies / 2) + " siirron peli" + (res.multiple ? " (tiedoston ensimmäinen peli)" : "") + ". Analyysi käynnistyi.");
}

// Ottaa pelin käyttöön; jos oma käyttäjänimi on tiedossa, laudan suunta ja oma väri asetetaan sen mukaan
function applyImport(pgn, me) {
  stopPlayMode();
  game.load_pgn(pgn, PGN_OPTS);
  state.gameId = gameKey();
  mergeLibraryEvals(state.gameId); // aiemmin analysoitu peli avautuu valmiina
  variation = null; viewPly = null; selected = null; legalFromSel = [];
  anaSig = "";
  if (me) {
    const h = game.header(), lc = (x) => String(x || "").toLowerCase();
    const color = lc(h.White) === lc(me) ? "w" : lc(h.Black) === lc(me) ? "b" : null;
    if (color) { state.myColor = color; state.flipped = color === "b"; syncSettingsUI(); }
  }
  save(); rebuildView(); renderAll(); analyze();
  setTab("ana");
}
function resetImportBtn() {
  if (importArmed) clearTimeout(importArmed.timer);
  importArmed = null;
  const btn = $("importPgn");
  btn.textContent = "Tuo peli"; btn.classList.remove("warn");
}
$("importPgn").addEventListener("click", () => doImport(importArmed ? importArmed.text : $("pgnInput").value));
$("pgnInput").addEventListener("input", resetImportBtn);
$("pgnFile").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { $("pgnInput").value = String(r.result); resetImportBtn(); doImport(String(r.result)); };
  r.onerror = () => pgnMsg("Tiedostoa ei voitu lukea.", true);
  r.readAsText(f);
  e.target.value = "";
});
$("copyPgn").addEventListener("click", () => {
  const text = game.pgn();
  if (!text) { pgnMsg("Pelissä ei ole vielä siirtoja.", true); return; }
  const fallback = () => { const t = $("pgnInput"); t.value = text; t.select(); pgnMsg("PGN on tekstikentässä valittuna – kopioi pikanäppäimellä."); };
  try { navigator.clipboard.writeText(text).then(() => pgnMsg("PGN kopioitu."), fallback); } catch (err) { fallback(); }
});
