// ---------- Asetukset ----------
function syncSettingsUI() {
  $("beginnerToggle").checked = state.beginner;
  document.body.classList.toggle("beginner", state.beginner);
  for (const b of $("colorSeg").children) b.setAttribute("aria-pressed", b.dataset.v === state.myColor);
  for (const b of $("pvSeg").children) b.setAttribute("aria-pressed", +b.dataset.v === state.multipv);
  $("onlyMine").checked = state.onlyMine;
  $("depth").value = state.depth; $("depthOut").textContent = state.depth;
}
$("beginnerToggle").addEventListener("change", (e) => {
  state.beginner = e.target.checked;
  syncSettingsUI(); save(); renderAll(); fitPanel();
});
$("colorSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.myColor = b.dataset.v; state.flipped = state.myColor === "b";
  syncSettingsUI(); save(); renderAll();
});
$("pvSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.multipv = +b.dataset.v; syncSettingsUI(); save(); analyze(true);
});
// Moottori laskee aina (siirtojen arviointia varten); asetus vain piilottaa suositukset vastustajan vuorolla
$("onlyMine").addEventListener("change", (e) => { state.onlyMine = e.target.checked; save(); renderLines(); drawArrows(); });
const isBlocked = () => state.onlyMine && !view.game_over() && view.turn() !== state.myColor;
$("depth").addEventListener("input", (e) => { $("depthOut").textContent = e.target.value; });
$("depth").addEventListener("change", (e) => { state.depth = +e.target.value; save(); analyze(true); });

// ---------- FEN ----------
$("loadFen").addEventListener("click", () => {
  const fen = $("fenInput").value.trim();
  const v = game.validate_fen(fen);
  const msg = $("fenMsg");
  if (!v.valid) { msg.textContent = "FEN ei kelpaa: " + v.error; msg.className = "msg err"; return; }
  stopPlayMode();
  state.gameId = newGameId();
  game.load(fen); variation = null; viewPly = null; selected = null; legalFromSel = [];
  msg.textContent = "Asema ladattu."; msg.className = "msg";
  save(); rebuildView(); renderAll(); analyze();
});
$("copyFen").addEventListener("click", () => {
  const input = $("fenInput"), msg = $("fenMsg");
  const fallback = () => { input.select(); msg.textContent = "Valittu – kopioi pikanäppäimellä."; msg.className = "msg"; };
  try {
    navigator.clipboard.writeText(view.fen()).then(() => { msg.textContent = "FEN kopioitu."; msg.className = "msg"; }, fallback);
  } catch (e) { fallback(); }
});
