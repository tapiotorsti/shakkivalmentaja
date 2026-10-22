// Testaa pelikirjaston (tallennus, avaus, poisto) ja "Harjoittele virheitäsi" -tehtävät.
import { writeFileSync } from "node:fs";
const CDP = process.env.CDP_URL || "http://127.0.0.1:9333"; // headless-Chromen etäohjausosoite
const APP = process.env.APP_URL || "http://127.0.0.1:8765/"; // paikallisesti tarjoiltu sovellus
const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = await (await fetch(CDP + "/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (fn, ...args) => {
  const r = await send("Runtime.evaluate", { expression: "(" + fn.toString() + ")(" + args.map((a) => JSON.stringify(a)).join(",") + ")", returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
  return r.result?.result?.value;
};
const check = (c, msg) => { console.log((c ? "ok: " : "FAIL: ") + msg); if (!c) process.exitCode = 1; };
const waitFor = async (fn, ms, ...args) => { const end = Date.now() + ms; while (Date.now() < end) { if (await run(fn, ...args)) return true; await sleep(300); } return false; };

// sivun apufunktiot: IndexedDB:n luku ja siirto ruudusta ruutuun
const idbAll = (store) => new Promise((res) => {
  const r = indexedDB.open("shakkivalmentaja", 1);
  r.onsuccess = () => { const q = r.result.transaction(store, "readonly").objectStore(store).getAll(); q.onsuccess = () => { res(q.result); r.result.close(); }; };
  r.onerror = () => res([]);
});
const clickMove = (from, to) => { const q = (s) => document.querySelector('.sq[data-sq="' + s + '"]'); q(from).click(); q(to).click(); return true; };
const fen = () => document.getElementById("fenInput").value;
const note = () => document.getElementById("prNote").innerText;

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 860, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: APP });
await sleep(2000);
await run(() => new Promise((res) => { localStorage.clear(); const d = indexedDB.deleteDatabase("shakkivalmentaja"); d.onsuccess = d.onerror = d.onblocked = () => res(true); }));
await run(() => location.reload());
await sleep(2500);
await send("Runtime.enable");

// 1) tyhjä kirjasto
await run(() => document.querySelector('.tab[data-t="games"]').click());
await sleep(400);
check((await run(() => document.getElementById("prCard").innerText)).includes("Ei vielä tehtäviä"), "tyhjä kirjasto: ei tehtäviä");

// 2) peli tuodaan ja analysoidaan -> tallentuu kirjastoon ja tehtäviksi
// valkea jättää lähetin lyötäväksi kahdesti tasaisessa asemassa (2. La6?? ja 3. d3??), musta ei lyö välissä
await run(() => { document.getElementById("pgnInput").value = "1. e4 e5 2. Ba6 Nf6 3. d3 bxa6"; document.getElementById("importPgn").click(); });
check(await waitFor(() => document.getElementById("anaText").innerText.includes("valmis"), 90000), "analyysi valmistui");
await sleep(2500);
const games = await run(idbAll, "games");
check(games.length === 1 && games[0].complete && games[0].evals.length >= 6, "peli tallentui kirjastoon arvioineen (" + (games[0] && games[0].evals.length) + " arviota)");
let puzzles = await run(idbAll, "puzzles");
check(puzzles.length === 2 && puzzles.every((p) => p.color === "w"), "omista virheistä syntyi " + puzzles.length + " tehtävää: " + puzzles.map((p) => p.label + " " + p.played).join(", "));
await run(() => document.querySelector('.tab[data-t="games"]').click());
await sleep(500);
const lib = await run(() => ({ rows: document.querySelectorAll("#libList .librow").length, first: (document.querySelector("#libList .librow") || {}).innerText, card: document.getElementById("prCard").innerText }));
check(lib.rows === 1 && /vs/.test(lib.first), "kirjastossa rivi: " + (lib.first || "").replace(/\n/g, " "));
check(/odottaa/.test(lib.card), "harjoituskortti: " + lib.card.replace(/\n/g, " "));

// 3) harjoitus: väärä siirto (alkuperäinen virhe) ja oikea siirto
await run(() => document.querySelector("#prCard .btn.primary").click());
await sleep(800);
check(await run(() => !document.getElementById("practiceSec").hidden), "harjoitus alkoi Suositus-välilehdellä");
const p1fen = await run(fen);
let p1 = puzzles.find((p) => p.fen === p1fen);
check(!!p1, "laudalla tehtävän asema (" + (p1 && p1.label) + ")");
check((await run(() => document.querySelector("#lines .line").innerText)).includes("Tehtävä käynnissä"), "moottorin apu piilossa");
if (OUT) {
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 412, height: 860, scale: 1 } });
  writeFileSync(OUT.replace(/.png$/, "-tehtava.png"), Buffer.from(shot.result.data, "base64"));
}
// alkuperäinen virhesiirto
const wrong = await run((f, played) => { const map = { Q: "D", R: "T", B: "L", N: "R" }; const c = new Chess(f); const m = c.moves({ verbose: true }).find((x) => x.san.replace(/[QRBN]/g, (ch) => map[ch]) === played); return m ? [m.from, m.to] : null; }, p1fen, p1.played);
await run(clickMove, wrong[0], wrong[1]);
check(await waitFor(() => document.getElementById("prNote").innerText.includes("Ei aivan"), 20000), "väärä siirto: " + await run(note));
check(await waitFor((f) => document.getElementById("fenInput").value === f, 3000, p1fen), "lauta palasi tehtävän asemaan");
await run(clickMove, p1.best.slice(0, 2), p1.best.slice(2, 4));
check(await waitFor(() => document.getElementById("prNote").innerText.startsWith("Oikein"), 5000), "oikea siirto: " + await run(note));
check((await run(() => document.querySelector("#lines .line").innerText)).indexOf("Tehtävä käynnissä") < 0, "ratkaisun jälkeen apu näkyy");

