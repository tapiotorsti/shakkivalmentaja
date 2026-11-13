// Tarkistaa koodin ESLintillä (npm run lint).
// src/js-tiedostot kootaan build.js:n järjestyksessä yhteen funktioon kuten rakennetussa sovelluksessa,
// joten määrittelemättömät ja käyttämättömät nimet löytyvät myös tiedostojen välillä.
// Virheet näytetään alkuperäisen tiedoston riveillä. Muut tiedostot tarkistetaan tavalliseen tapaan.
import { ESLint } from "eslint";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { JS_FILES } = createRequire(import.meta.url)(join(ROOT, "build.js"));

// Kootaan tiedostot ja muistetaan, miltä riviltä kukin alkaa.
const parts = [];
let code = "(function () {\n\"use strict\";\n", line = 3;
for (const f of JS_FILES) {
  const text = readFileSync(join(ROOT, "src", "js", f), "utf8").replace(/\n?$/, "\n");
  parts.push({ file: join(ROOT, "src", "js", f), start: line, source: text });
  code += text;
  line += text.split("\n").length - 1;
}
code += "})();\n";

const eslint = new ESLint({ cwd: ROOT });
const [bundle] = await eslint.lintText(code, { filePath: join(ROOT, "src", "app.bundle.js") });
const others = await eslint.lintFiles(["."]);

// Kootun tiedoston viestit takaisin alkuperäisiin tiedostoihin
const byFile = new Map(parts.map((p) => [p.file, { filePath: p.file, source: p.source, messages: [] }]));
for (const m of bundle.messages) {
  const part = parts.findLast((p) => p.start <= (m.line || 1));
  if (!part) { others.push({ ...bundle, messages: [m] }); continue; }
  const shift = (l) => (l == null ? l : l - part.start + 1);
  byFile.get(part.file).messages.push({ ...m, line: shift(m.line), endLine: shift(m.endLine) });
}
const count = (msgs, sev) => msgs.filter((m) => m.severity === sev).length;
const results = [...byFile.values()].map((r) => ({
  ...r, errorCount: count(r.messages, 2), warningCount: count(r.messages, 1),
  fatalErrorCount: r.messages.filter((m) => m.fatal).length,
  fixableErrorCount: 0, fixableWarningCount: 0, suppressedMessages: [], usedDeprecatedRules: [],
})).concat(others);

const formatter = await eslint.loadFormatter("stylish");
const out = await formatter.format(results);
if (out) console.log(out);
const errors = results.reduce((s, r) => s + r.errorCount, 0);
console.log(errors ? `${errors} virhettä.` : `Ei virheitä (${JS_FILES.length} sovellustiedostoa ja ${others.length} muuta tiedostoa).`);
process.exit(errors ? 1 : 0);
