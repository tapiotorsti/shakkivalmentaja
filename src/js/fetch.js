// ---------- Omien pelien haku (vain sovellusversiossa; artifactin suojaukset estävät ulkoiset haut) ----------
const HOSTED = !!window.APP_HOSTED;
const FETCH_KEY = "shakkivalmentaja.fetch";
const SPEED_FI = { ultraBullet: "ultrabullet", bullet: "bullet", blitz: "blitz", rapid: "pikapeli", classical: "pitkä peli", correspondence: "kirjeshakki", daily: "kirjeshakki" };
const DRAWS_CC = ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"];
const fetchPrefs = { src: "lichess", user: "" };
let fetchedGames = [];
try { Object.assign(fetchPrefs, JSON.parse(localStorage.getItem(FETCH_KEY) || "{}")); } catch (e) { /* ignore */ }
const saveFetchPrefs = () => { try { localStorage.setItem(FETCH_KEY, JSON.stringify(fetchPrefs)); } catch (e) { /* ignore */ } };
function fetchMsg(text, err) { const m = $("fetchMsg"); m.textContent = text || ""; m.className = "msg" + (err ? " err" : ""); }

class FetchError extends Error { constructor(kind) { super(kind); this.kind = kind; } }
async function getJson(url, accept) {
  let r;
  try { r = await fetch(url, { headers: accept ? { Accept: accept } : {} }); }
  catch (e) { throw new FetchError("network"); }
  if (r.status === 404) throw new FetchError("notfound");
  if (r.status === 429) throw new FetchError("ratelimit");
  if (!r.ok) throw new FetchError("http");
  return accept === "application/x-ndjson" ? r.text() : r.json();
}

async function fetchLichess(user) {
  const text = await getJson("https://lichess.org/api/games/user/" + encodeURIComponent(user) +
    "?max=20&pgnInJson=true&opening=true&clocks=false&evals=false&moves=true", "application/x-ndjson");
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((g) => (g.variant === "standard" || g.variant === "fromPosition") && g.pgn)
    .map((g) => ({
      pgn: g.pgn,
      white: (g.players.white.user && g.players.white.user.name) || (g.players.white.aiLevel ? "Lichess AI " + g.players.white.aiLevel : "?"),
      black: (g.players.black.user && g.players.black.user.name) || (g.players.black.aiLevel ? "Lichess AI " + g.players.black.aiLevel : "?"),
      wElo: g.players.white.rating, bElo: g.players.black.rating,
      result: g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : ["draw", "stalemate"].includes(g.status) ? "1/2-1/2" : "*",
      date: new Date(g.createdAt), speed: SPEED_FI[g.speed] || g.speed || "",
      opening: g.opening && g.opening.name ? g.opening.name : ""
    }));
}

async function fetchChessCom(user) {
  const base = "https://api.chess.com/pub/player/" + encodeURIComponent(user.toLowerCase()) + "/games/archives";
  const archives = (await getJson(base)).archives || [];
  const out = [];
  let failed = 0;
  for (let i = archives.length - 1; i >= 0 && out.length < 20 && i >= archives.length - 4; i--) {
    // yksittäisen kuukauden arkisto voi palauttaa virheen Chess.comin päässä: ohitetaan ja haetaan aiemmista
    let month;
    try { month = (await getJson(archives[i])).games || []; } catch (e) { failed++; continue; }
    month.filter((g) => g.rules === "chess" && g.pgn).reverse().forEach((g) => {
      if (out.length >= 20) return;
      const eco = (g.pgn.match(/\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/) || [])[1];
      out.push({
        pgn: g.pgn, white: g.white.username, black: g.black.username, wElo: g.white.rating, bElo: g.black.rating,
        result: g.white.result === "win" ? "1-0" : g.black.result === "win" ? "0-1" : DRAWS_CC.includes(g.white.result) ? "1/2-1/2" : "*",
        date: new Date(g.end_time * 1000), speed: SPEED_FI[g.time_class] || g.time_class || "",
        opening: eco ? decodeURIComponent(eco).replace(/-/g, " ").replace(/\s+\d.*$/, "") : ""
      });
    });
  }
  if (!out.length && failed) throw new FetchError("http"); // kaikki kuukaudet epäonnistuivat
  return out;
}

