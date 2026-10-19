// Testaa nappuloiden liikeanimaation: siirto, lyönti, linnoitus, selaus ja käännetty lauta.
const CDP = process.env.CDP_URL || "http://127.0.0.1:9333"; // headless-Chromen etäohjausosoite
const APP = process.env.APP_URL || "http://127.0.0.1:8765/"; // paikallisesti tarjoiltu sovellus
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
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 900, deviceScaleFactor: 1, mobile: true });
await sleep(2000);
await ev(`localStorage.clear(); localStorage.setItem("shakkivalmentaja.v1", JSON.stringify({pgn: "1. e4 d5 2. Nf3 Nf6 3. Bc4 e6", myColor: "w", depth: 8, multipv: 1})); location.reload(); true`);
await sleep(2500);
await send("Runtime.enable");

// Animaatiot: kerätään liikkuvien nappuloiden ruudut heti siirron jälkeen
const anims = `JSON.stringify(document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains("piece")).map(a => {
  const t = a.effect.target; const sq = t.closest(".sq"); return (t.classList.contains("ghost") ? "ghost:" : "move:") + (sq ? sq.dataset.sq : "?");
}).sort())`;
const mv = (from, to) => ev(`(() => { const q = s => document.querySelector('.sq[data-sq="'+s+'"]'); q("${from}").click(); q("${to}").click(); return ${anims}; })()`);

let a = JSON.parse(await mv("e4", "d5"));
check(a.includes("move:d5") && a.includes("ghost:d5"), "lyönti: nappula liukuu ja lyöty häivytetään " + JSON.stringify(a));
await sleep(400);
check((await ev(`document.querySelectorAll(".ghost").length`)) === 0, "häivytetty nappula poistuu animaation jälkeen");
check((await ev(`document.getAnimations().filter(a => a.effect.target.classList.contains("piece")).length`)) === 0, "animaatiot päättyvät");

await mv("f6", "d5");
await sleep(400);
a = JSON.parse(await mv("e1", "g1"));
check(a.includes("move:g1") && a.includes("move:f1") && a.length === 2, "linnoitus: kuningas ja torni liukuvat " + JSON.stringify(a));
await sleep(400);

a = JSON.parse(await ev(`(() => { document.getElementById("navPrev").click(); return ${anims}; })()`));
check(a.includes("move:e1") && a.includes("move:h1"), "selaus taaksepäin animoituu " + JSON.stringify(a));
await sleep(400);

a = JSON.parse(await ev(`(() => { document.getElementById("flipBtn").click(); return ${anims}; })()`));
check(a.length === 0, "laudan kääntö ei lennätä nappuloita");

a = JSON.parse(await ev(`(() => { document.getElementById("navStart").click(); return ${anims}; })()`));
console.log("alkuasemaan hyppy, animaatioita:", a.length);
check(a.length <= 16, "iso hyppy pysyy hallittuna");

// vähennetty liike -> ei animaatioita
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await ev(`location.reload(); true`);
await sleep(2500);
await send("Runtime.enable");
a = JSON.parse(await ev(`(() => { document.getElementById("navPrev").click(); return ${anims}; })()`));
check(a.length === 0, "vähennetty liike: ei animaatioita");
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
process.exit();
