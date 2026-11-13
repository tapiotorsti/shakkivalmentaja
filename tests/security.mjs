// Testaa sisältöturvakäytännön (CSP): sovelluksen oma toiminta ei aiheuta yhtään estoa
// (moottorit, service worker, peli konetta vastaan), mutta sivulle lisätty vieras skripti estetään.
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
const waitFor = async (fn, ms, ...args) => { const end = Date.now() + ms; while (Date.now() < end) { if (await run(fn, ...args)) return true; await sleep(300); } return false; };

// CSP-estot kerätään ennen kuin sivun omat skriptit ajetaan
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source:
  "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline')));" });
await send("Page.navigate", { url: APP });
await sleep(1500);
await run(() => { localStorage.clear(); location.reload(); return true; });
await sleep(1500);
await send("Runtime.enable");

const csp = await run(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || "");
const inline = await run(() => [...document.scripts].filter((s) => !s.src).length);
check(/script-src 'self' 'wasm-unsafe-eval'( 'sha256-[A-Za-z0-9+/=]+')+/.test(csp), "CSP-meta löytyy");
check((csp.match(/'sha256-/g) || []).length === inline, "jokaiselle sisäiselle skriptille on tiiviste (" + inline + ")");

check(await waitFor(() => /Valmis/.test(document.getElementById("statusText").innerText), 30000), "analyysimoottori käynnistyi (Web Worker ja WebAssembly)");
check(await waitFor(async () => !!(await navigator.serviceWorker.getRegistration()), 10000), "service worker rekisteröityi");

// peli konetta vastaan käynnistää toisen moottorin
await run(() => {
  document.querySelector('.tab[data-t="more"]').click();
  document.querySelector('#playColor button[data-v="w"]').click();
  const lvl = document.getElementById("playLevel"); lvl.value = 1; lvl.dispatchEvent(new Event("input"));
  document.getElementById("playStart").click();
  return true;
});
await sleep(500);
await run(() => { const q = (s) => document.querySelector('.sq[data-sq="' + s + '"]'); q("e2").click(); q("e4").click(); return true; });
check(await waitFor(() => document.querySelectorAll("#moves .mv").length >= 2, 20000), "kone vastasi siirtoon (toinen moottori)");

const own = await run(() => window.__csp.slice());
check(own.length === 0, "sovelluksen oma toiminta ei aiheuttanut CSP-estoja" + (own.length ? ": " + own.join(" | ") : ""));

// vieras sisäinen skripti estetään
await run(() => { const s = document.createElement("script"); s.textContent = "window.__injected = true"; document.body.appendChild(s); return true; });
await sleep(300);
check(await run(() => window.__injected !== true), "sivulle lisätty vieras skripti estettiin");
const after = await run(() => window.__csp.slice());
check(after.length === 1 && /^script-src/.test(after[0]), "esto kirjattiin: " + after.join(" | "));

console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
ws.close();
