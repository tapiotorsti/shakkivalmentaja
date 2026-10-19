// Mittaa sivun asettelun siirtymät (CLS) puhelinleveydellä, kun moottori laskee ja analysoi peliä.
const CDP = process.env.CDP_URL || "http://127.0.0.1:9333"; // headless-Chromen etäohjausosoite
const APP = process.env.APP_URL || "http://127.0.0.1:8765/"; // paikallisesti tarjoiltu sovellus
// Käyttäjän syötettä seuraavat siirtymät eivät kuulu mittariin (hadRecentInput).
const URL_ = APP;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = await (await fetch(CDP + "/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 900, deviceScaleFactor: 1, mobile: true });
await send("Page.enable");
await send("Page.navigate", { url: URL_ });
await sleep(2500);
await ev(`localStorage.clear(); localStorage.setItem("shakkivalmentaja.v1", JSON.stringify({pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#", myColor: "w", depth: 14, multipv: 3})); true`);
// mittari päälle heti sivun latauksesta
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__cls = 0; window.__shifts = [];
  new PerformanceObserver((list) => { for (const e of list.getEntries()) { if (!e.hadRecentInput) { window.__cls += e.value;
    window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources || []).map(s => s.node ? (s.node.id || s.node.className || s.node.nodeName) : "?").slice(0, 3).join(",") }); } } })
    .observe({ type: "layout-shift", buffered: true });` });
await send("Page.reload");
await sleep(4000);
const atLoad = await ev(`window.__cls`);
// selataan ohjelmallisesti (ei käyttäjän syöte -> siirtymät lasketaan) ja annetaan moottorin laskea
for (const ply of [3, 6, 9, 12, 14]) {
  await ev(`document.querySelector('#moves .mv[data-ply="${ply}"]').click(); true`);
  await sleep(5000);
}
const res = JSON.parse(await ev(`JSON.stringify({ cls: window.__cls, shifts: window.__shifts })`));
console.log("CLS latauksessa:", atLoad.toFixed(4), "| CLS yhteensä:", res.cls.toFixed(4), "| siirtymiä:", res.shifts.length);
const bySrc = {};
res.shifts.filter((s) => s.t > 4000).forEach((s) => { bySrc[s.src] = (bySrc[s.src] || 0) + s.v; });
console.log("latauksen jälkeen lähteittäin:", JSON.stringify(bySrc));
// raja 0,05: selvästi alle hyvän käyttökokemuksen rajan 0,1
console.log((res.cls < 0.05 ? "ok: " : "FAIL: ") + "asettelun siirtymät pieniä (CLS " + res.cls.toFixed(4) + ")");
if (res.cls >= 0.05) process.exitCode = 1;
process.exit(process.exitCode || 0);
