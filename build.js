// Rakentaa Firebase Hosting -version (public/) lähdetiedostosta shakkivalmentaja.html.
// Käyttö: node build.js   (ajetaan automaattisesti ennen `firebase deploy` -komentoa)
const fs = require("fs");
const path = require("path");

const root = __dirname;
const pub = path.join(root, "public");
let src = fs.readFileSync(path.join(root, "shakkivalmentaja.html"), "utf8");

function replaceOnce(str, from, to) {
  if (!str.includes(from)) throw new Error("build.js: kohtaa ei löytynyt: " + from);
  return str.replace(from, to);
}

const HEAD_EXTRA = `<meta name="description" content="Shakkilauta, johon syötät siirrot ja Stockfish näyttää parhaat jatkot nuolina.">
<meta name="theme-color" content="#1f4e79">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Valmentaja">
<style>
[hidden] { display: none !important; }
img { max-width: 100%; }
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
.install { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.install .hint { margin: 0; }
.install-hint {
  margin: 0; padding: 10px 14px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--surface); font-size: .9rem;
}
@media (display-mode: standalone) { #installRow, .install-hint { display: none !important; } }
</style>
`;

const INSTALL_UI = `<div class="install" id="installRow" hidden>
      <button class="btn" id="installBtn" type="button">Asenna sovellus</button>
      <span class="hint">Avaa kotinäytöltä omana sovelluksenaan, toimii myös ilman verkkoa.</span>
    </div>
    <p class="install-hint" id="iosHint" hidden>Asenna iPhoneen tai iPadiin: avaa sivu Safarissa, napauta <b>Jaa</b>-painiketta (neliö ja nuoli ylös) ja valitse <b>Lisää Koti-valikkoon</b>.</p>
    <p class="note">`;



const INSTALL_SCRIPT = `<script>
(function () {
  const btn = document.getElementById("installBtn"), row = document.getElementById("installRow"), hint = document.getElementById("iosHint");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  if (standalone) return;
  if (ios) row.hidden = false;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; row.hidden = false; });
  window.addEventListener("appinstalled", () => { row.hidden = true; hint.hidden = true; });
  btn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null; row.hidden = true;
    } else if (ios) {
      hint.hidden = !hint.hidden;
    }
  });
})();
</script>`;

const SW_REGISTER = `<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
</script>`;

const split = src.indexOf('<div class="app">');
if (split < 0) throw new Error("build.js: sovelluksen runkoa ei löytynyt");
let head = src.slice(0, split);
let body = src.slice(split);

head = replaceOnce(head, "<title>", HEAD_EXTRA + "<title>");
body = replaceOnce(body, '<p class="note">', INSTALL_UI);
body = replaceOnce(
  body,
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>',
  '<script>window.STOCKFISH_LOCAL = "stockfish-19-lite-single.js"; window.ENGINE_INFO = { name: "Stockfish 19", cpScale: 1 }; window.APP_HOSTED = true;</script>\n<script src="chess.min.js"></script>'
);

const html = `<!doctype html>
<html lang="fi">
<head>
${head.trim()}
</head>
<body>
${body.trim()}
${SW_REGISTER}
${INSTALL_SCRIPT}
</body>
</html>
`;
fs.writeFileSync(path.join(pub, "index.html"), html);

// Service worker: uusi versio joka buildilla, jotta puhelimet saavat päivityksen.
const version = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const sw = `// Generoitu build.js:llä – älä muokkaa käsin.
const CACHE = "shakkivalmentaja-${version}";
const ASSETS = ["./", "index.html", "chess.min.js", "stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Sivu: ensin verkosta (päivitykset), ilman verkkoa välimuistista.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("index.html", copy));
        return res;
      }).catch(() => caches.match("index.html"))
    );
    return;
  }

  // Omat tiedostot ja Google-fontit: ensin välimuistista.
  if (url.origin === location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
`;
fs.writeFileSync(path.join(pub, "sw.js"), sw);

console.log("Valmis: public/index.html ja public/sw.js (välimuistiversio " + version + ")");
