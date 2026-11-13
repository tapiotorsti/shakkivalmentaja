// Käyttöliittymän apurit (core.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./harness.mjs";

// kevyt korvike DOM-solmulle: laskee, montako kertaa sisältö vaihdettiin
const fakeNode = () => ({
  textContent: "", writes: 0,
  replaceChildren(...c) { this.writes++; this.textContent = c.map((x) => (typeof x === "string" ? x : x.textContent)).join(""); },
});

test("tilailmoitus päivittyy vain, kun teksti muuttuu", () => {
  const app = loadApp(), n = fakeNode();
  app.setLive(n, "Sinun vuorosi.");
  app.setLive(n, "Sinun vuorosi.");
  assert.equal(n.writes, 1); // sama teksti ei toistu ruudunlukijalle
  app.setLive(n, { textContent: "" }, "Kone miettii…"); // pyörivä kuvake ja teksti
  assert.equal(n.textContent, "Kone miettii…");
  assert.equal(n.writes, 2);
});
