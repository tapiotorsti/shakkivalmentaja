// Testaa PGN-tuonnin ja pelin analyysin headless-Chromessa ja ottaa kuvakaappauksen.
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

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 900, deviceScaleFactor: 2, mobile: true });
await sleep(2500);
await ev(`localStorage.clear(); location.reload(); true`);
await sleep(2500);
await send("Runtime.enable");

const PGN = `[Event "Harjoituspeli"]
[Site "https://lichess.org/xyz"]
[Date "2026.10.01"]
[White "Torsti"]
[Black "Vastustaja"]
[Result "0-1"]
[WhiteElo "1420"]
[BlackElo "1510"]

1. e4 { [%clk 0:05:00] } 1... e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`;

// ensin tyhjä tuonti -> virhe; sitten roskaa -> virhe
await ev(`document.getElementById("importPgn").click(); true`);
check((await ev(`document.getElementById("pgnMsg").className`)).includes("err"), "tyhjä tuonti antaa virheen");
await ev(`document.getElementById("pgnInput").value = "tämä ei ole peli"; document.getElementById("importPgn").click(); true`);
check((await ev(`document.getElementById("pgnMsg").className`)).includes("err"), "virheellinen PGN antaa virheen");

await ev(`document.getElementById("pgnInput").value = ${JSON.stringify(PGN)}; document.getElementById("importPgn").click(); true`);
console.log("msg:", await ev(`document.getElementById("pgnMsg").innerText`));
check((await ev(`document.querySelectorAll("#moves .mv").length`)) === 14, "14 puolisiirtoa tuotu");
check((await ev(`document.getElementById("gameInfo").innerText`)).includes("Torsti"), "pelaajat näkyvät");

// vahvistus kun peli on jo olemassa
await ev(`document.getElementById("pgnInput").value = "1. d4 d5"; document.getElementById("importPgn").click(); true`);
check((await ev(`document.getElementById("importPgn").textContent`)).includes("Vahvista"), "korvaus vaatii vahvistuksen");
await ev(`document.getElementById("pgnInput").value = ""; document.getElementById("pgnInput").dispatchEvent(new Event("input")); true`);

for (let t = 0; t < 40; t++) {
  await sleep(4000);
  const p = (await ev(`document.getElementById("anaText").innerText`)).includes("valmis");
  if (p) break;
}
const s = JSON.parse(await ev(`JSON.stringify({
  progressHidden: document.getElementById("anaText").innerText.includes("valmis"),
  status: document.getElementById("statusText").innerText,
  cards: [...document.querySelectorAll("#pcards tbody tr")].map(c => c.innerText.replace(/\\n/g, " ")),
  turns: [...document.querySelectorAll(".turn")].map(c => c.innerText.replace(/\\n/g, " ")),
  dots: document.querySelectorAll("#graph circle").length,
  paths: document.querySelectorAll("#graph path").length,
  moves: [...document.querySelectorAll("#moves .mv")].map(b => b.innerText).join(" "),
  scrollW: document.documentElement.scrollWidth
})`));
console.log(JSON.stringify(s, null, 1));
check(s.progressHidden, "analyysi valmistui");
check(s.cards.length === 2 && /\d+ %/.test(s.cards[0]), "tarkkuus näkyy");
check(s.turns.length > 0, "käännekohtia löytyi");
check(s.dots > 0 && s.paths === 1, "käyrä ja virhepisteet piirretty");
check(s.scrollW <= 412, "ei vaakavieritystä puhelinleveydellä");

// käännekohdan napautus -> lauta siirtyy
await ev(`document.querySelector(".turn").click(); true`);
await sleep(300);
console.log("after turn click:", await ev(`document.getElementById("navPos").innerText.replace(/\\n/g," ")`));

// käyrän napautus keskeltä
await ev(`(() => { const r = document.getElementById("graph").getBoundingClientRect();
  document.getElementById("graphWrap").dispatchEvent(new MouseEvent("click", { clientX: r.left + r.width / 2, clientY: r.top + 20, bubbles: true })); return true; })()`);
await sleep(300);
const mid = await ev(`document.getElementById("navPos").innerText.replace(/\\n/g," ")`);
console.log("after graph click:", mid);
check(/7\/14/.test(mid), "käyrän keskikohta = puolisiirto 7");

// "Pelasin: Vastustaja" -> musta
await ev(`document.querySelectorAll(".pbtn")[1].click(); true`);
await sleep(300);
check((await ev(`document.querySelectorAll("#pcards tbody tr")[1].innerText`)).includes("sinä"), "pelaajavalinta asettaa oman värin");
await ev(`document.querySelectorAll(".pbtn")[0].click(); true`);

// kuvakaappaus analyysiosiosta
await sleep(500);
const box = JSON.parse(await ev(`(() => { const s = document.getElementById("anaBody").closest(".section"); s.scrollIntoView(); const r = s.getBoundingClientRect(); return JSON.stringify({x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height}); })()`));
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: box.y - 8, width: 412, height: box.h + 16, scale: 1 } });
writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
process.exit();
