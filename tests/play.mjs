// Testaa pelin konetta vastaan headless-Chromessa.
import { writeFileSync } from "node:fs";
const CDP = process.env.CDP_URL || "http://127.0.0.1:9333"; // headless-Chromen etäohjausosoite
const APP = process.env.APP_URL || "http://127.0.0.1:8765/"; // paikallisesti tarjoiltu sovellus
const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = await (await fetch(CDP + "/json/new?" + APP, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
  return r.result?.result?.value;
};
const check = (c, msg) => { console.log((c ? "ok: " : "FAIL: ") + msg); if (!c) process.exitCode = 1; };
const S = () => ev(`JSON.stringify({
  setup: !document.getElementById("foldPlay").hidden,
  live: !document.getElementById("playSec").hidden,
  state: document.getElementById("playState").innerText,
  note: document.getElementById("playNote").hidden ? "" : document.getElementById("playNote").innerText,
  msg: document.getElementById("playMsg").innerText,
  actions: [...document.querySelectorAll("#playActions button")].map(b => b.innerText),
  vs: document.getElementById("playVs").innerText.replace(/\\n/g, " "),
  moves: [...document.querySelectorAll("#moves .mv")].map(b => b.innerText),
  lines: [...document.querySelectorAll("#lines .line")].map(l => l.innerText.slice(0, 60)),
  review: document.getElementById("review").innerText.slice(0, 60),
  anaHidden: document.getElementById("anaBody").hidden,
  evalOff: document.getElementById("evalbar").classList.contains("off"),
  arrows: document.querySelectorAll("#arrows polygon").length,
  flipped: document.querySelector(".sq").dataset.sq,
  first: document.getElementById("playSec").parentElement.firstElementChild === document.getElementById("playSec") || getComputedStyle(document.getElementById("playSec")).order
})`).then(JSON.parse);
const mv = (from, to) => ev(`(() => { const q = s => document.querySelector('.sq[data-sq="'+s+'"]'); q("${from}").click(); q("${to}").click(); return true; })()`);
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const clickText = (t) => ev(`[...document.querySelectorAll("#playActions button")].find(b => b.innerText.includes(${JSON.stringify(t)})).click(); true`);
const waitFor = async (fn, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { const s = await S(); if (fn(s)) return s; await sleep(400); } return S(); };

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 900, deviceScaleFactor: 2, mobile: true });
await sleep(2000);
await ev(`localStorage.clear(); location.reload(); true`);
await sleep(2500);

let s = await S();
check(s.setup && !s.live, "asetusnäkymä näkyy alussa");

// valkeilla, taso 1
await ev(`document.getElementById("playLevel").value = 1; document.getElementById("playLevel").dispatchEvent(new Event("input")); true`);
await click("#playStart");
s = await S();
console.log(JSON.stringify(s));
check(s.live && s.state.includes("Sinun vuorosi"), "peli alkoi, oma vuoro");
check(s.vs.includes("taso 1"), "vastustajan taso näkyy");
check(s.lines[0].startsWith("Peli konetta vastaan"), "suositukset piilossa");
check(s.review.includes("näkyvät, kun peli päättyy"), "arviot piilossa");
check(s.evalOff && s.anaHidden, "arviopalkki ja analyysi piilossa");
check(s.first === true, "pelipaneeli ylimpänä");

await mv("e2", "e4");
s = await waitFor((x) => x.moves.length === 2 && x.state.includes("Sinun vuorosi"));
console.log("after e4:", JSON.stringify(s.moves), s.state);
check(s.moves.length === 2, "kone vastasi siirtoon");
check(!s.moves.join("").match(/\?/), "ei laatumerkintöjä pelin aikana");
check(s.arrows === 0, "ei nuolia pelin aikana");

// yritys siirtää vastustajan nappulaa -> ei siirtoa
await mv("g8", "f6");
s = await S();
check(s.moves.length === 2, "vastustajan nappulaa ei voi siirtää");

// vihje
await clickText("Vihje");
s = await waitFor((x) => x.arrows === 1, 20000);
check(s.arrows === 1, "vihje näkyy nuolena");

// selaus taaksepäin ja siirtoyritys
await click("#navPrev");
await mv("d2", "d4");
s = await S();
check(s.msg.includes("Palaa viimeisimpään"), "aiemmasta asemasta ei voi siirtää: " + s.msg);
await click("#navEnd");

// peru siirto -> takaisin alkuun
await click("#undoBtn");
s = await S();
check(s.moves.length === 0 && s.state.includes("Sinun vuorosi"), "peru poistaa oman ja koneen siirron");

// pelataan pari siirtoa ja luovutetaan
await mv("d2", "d4");
s = await waitFor((x) => x.moves.length === 2 && x.state.includes("Sinun vuorosi"));
await clickText("Luovuta");
s = await S();
check(s.actions.some((a) => a.includes("Vahvista")), "luovutus vaatii vahvistuksen");
await clickText("Vahvista");
s = await S();
console.log("resigned:", JSON.stringify(s));
check(s.state.startsWith("Hävisit") && s.state.includes("luovutukseen"), "tulos: hävisit luovutukseen");
check(!s.anaHidden && !s.evalOff, "analyysi avautui pelin jälkeen");
s = await waitFor((x) => x.lines.length > 1 && !x.lines[0].startsWith("Lasketaan"), 30000);
check(s.lines.length >= 2, "suositukset palasivat (" + s.lines.length + " riviä)");

// mustilla, taso 8 -> kone aloittaa
await ev(`document.querySelector('#playColor button[data-v="b"]').click(); document.getElementById("playLevel").value = 8; document.getElementById("playLevel").dispatchEvent(new Event("input")); true`);
await clickText("Uusi peli");
s = await waitFor((x) => x.moves.length === 1, 30000);
check(s.moves.length === 1 && s.flipped === "h1", "mustilla: kone aloitti ja lauta käännetty");

// uudelleenlataus kesken pelin
await ev(`location.reload(); true`);
await sleep(3000);
s = await S();
check(s.live && s.moves.length === 1 && s.state.includes("Sinun vuorosi"), "keskeneräinen peli säilyi uudelleenlatauksessa");

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 412, height: 900, scale: 1 } });
writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));

await clickText("Lopeta pelitila");
s = await S();
check(s.setup && !s.live, "pelitilan lopetus palauttaa asetukset");
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
process.exit();
