// ---------- Ohje ----------
let helpReturn = null;
function openHelp() {
  helpReturn = document.activeElement;
  $("help").hidden = false;
  document.querySelector(".app").inert = true; // kohdistus ei pääse taustalle tummennuksen alle
  document.body.style.overflow = "hidden";
  $("helpClose").focus();
}
function closeHelp() {
  $("help").hidden = true;
  document.querySelector(".app").inert = false;
  document.body.style.overflow = "";
  if (helpReturn && helpReturn.focus) helpReturn.focus();
}
$("helpBtn").addEventListener("click", openHelp);
document.querySelectorAll("[data-help]").forEach((b) => b.addEventListener("click", openHelp));
$("helpClose").addEventListener("click", closeHelp);
$("help").addEventListener("click", (e) => { if (e.target.id === "help") closeHelp(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("help").hidden) closeHelp(); });

// ---------- Näyttö päällä (puhelimessa) ----------
async function keepAwake() {
  try { if ("wakeLock" in navigator && document.visibilityState === "visible") await navigator.wakeLock.request("screen"); }
  catch (e) { /* ei tuettu tai estetty */ }
}
document.addEventListener("visibilitychange", keepAwake);
