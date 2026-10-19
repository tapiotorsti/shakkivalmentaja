// Testaa siirtolistan selauksen ja sivuvariantit headless-Chromessa.
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

await send("Runtime.enable");
await sleep(2500);
await ev(`localStorage.setItem("shakkivalmentaja.v1", JSON.stringify({pgn:"1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5", myColor:"w", depth:12, multipv:3})); location.reload(); true`);
await sleep(2500);
await send("Runtime.enable");

const S = () => ev(`JSON.stringify({
  nav: document.getElementById("navPos").innerText.replace(/\\n/g," "),
  fen: document.getElementById("fenInput").value,
  cur: [...document.querySelectorAll(".mv.cur")].map(b => b.dataset.line + ":" + b.dataset.ply + ":" + b.innerText),
  off: document.querySelectorAll("#moves .mv.off").length,
  mainCount: document.querySelectorAll("#moves .mv").length,
  varVisible: !document.getElementById("varBox").hidden,
  varMoves: document.getElementById("varMoves").innerText.replace(/\\n/g," "),
  varFrom: document.getElementById("varFrom").innerText,
  review: document.getElementById("review").innerText.split("\\n").slice(0,2).join(" | "),
  status: document.getElementById("statusText").innerText,
  lines: document.querySelectorAll("#lines .line:not(.empty)").length,
  prevDisabled: document.getElementById("navPrev").disabled, nextDisabled: document.getElementById("navNext").disabled
})`).then(JSON.parse);
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
const mv = (from, to) => ev(`(() => { const q = s => document.querySelector('.sq[data-sq="'+s+'"]'); q("${from}").click(); q("${to}").click(); return true; })()`);
const key = (k) => ev(`document.dispatchEvent(new KeyboardEvent("keydown", {key: "${k}", bubbles: true})); true`);
const log = async (label) => { const s = await S(); console.log(label.padEnd(26), JSON.stringify(s)); return s; };
const check = (cond, msg) => { if (!cond) { console.log("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg); };

let s = await log("start (end)");
check(s.nextDisabled && !s.prevDisabled && s.mainCount === 8, "lopussa, 8 siirtoa");

await click("#navPrev"); await click("#navPrev"); await click("#navPrev");
s = await log("3x prev");
check(s.fen.startsWith("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b"), "ply 5 = 3.Lc4 jälkeen");
check(s.cur[0] === "main:5:Lc4", "Lc4 korostettu");

await key("ArrowLeft");
s = await log("ArrowLeft");
check(s.cur[0] === "main:4:Rc6", "nuolinäppäin taaksepäin");

await click('#moves .mv[data-ply="2"]');
s = await log("click ply 2 (e5)");
check(s.cur[0] === "main:2:e5" && s.review.includes("e5"), "siirtoa napauttamalla asemaan ja arvio");

await mv("g1", "f3");
s = await log("same move Rf3");
check(s.cur[0] === "main:3:Rf3" && !s.varVisible && s.mainCount === 8, "sama siirto vain etenee");

await mv("d7", "d6");
s = await log("different move d6");
check(s.varVisible && s.off === 5 && s.mainCount === 8 && s.cur[0] === "var:4:d6", "eri siirto -> sivuvariantti, peli säilyy");

await mv("d2", "d4");
s = await log("var continues d4");
check(s.varMoves.includes("d6") && s.varMoves.includes("d4") && s.nav.toLowerCase().includes("sivuvariantti"), "variantti jatkuu");

await click('#moves .mv[data-ply="2"]');
s = await log("main ply 2 (shared)");
check(s.varVisible && s.cur[0] === "main:2:e5", "yhteinen alku: variantti säilyy");

await click('#varMoves .mv[data-ply="5"]');
s = await log("back to var end");
await click("#undoBtn");
s = await log("undo in var");
check(s.varVisible && !s.varMoves.includes("d4"), "peru poistaa variantin siirron");

await click("#varExit");
s = await log("palaa peliin");
check(!s.varVisible && s.cur[0] === "main:3:Rf3", "palaa haarautumiskohtaan");

await mv("d7", "d6");
await click("#varPromote");
s = await log("promote 1st click");
await click("#varPromote");
s = await log("promote confirm");
check(!s.varVisible && s.mainCount === 4 && s.nextDisabled, "variantti korvasi pelin");

await key("Home");
s = await log("Home");
check(s.nav.startsWith("Alkuasema") && s.prevDisabled, "Home alkuasemaan");
await key("End");
s = await log("End");

await sleep(15000);
s = await log("after engine settle");
check(s.lines > 0, "moottori analysoi näytettävää asemaa");
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
process.exit();
