// Testaa välilehdet ja sen, että puhelinnäkymä mahtuu ilman sivun vieritystä. Ottaa kuvat kahdesta välilehdestä.
import { writeFileSync } from "node:fs";
const CDP = process.env.CDP_URL || "http://127.0.0.1:9333"; // headless-Chromen etäohjausosoite
const APP = process.env.APP_URL || "http://127.0.0.1:8765/"; // paikallisesti tarjoiltu sovellus
const DIR = process.argv[2];
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
const shot = async (name, w, h) => { const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } }); writeFileSync(DIR + "/" + name, Buffer.from(r.result.data, "base64")); };
const visible = () => [...document.querySelectorAll("#tabBody > [data-tab]")].filter((e) => getComputedStyle(e).display !== "none" && !e.hidden).map((e) => e.dataset.tab + ":" + (e.querySelector("h2") ? e.querySelector("h2").textContent : e.className)).join(", ");

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 860, deviceScaleFactor: 1, mobile: true });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await send("Page.navigate", { url: APP });
await sleep(2000);
await run(() => { localStorage.clear(); localStorage.setItem("shakkivalmentaja.v1", JSON.stringify({ pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#", myColor: "w", depth: 14, multipv: 3 })); location.reload(); });
await sleep(6000);
await send("Runtime.enable");

const m = await run(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, body: document.getElementById("tabBody").style.maxHeight }));
check(m.sh <= m.ih + 2, "puhelin: koko näkymä mahtuu näytölle (sivun korkeus " + m.sh + " / näyttö " + m.ih + ", sisältöalue " + m.body + ")");
check((await run(visible)).startsWith("now:"), "aluksi Suositus: " + await run(visible));
check(await run(() => { const c = document.querySelector(".controls"); return Math.round(c.getBoundingClientRect().height) < 50; }), "ohjausrivi yhdellä rivillä");
await shot("tab-now.png", 412, 860);

await run(() => document.querySelector('.tab[data-t="moves"]').click());
await sleep(400);
check((await run(visible)) === "moves:Siirrot", "Siirrot-välilehti: " + await run(visible));
check(await run(() => document.querySelectorAll("#moves .mv").length) === 14, "siirtolista näkyy");
await shot("tab-moves.png", 412, 860);

await run(() => document.querySelector('.tab[data-t="more"]').click());
await sleep(200);
check((await run(visible)).includes("more:"), "Lisää-välilehti: " + await run(visible));
check(await run(() => !!document.getElementById("newBtn").offsetParent), "Uusi peli Lisää-välilehdellä");

// tuonti avaa analyysin
await run(() => { document.getElementById("pgnInput").value = "1. d4 d5 2. c4"; document.getElementById("importPgn").click(); document.getElementById("importPgn").click(); });
await sleep(500);
check((await run(visible)).startsWith("ana:"), "tuonti avaa Analyysin: " + await run(visible));
check((await run(() => document.documentElement.scrollHeight)) <= 862, "edelleen ilman sivun vieritystä");

// valittu välilehti muistetaan
await run(() => location.reload());
await sleep(2500);
await send("Runtime.enable");
check((await run(visible)).startsWith("ana:"), "välilehti muistettiin uudelleenlatauksessa");

// leveä näyttö: siirrot Suositus-välilehdellä, Siirrot-painike piilossa
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
await run(() => document.querySelector('.tab[data-t="now"]').click());
await sleep(500);
const wide = await run(visible);
check(wide.includes("now:Moottorin suositukset") && wide.includes("moves:Siirrot"), "leveä: siirrot suositusten kanssa: " + wide);
check(await run(() => getComputedStyle(document.querySelector('.tab[data-t="moves"]').parentElement.querySelector('[data-t="moves"]')).display === "none"), "leveä: Siirrot-painike piilossa");
await shot("tab-desk.png", 1280, 860);
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
process.exit();
