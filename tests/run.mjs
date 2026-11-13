// Ajaa Shakkivalmentajan selaintestit yhdellä komennolla:
// rakentaa sovelluksen, tarjoilee public/-kansion paikallisesti, käynnistää headless-Chromen ja ajaa testit.
//
// Käyttö:
//   node tests/run.mjs               kaikki testit
//   node tests/run.mjs --offline     ilman Lichessiä ja Chess.comia käyttäviä testejä
//   node tests/run.mjs --only peli,välilehdet
//
// Ympäristömuuttujat: CHROME_PATH (Chromen polku), TEST_APP_PORT (oletus 8765), TEST_CDP_PORT (oletus 9333).
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(HERE, "output");
const APP_PORT = +(process.env.TEST_APP_PORT || 8765);
const CDP_PORT = +(process.env.TEST_CDP_PORT || 9333);
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;

// network: käyttää ulkoisia palveluita (Lichess, Chess.com), joten voi epäonnistua palvelun takia
const TESTS = [
  { name: "navigointi", file: "navigation.mjs" },
  { name: "animaatiot", file: "animation.mjs" },
  { name: "välilehdet", file: "tabs.mjs", args: () => [OUT] },
  { name: "asettelun vakaus", file: "layout-shift.mjs" },
  { name: "analyysi", file: "analysis.mjs", args: () => [join(OUT, "analyysi.png")] },
  { name: "peli", file: "play.mjs", args: () => [join(OUT, "peli.png")] },
  { name: "kirjasto ja harjoitus", file: "library.mjs", args: () => [join(OUT, "kirjasto.png")] },
  { name: "opetus", file: "tutorial.mjs", args: () => [join(OUT, "opetus.png")] },
  { name: "aloittelija ja haku", file: "features.mjs", network: true, args: () => [join(OUT, "aloittelija.png")] },
];

const argv = process.argv.slice(2);
const offline = argv.includes("--offline");
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 ? argv[onlyIdx + 1].split(",").map((x) => x.trim()) : null;
const selected = TESTS.filter((t) => (!only || only.includes(t.name)) && !(offline && t.network));
if (!selected.length) { console.error("Ei ajettavia testejä. Nimet: " + TESTS.map((t) => t.name).join(", ")); process.exit(2); }

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json",
};

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = process.platform === "win32"
    ? [join(process.env.PROGRAMFILES || "C:/Program Files", "Google/Chrome/Application/chrome.exe"),
       join(process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
       join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
       join(process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe")]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error("Chromea ei löytynyt. Aseta CHROME_PATH.");
  return found;
}

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, APP_URL).pathname);
      if (path.endsWith("/")) path += "index.html";
      const file = normalize(join(PUBLIC, path));
      if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(body);
    } catch (e) {
      res.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(APP_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function startChrome(profile) {
  const chrome = spawn(findChrome(), [
    "--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    // CI:n Linux-koneilla Chromen hiekkalaatikko ei käynnisty (AppArmor rajoittaa käyttäjänimiavaruuksia)
    ...(process.env.CI ? ["--no-sandbox"] : []),
    "about:blank",
  ], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(CDP_URL + "/json/version"); if (r.ok) return chrome; } catch (e) { /* ei vielä käynnissä */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Headless-Chrome ei käynnistynyt portissa " + CDP_PORT);
}

function stopChrome(chrome) {
  if (!chrome || chrome.exitCode !== null) return;
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch (e) { /* jo suljettu */ }
  } else chrome.kill("SIGKILL");
}

// Suljetaan edellisen testin sivut, etteivät niiden tietokantayhteydet tai moottorit vaikuta seuraavaan
async function closePages() {
  try {
    // ensin uusi tyhjä sivu: headless-Chrome sulkeutuu, jos viimeinenkin sivu suljetaan
    const keep = await (await fetch(CDP_URL + "/json/new?about:blank", { method: "PUT" })).json();
    const list = await (await fetch(CDP_URL + "/json/list")).json();
    await Promise.all(list.filter((p) => p.type === "page" && p.id !== keep.id).map((p) => fetch(CDP_URL + "/json/close/" + p.id).catch(() => {})));
  } catch (e) { /* Chrome ei vastaa: seuraava testi kertoo virheen */ }
}

function runTest(t) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(HERE, t.file), ...(t.args ? t.args() : [])], {
      cwd: ROOT, env: { ...process.env, CDP_URL, APP_URL },
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => { out += "\nFAIL: aikakatkaisu (8 min)"; child.kill(); }, 8 * 60 * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = out.split(/\r?\n/);
      const fails = lines.filter((l) => l.startsWith("FAIL"));
      const oks = lines.filter((l) => l.startsWith("ok:")).length;
      const errLine = lines.find((l) => l.startsWith("ERRORS:"));
      const pageErrors = errLine && !errLine.includes("none");
      resolve({ t, ok: code === 0 && !fails.length && !pageErrors, oks, fails, out, secs: Math.round((Date.now() - started) / 1000) });
    });
  });
}

// ---------- ajo ----------
console.log("Rakennetaan sovellus…");
execFileSync(process.execPath, [join(ROOT, "build.js")], { cwd: ROOT, stdio: "inherit" });
await mkdir(OUT, { recursive: true });
const profile = join(tmpdir(), "shakkivalmentaja-test-" + Date.now());
let server, chrome;
const results = [];
try {
  server = await serve();
  chrome = await startChrome(profile);
  console.log(`Palvelin ${APP_URL}, Chrome ${CDP_URL}\n`);
  for (const t of selected) {
    process.stdout.write(`▶ ${t.name}${t.network ? " (verkko)" : ""} … `);
    await closePages();
    const r = await runTest(t);
    results.push(r);
    console.log(r.ok ? `ok (${r.oks} tarkistusta, ${r.secs} s)` : `EPÄONNISTUI (${r.secs} s)`);
    if (!r.ok) console.log(r.out.split(/\r?\n/).filter((l) => /^(FAIL|ERRORS|Error|    at )/.test(l) || l.includes("Error")).slice(0, 15).map((l) => "    " + l).join("\n"));
  }
} finally {
  stopChrome(chrome);
  if (server) server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} testiä läpi.` + (failed.length ? " Epäonnistuneet: " + failed.map((r) => r.t.name).join(", ") : ""));
if (offline) console.log("Verkkotestit ohitettiin (--offline).");
console.log("Kuvakaappaukset: " + OUT);
process.exit(failed.length ? 1 : 0);
