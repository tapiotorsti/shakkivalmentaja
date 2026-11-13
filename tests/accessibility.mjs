// Testaa saavutettavuutta: laudan käyttö näppäimistöllä, ruutujen nimet ruudunlukijalle,
// tilailmoitukset ja F-oikotien rajaus laudalle (WCAG 1.3.1, 2.1.1, 2.1.4, 4.1.2, 4.1.3).
const CDP = process.env.CDP_URL || "http://127.0.0.1:9333"; // headless-Chromen etäohjausosoite
const APP = process.env.APP_URL || "http://127.0.0.1:8765/"; // paikallisesti tarjoiltu sovellus
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
const press = async (key, code, vk, text) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, text });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  await sleep(150);
};
const enter = () => press("Enter", "Enter", 13, "\r");
const focusSq = (sq) => run((s) => { document.querySelector('.sq[data-sq="' + s + '"]').focus(); return true; }, sq);
const label = (sq) => run((s) => document.querySelector('.sq[data-sq="' + s + '"]').getAttribute("aria-label"), sq);
const activeSq = () => run(() => document.activeElement && document.activeElement.dataset.sq);
const loadFen = (fen) => run((f) => { document.getElementById("fenInput").value = f; document.getElementById("loadFen").click(); return true; }, fen);

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 860, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: APP });
await sleep(1500);
await run(() => { localStorage.clear(); location.reload(); return true; });
await sleep(2000);
await send("Runtime.enable");

check(await run(() => document.getElementById("board").getAttribute("role")) === "group", "lauta on ryhmä, ei rakenteeton ruudukko");

// siirto näppäimistöllä: kohdistus säilyy ja ruutujen nimet kertovat tilan
await focusSq("g1");
await enter();
check(await activeSq() === "g1", "kohdistus pysyi valitussa ruudussa uudelleenpiirron jälkeen");
check(/valkea ratsu, valittu/.test(await label("g1")), "valittu nappula: " + await label("g1"));
check(/siirto mahdollinen/.test(await label("f3")) && /siirto mahdollinen/.test(await label("h3")), "mahdolliset siirrot: " + await label("f3"));
check(!/mahdollinen/.test(await label("g3")), "muu ruutu ei ole mahdollinen siirto");
await focusSq("f3");
await enter();
check(await activeSq() === "f3", "kohdistus pysyi kohderuudussa siirron jälkeen");
check(/valkea ratsu, viimeisin siirto/.test(await label("f3")), "siirretty nappula: " + await label("f3"));
check(await run(() => document.querySelectorAll("#moves .mv").length) === 1, "siirto tehtiin näppäimistöllä");

// lyönti ja shakki
await loadFen("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1");
await sleep(300);
await focusSq("e4"); await enter();
check(/lyönti mahdollinen/.test(await label("d5")), "lyönti: " + await label("d5"));
await press("Escape", "Escape", 27);
await loadFen("4k3/8/8/8/8/8/8/4R1K1 b - - 0 1");
await sleep(300);
check(/musta kuningas, shakissa/.test(await label("e8")), "shakki: " + await label("e8"));

// F kääntää laudan vain, kun kohdistus on laudalla
const corner = () => run(() => document.querySelector(".sq").dataset.sq);
const before = await corner();
await run(() => { document.querySelector('.tab[data-t="now"]').focus(); return true; });
await press("f", "KeyF", 70, "f");
check(await corner() === before, "F ei käännä lautaa, kun kohdistus on muualla");
await focusSq("e1");
await press("f", "KeyF", 70, "f");
check(await corner() !== before, "F kääntää laudan, kun kohdistus on laudalla");

// ohjeikkuna: tausta ei saa kohdistusta (WCAG 2.4.3, 2.4.11)
const outsideApp = () => run(() => !document.querySelector(".app").contains(document.activeElement));
await run(() => { document.getElementById("helpBtn").focus(); document.getElementById("helpBtn").click(); return true; });
await sleep(200);
check(await run(() => document.querySelector(".app").inert === true), "ohjeen ajaksi taustasivu on inert-tilassa");
let staysOut = true;
for (let i = 0; i < 4; i++) { await press("Tab", "Tab", 9); if (!(await outsideApp())) staysOut = false; }
check(staysOut, "Tab ei vie kohdistusta ohjeen taakse");
await press("Escape", "Escape", 27);
check(await run(() => document.getElementById("help").hidden && !document.querySelector(".app").inert && document.activeElement.id === "helpBtn"),
  "Esc sulkee ohjeen ja kohdistus palaa Ohje-painikkeeseen");

// korotusvalikko: kohdistus valikkoon, Esc peruu, valinta palauttaa kohdistuksen laudalle
await loadFen("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
await sleep(300);
const openPromo = async () => { await focusSq("b7"); await enter(); await focusSq("b8"); await enter(); await sleep(150); };
await openPromo();
check(await run(() => !document.getElementById("promo").hidden && document.activeElement.getAttribute("aria-label") === "Daami"), "korotusvalikko avautui ja kohdistus siirtyi Daami-vaihtoehtoon");
check(await run(() => document.getElementById("board").inert === true), "valikon alla oleva lauta on inert-tilassa");
await press("Escape", "Escape", 27);
check(await run(() => document.getElementById("promo").hidden && !document.getElementById("board").inert), "Esc sulki valikon");
check(await activeSq() === "b7" && /valkea sotilas/.test(await label("b7")), "korotus peruttiin ja kohdistus palasi sotilaaseen");
await openPromo();
await enter(); // Daami
await sleep(200);
check(/valkea daami/.test(await label("b8")) && await activeSq() === "b8", "valinta korotti daamiksi ja kohdistus on uudessa nappulassa");

// tilailmoitukset
const roles = await run(() => ["playState", "playMsg", "tuTask", "tuNote", "prState", "prNote", "fetchMsg", "pgnMsg", "fenMsg"]
  .filter((i) => document.getElementById(i).getAttribute("role") !== "status"));
check(roles.length === 0, "palaute- ja tilarivit ovat tilailmoituksia (role=status)" + (roles.length ? ": puuttuu " + roles.join(", ") : ""));

console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
ws.close();
