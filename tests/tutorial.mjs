// Testaa "Opi pelaamaan" -opetuksen: kaikki aiheet ja vaiheet läpi, väärän siirron palaute, edistyminen ja paluu omaan peliin.
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
const clickMove = (from, to) => { const q = (s) => document.querySelector('.sq[data-sq="' + s + '"]'); q(from).click(); q(to).click(); return true; };
const note = () => document.getElementById("tuNote").innerText;
const head = () => document.getElementById("tuHead").innerText.replace(/\n/g, " ");
const clickBtn = (re) => { const b = [...document.querySelectorAll("#tuActions .btn")].find((x) => new RegExp(re).test(x.innerText)); if (b) b.click(); return !!b; };

// ratkaisut aiheittain ja vaiheittain (korotuksessa valitaan daami)
const SOLUTIONS = {
  Sotilas: [["e2", "e4"], ["e4", "d5"], ["b7", "b8", "q"], ["e5", "d6"]],
  Torni: [["d4", "a4"], ["d4", "g4"]],
  Lähetti: [["c1", "h6"], ["b2", "f6"]],
  Ratsu: [["d4", "e6"], ["b1", "c3"], ["b3", "c5"]],
  Daami: [["d4", "h8"], ["d4", "g7"]],
  Kuningas: [["e1", "e2"], ["e1", "d1"], ["e1", "g1"]],
  "Shakki ja matti": [["e1", "e2"], ["a1", "a8"]],
};

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 860, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: APP });
await sleep(2000);
await run(() => { localStorage.clear(); localStorage.setItem("shakkivalmentaja.v1", JSON.stringify({ pgn: "1. d4 d5 2. c4", myColor: "b", flipped: true, depth: 12, multipv: 3 })); location.reload(); });
await sleep(2500);
await send("Runtime.enable");

await run(() => document.querySelector('.tab[data-t="games"]').click());
await sleep(300);
const rows = await run(() => [...document.querySelectorAll("#lessonList .lesson")].map((b) => b.innerText.replace(/\n/g, " ")));
check(rows.length === 7 && rows.every((r) => /0\/\d/.test(r)), "seitsemän aihetta, ei vielä edistymistä: " + rows.map((r) => r.split(" ")[1]).join(", "));

// aloitetaan torni ja kokeillaan väärää siirtoa
await run(() => [...document.querySelectorAll("#lessonList .lesson")].find((b) => b.innerText.includes("Torni")).click());
await sleep(400);
check(await run(() => !document.getElementById("tutorialSec").hidden) && (await run(head)).includes("Torni 1/2"), "opetus alkoi: " + await run(head));
check(await run(() => document.querySelector('.sq[data-sq="a4"]').classList.contains("goalsq")), "tavoiteruutu a4 merkitty");
check(await run(() => document.querySelector(".lname") !== null && document.querySelector('.sq[data-sq="d4"] .piece') !== null), "torni laudalla d4:ssä");
check((await run(() => document.querySelector("#lines .line").innerText)).includes("Opetus käynnissä"), "moottorin apu piilossa");
await run(clickMove, "d4", "d7");
check((await run(note)).startsWith("Ei aivan"), "väärä siirto: " + await run(note));
await sleep(1200);
check(await run(() => !!document.querySelector('.sq[data-sq="d4"] .piece')), "lauta palasi alkuun");
if (OUT) {
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 412, height: 860, scale: 1 } });
  writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
}
await run(clickBtn, "Lopeta");
await sleep(300);

// kaikki aiheet läpi
for (const [name, sols] of Object.entries(SOLUTIONS)) {
  await run(() => document.querySelector('.tab[data-t="games"]').click());
  await run((n) => [...document.querySelectorAll("#lessonList .lesson")].find((b) => b.querySelector(".lname").firstChild.textContent === n).click(), name);
  await sleep(300);
  let okAll = true, fails = [];
  for (let i = 0; i < sols.length; i++) {
    const [from, to, promo] = sols[i];
    await run(clickMove, from, to);
    if (promo) { await sleep(100); await run(() => document.querySelector('#promoBox button[aria-label="Daami"]').click()); }
    await sleep(250);
    const n = await run(note);
    if (!n.startsWith("Oikein")) { okAll = false; fails.push((i + 1) + ": " + n); }
    if (i < sols.length - 1) { await run(clickBtn, "^Seuraava$"); await sleep(250); }
  }
  check(okAll, name + ": " + sols.length + " vaihetta ratkaistu" + (fails.length ? " | " + fails.join(" | ") : ""));
  await run(clickBtn, "Lopeta");
  await sleep(300);
}

const after = await run(() => [...document.querySelectorAll("#lessonList .lesson")].map((b) => b.innerText.replace(/\n/g, " ")));
check(after.every((r) => r.includes("valmis")), "kaikki aiheet merkitty valmiiksi");
const back = await run(() => ({ moves: document.querySelectorAll("#moves .mv").length, hidden: document.getElementById("tutorialSec").hidden, flipped: document.querySelector(".sq").dataset.sq }));
check(back.moves === 3 && back.hidden && back.flipped === "h1", "opetuksen jälkeen oma peli ja laudan suunta palasivat");

// edistyminen säilyy uudelleenlatauksessa
await run(() => location.reload());
await sleep(2500);
await send("Runtime.enable");
await run(() => document.querySelector('.tab[data-t="games"]').click());
await sleep(300);
check((await run(() => document.querySelectorAll("#lessonList .lprog.done").length)) === 7, "edistyminen säilyi uudelleenlatauksessa");
check((await run(() => document.querySelectorAll("#moves .mv").length)) === 3, "oma peli säilyi uudelleenlatauksessa");
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
process.exit();