function renderGameList(user) {
  const list = $("gameList");
  list.replaceChildren();
  list.hidden = !fetchedGames.length;
  const lc = user.toLowerCase();
  fetchedGames.forEach((g, idx) => {
    const meWhite = g.white.toLowerCase() === lc;
    const meBlack = g.black.toLowerCase() === lc;
    const mine = meWhite ? "1-0" : meBlack ? "0-1" : null;
    let res = "–", cls = "";
    if (g.result === "1/2-1/2") res = "Tasan";
    else if (mine && g.result === mine) { res = "Voitto"; cls = "win"; }
    else if (mine && g.result !== "*") { res = "Tappio"; cls = "loss"; }
    const opp = meBlack ? { name: g.white, elo: g.wElo } : { name: g.black, elo: g.bElo };
    const b = el("button", "grow");
    b.type = "button";
    const r = el("span", "res " + cls, res);
    const o = el("span", "opp");
    o.append((meWhite ? "Valkeilla" : meBlack ? "Mustilla" : g.white) + " vs " + opp.name + " ");
    if (opp.elo) o.appendChild(el("small", null, String(opp.elo)));
    const meta = el("span", "meta", [g.date.toLocaleDateString("fi-FI"), g.speed, g.opening].filter(Boolean).join(" · "));
    b.append(r, o, meta);
    b.addEventListener("click", () => {
      if (assistOff()) { fetchMsg("Peli konetta vastaan on kesken. Lopeta tai luovuta se ensin.", true); return; }
      applyImport(g.pgn, user);
      fetchMsg("Peli avattu. Analyysi käynnistyi.");
      $("boardWrap").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
    list.appendChild(b);
  });
}

async function doFetch(e) {
  if (e) e.preventDefault();
  const user = $("userInput").value.trim();
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(user)) { fetchMsg("Kirjoita käyttäjänimi (2–30 merkkiä: kirjaimia, numeroita, _ tai -).", true); return; }
  fetchPrefs.user = user; saveFetchPrefs();
  const svc = fetchPrefs.src === "chesscom" ? "Chess.com" : "Lichess";
  $("fetchBtn").disabled = true;
  fetchMsg("Haetaan pelejä palvelusta " + svc + "…");
  try {
    fetchedGames = fetchPrefs.src === "chesscom" ? await fetchChessCom(user) : await fetchLichess(user);
    renderGameList(user);
    fetchMsg(fetchedGames.length ? "Löytyi " + fetchedGames.length + " peliä. Napauta peliä analysoidaksesi sen." : "Käyttäjällä ei ole tavallisen shakin pelejä palvelussa " + svc + ".");
  } catch (err) {
    fetchedGames = []; renderGameList(user);
    const kind = err && err.kind;
    fetchMsg(kind === "notfound" ? "Käyttäjää " + user + " ei löytynyt palvelusta " + svc + ". Tarkista kirjoitusasu."
      : kind === "ratelimit" ? svc + " rajoittaa hakuja hetken. Yritä uudelleen minuutin päästä."
      : kind === "network" ? "Hakua ei voitu tehdä. Tarkista verkkoyhteys ja yritä uudelleen."
      : "Haku epäonnistui. Yritä hetken päästä uudelleen.", true);
  } finally {
    $("fetchBtn").disabled = false;
  }
}

function syncFetchUI() {
  $("fetchBox").hidden = !HOSTED;
  $("fetchOff").hidden = HOSTED;
  for (const b of $("srcSeg").children) b.setAttribute("aria-pressed", String(b.dataset.v === fetchPrefs.src));
  if (!$("userInput").value) $("userInput").value = fetchPrefs.user || "";
}
$("srcSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  fetchPrefs.src = b.dataset.v; saveFetchPrefs(); syncFetchUI();
  fetchedGames = []; renderGameList(""); fetchMsg("");
});
$("fetchForm").addEventListener("submit", doFetch);

// Moottorin nimi ja virherajat ohjeeseen käytössä olevan moottorin mukaan
function syncEngineTexts() {
  document.querySelectorAll(".engine-name").forEach((e) => { e.textContent = ENGINE.name; });
  document.querySelectorAll(".old-engine").forEach((e) => { e.hidden = ENGINE.cpScale === 1; });
  document.querySelectorAll(".thr").forEach((e) => {
    const w = +e.dataset.w;
    const pawns = Math.log((1 + w) / (1 - w)) / (0.00368208 * ENGINE.cpScale) / 100;
    e.textContent = pawns.toFixed(1).replace(".", ",");
  });
}
