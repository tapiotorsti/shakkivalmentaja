// ---------- Välilehdet ----------
const TAB_KEY = "shakkivalmentaja.tab";
const wideQuery = window.matchMedia("(min-width: 761px)");
let activeTab = "now";
try { activeTab = localStorage.getItem(TAB_KEY) || "now"; } catch (e) { /* ignore */ }

function setTab(t, remember = true) {
  if (!["now", "moves", "ana", "games", "more"].includes(t)) t = "now";
  if (wideQuery.matches && t === "moves") t = "now"; // leveällä siirrot näkyvät Suositus-välilehdellä
  activeTab = t;
  if (remember) { try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* ignore */ } }
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === t)));
  document.querySelectorAll("#tabBody > [data-tab]").forEach((sec) => {
    const tab = sec.dataset.tab;
    sec.classList.toggle("on", tab === t || (wideQuery.matches && t === "now" && tab === "moves"));
  });
  $("tabBody").scrollTop = 0;
  fitPanel();
  if (t === "ana") { anaSig = ""; renderAnalysis(); }
  if (t === "games") refreshLibraryUI();
  if (t === "moves" || (t === "now" && wideQuery.matches)) renderMoves();
}
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (b) setTab(b.dataset.t);
});
// nuolinäppäimet välilehtipalkissa (saavutettavuus)
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.stopPropagation(); e.preventDefault();
  const tabs = [...document.querySelectorAll(".tab")].filter((b) => b.offsetParent !== null);
  const i = tabs.findIndex((b) => b.dataset.t === activeTab);
  const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
  setTab(next.dataset.t); next.focus();
});

// Sisältöalue täyttää näytön välilehtipalkin alla, joten sivua ei tarvitse vierittää
function fitPanel() {
  const body = $("tabBody");
  const top = body.getBoundingClientRect().top + window.scrollY;
  const avail = Math.max(200, Math.floor(window.innerHeight - top - 4));
  body.style.maxHeight = avail + "px";
  body.style.setProperty("--avail", avail + "px");
}
window.addEventListener("resize", () => { fitPanel(); });
wideQuery.addEventListener("change", () => setTab(activeTab, false));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPanel);

// Avattujen työkaluosioiden tila muistetaan tällä laitteella
document.querySelectorAll("details.fold").forEach((d) => {
  try { if (localStorage.getItem("shakkivalmentaja.fold." + d.id) === "1") d.open = true; } catch (e) { /* ignore */ }
  d.addEventListener("toggle", () => {
    try { localStorage.setItem("shakkivalmentaja.fold." + d.id, d.open ? "1" : "0"); } catch (e) { /* ignore */ }
  });
});