// 4) seuraava tehtävä: vihje ja ratkaisu
await run(() => [...document.querySelectorAll("#prActions .btn")].find((b) => /Seuraava|Näytä tulos/.test(b.innerText)).click());
await sleep(600);
const p2fen = await run(fen);
const p2 = puzzles.find((p) => p.fen === p2fen);
if (p2) {
  await run(() => [...document.querySelectorAll("#prActions .btn")].find((b) => b.innerText === "Vihje").click());
  await sleep(200);
  check(await run((sq) => document.querySelector('.sq[data-sq="' + sq + '"]').classList.contains("hintsq"), p2.best.slice(0, 2)), "vihje korostaa siirrettävän nappulan");
  await run(() => [...document.querySelectorAll("#prActions .btn")].find((b) => b.innerText === "Näytä ratkaisu").click());
  await sleep(300);
  check((await run(note)).startsWith("Ratkaisu:") && await run(() => !!document.querySelector('#arrows polygon[stroke-dasharray]')), "ratkaisu näytetään nuolena: " + await run(note));
}
// loput tehtävät ohitetaan, kunnes kierros päättyy
for (let i = 0; i < 12 && !(await run(() => document.getElementById("prHead").innerText.includes("valmis"))); i++) {
  await run(() => { const b = [...document.querySelectorAll("#prActions .btn")].find((x) => /Seuraava|Näytä tulos|Ohita/.test(x.innerText)); if (b) b.click(); });
  await sleep(400);
}
check((await run(() => document.getElementById("prState").innerText)).includes("Ratkaisit 0/2"), "yhteenveto (väärä yritys ja näytetty ratkaisu eivät ole puhtaita): " + await run(() => document.getElementById("prState").innerText));
await run(() => [...document.querySelectorAll("#prActions .btn")].find((b) => b.innerText === "Lopeta harjoitus").click());
await sleep(600);
check(await run(() => document.querySelectorAll("#moves .mv").length) === 6 && await run(() => document.getElementById("practiceSec").hidden), "harjoituksen jälkeen oma peli palasi laudalle");

// 5) kertausvälit tallentuivat
puzzles = await run(idbAll, "puzzles");
const s1 = puzzles.find((p) => p.id === p1.id), s2 = p2 && puzzles.find((p) => p.id === p2.id);
check(s1.box === 0 && s1.due - Date.now() < 15 * 60000, "väärän yrityksen jälkeen ratkaistu tulee pian uudelleen (laatikko " + s1.box + ")");
if (s2) check(s2.box === 0 && s2.attempts >= 1, "näytetty ratkaisu palaa pian uudelleen");

// 6) säilyy uudelleenlatauksessa; avaus kirjastosta on heti analysoitu
await run(() => location.reload());
await sleep(2500);
await send("Runtime.enable");
await run(() => document.getElementById("newBtn").click());
await run(() => document.getElementById("newBtn").click());
await sleep(300);
check(await run(() => document.querySelectorAll("#moves .mv").length) === 0, "uusi peli tyhjensi laudan");
await run(() => document.querySelector('.tab[data-t="games"]').click());
await sleep(500);
check(await run(() => document.querySelectorAll("#libList .librow").length) === 1, "kirjasto säilyi uudelleenlatauksessa");
await run(() => document.querySelector("#libList .grow").click());
check(await waitFor(() => document.getElementById("anaText").innerText.includes("valmis"), 2500), "kirjastopeli avautui valmiiksi analysoituna: " + await run(() => document.getElementById("anaText").innerText));
if (OUT) {
  await run(() => document.querySelector('.tab[data-t="games"]').click());
  await sleep(400);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 412, height: 860, scale: 1 } });
  writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
}

// 7) poisto
await run(() => document.querySelector('.tab[data-t="games"]').click());
await run(() => document.getElementById("libEdit").click());
await sleep(300);
await run(() => document.querySelector("#libList .del").click());
await sleep(800);
check(await run(() => document.querySelectorAll("#libList .librow").length) === 0 && (await run(idbAll, "puzzles")).length === 0, "poisto poisti pelin ja sen tehtävät");
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
process.exit();
