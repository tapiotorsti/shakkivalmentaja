// Testaa Stockfish 19:n, aloittelijatilan (selitykset, vaarat, yksinkertaistettu näkymä) ja pelien haun.
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

// Lichess estää headless-selaimen tunnisteen, joten käytetään tavallisen Chromen tunnistetta
await send("Network.enable");
await send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 900, deviceScaleFactor: 1, mobile: true });
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: APP });
await sleep(2500);
await run(() => { localStorage.clear(); location.reload(); });
await sleep(2500);
await send("Runtime.enable");

// 1) Stockfish 19
check(await run(() => document.querySelector(".engine-name").textContent) === "Stockfish 19", "moottorin nimi: Stockfish 19");
check(await run(() => document.querySelector(".old-engine").hidden), "Stockfish 10 -huomautus piilossa");
check(await run(() => document.querySelector(".thr").textContent) !== "0,8", "virherajat päivitetty: " + await run(() => [...document.querySelectorAll(".thr")].map((e) => e.textContent).join(" / ")));
check(await waitFor(() => document.querySelectorAll("#lines .line:not(.ph):not(.empty)").length === 3, 10000), "kolme suositusta laskettu Stockfish 19:llä");

// 2) aloittelijatila
await run(() => { const t = document.getElementById("beginnerToggle"); t.checked = true; t.dispatchEvent(new Event("change")); });
await sleep(300);
const b = await run(() => ({
  body: document.body.classList.contains("beginner"),
  rows: document.querySelectorAll("#lines .line").length,
  depthHidden: getComputedStyle(document.getElementById("depth").closest(".field")).display === "none",
  fenHidden: getComputedStyle(document.getElementById("fenInput").closest(".fen")).display === "none",
  coach: document.getElementById("coach").hidden ? null : document.getElementById("coach").innerText,
}));
check(b.body && b.rows === 1, "aloittelijatila: yksi suositusrivi");
check(b.depthHidden && b.fenHidden, "syvyys ja FEN piilossa");
check(b.coach && b.coach.includes("Napauta nappulaa"), "valmentajarivi näkyy: " + b.coach);
check(await waitFor(() => /Paras siirto .+: .+ → /.test(document.querySelector("#lines .line .pv").innerText), 8000), "suositus sanoin: " + await run(() => document.querySelector("#lines .line .pv").innerText));
check(!/\(/.test(await run(() => document.getElementById("verdict").innerText)), "selkokielinen arvio ilman lukuja: " + await run(() => document.getElementById("verdict").innerText));

// nappulan selitys
await run(() => document.querySelector('.sq[data-sq="g1"]').click());
const c1 = await run(() => document.getElementById("coach").innerText);
check(c1.includes("Ratsu") && c1.includes("L-muodossa") && c1.includes("Laillisia siirtoja: 2"), "ratsun selitys: " + c1.slice(0, 80));
await run(() => document.querySelector('.sq[data-sq="g1"]').click());

// 3) vaarat: valkean ratsu g5:ssä suojaamatta, musta daami uhkaa
await run(() => { const i = document.getElementById("fenInput"); i.value = "r1bqkbnr/pppp1ppp/2n5/4p1N1/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 3 4"; document.getElementById("loadFen").click(); });
await sleep(400);
const d = await run(() => ({ warn: !!document.querySelector('.sq[data-sq="g5"] .warn'), others: document.querySelectorAll(".sq .warn").length, coach: document.getElementById("coach").innerText }));
check(d.warn && d.others === 1, "vaaramerkki vain g5:n ratsulla");
check(d.coach.includes("Ratsusi ruudussa g5 on suojaamatta"), "valmentaja varoittaa: " + d.coach);

// 4) virheen selitys sanoin (Blackburne-Shilling: 4. Rxe5?)
await run(() => { const i = document.getElementById("pgnInput"); i.value = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2"; document.getElementById("importPgn").click(); document.getElementById("importPgn").click(); });
await waitFor(() => document.getElementById("anaText").innerText.includes("valmis"), 60000);
await run(() => document.querySelector('#moves .mv[data-ply="9"]').click());
const rv = await waitFor(() => document.getElementById("review").innerText.includes("Miksi?"), 15000);
check(rv, "virheen syy sanoin: " + (await run(() => document.getElementById("review").innerText)).replace(/\n/g, " | "));
check(await run(() => getComputedStyle(document.querySelector(".turn .tev") || document.body).display === "none" || !document.querySelector(".turn .tev")), "käännekohtien luvut piilossa");

// 5) pelien haku: Lichess
await run(() => { document.getElementById("foldIO").open = true; });
await run(() => { document.getElementById("userInput").value = "german11"; document.getElementById("fetchForm").requestSubmit(); });
check(await waitFor(() => document.querySelectorAll("#gameList .grow").length > 0 || document.getElementById("fetchMsg").className.includes("err"), 20000), "Lichess-haku valmistui");
const li = await run(() => ({ n: document.querySelectorAll("#gameList .grow").length, first: (document.querySelector("#gameList .grow") || {}).innerText, msg: document.getElementById("fetchMsg").innerText }));
check(li.n > 0, "Lichess: " + li.n + " peliä | " + (li.first || "").replace(/\n/g, " ") + " | " + li.msg);
if (li.n) {
  await run(() => document.querySelector("#gameList .grow").click());
  await sleep(600);
  const imp = await run(() => ({ moves: document.querySelectorAll("#moves .mv").length, info: document.getElementById("gameInfo").innerText.replace(/\n/g, " "), me: document.querySelector("#pcards tbody") ? document.querySelector("#pcards tbody").innerText.replace(/\n/g, " ") : "" }));
  check(imp.moves > 0 && /german11/i.test(imp.info), "Lichess-peli avattu: " + imp.moves + " puolisiirtoa, " + imp.info.slice(0, 80));
}
// virheellinen käyttäjä
await run(() => { document.getElementById("userInput").value = "eioleolemassa_xq9z"; document.getElementById("fetchForm").requestSubmit(); });
await waitFor(() => document.getElementById("fetchMsg").innerText.includes("ei löytynyt") || document.getElementById("fetchMsg").className.includes("err"), 15000);
check((await run(() => document.getElementById("fetchMsg").innerText)).includes("ei löytynyt"), "tuntematon käyttäjä: " + await run(() => document.getElementById("fetchMsg").innerText));

// Chess.com
await run(() => { document.querySelector('#srcSeg button[data-v="chesscom"]').click(); document.getElementById("userInput").value = "hikaru"; document.getElementById("fetchForm").requestSubmit(); });
await waitFor(() => document.querySelectorAll("#gameList .grow").length > 0 || document.getElementById("fetchMsg").className.includes("err"), 30000);
const cc = await run(() => ({ n: document.querySelectorAll("#gameList .grow").length, first: (document.querySelector("#gameList .grow") || {}).innerText, msg: document.getElementById("fetchMsg").innerText }));
check(cc.n > 0, "Chess.com: " + cc.n + " peliä | " + (cc.first || "").replace(/\n/g, " ") + " | " + cc.msg);
if (cc.n) {
  await run(() => document.querySelector("#gameList .grow").click());
  await sleep(600);
  check((await run(() => document.querySelectorAll("#moves .mv").length)) > 0, "Chess.com-peli avattu");
  check(await run(() => document.querySelector(".sq").dataset.sq) === (await run(() => /hikaru/i.test(document.querySelector("#pcards tbody tr:last-child").innerText)) ? "h1" : "a8"), "lauta käännetty oman värin mukaan");
}

await sleep(1500);
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 412, height: 1400, scale: 1 } });
writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
process.exit();
