// ESLint-asetukset. Aja tarkistus komennolla `npm run lint` (tools/lint.mjs):
// src/js-tiedostot jakavat yhden näkyvyysalueen, joten ne tarkistetaan koottuna (src/app.bundle.js),
// eikä niitä voi tarkistaa yksitellen.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "public/", "node_modules/", "tests/output/", "src/js/"] },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // sovellus selaimessa: kaikki src/js-tiedostot koottuna yhteen funktioon
    files: ["src/app.bundle.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, Chess: "readonly" },
    },
  },
  {
    files: ["build.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  {
    // testit ja työkalut ajetaan Nodella; selaintestien run(() => …)-funktiot suoritetaan sivulla
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module", globals: { ...globals.node, ...globals.browser, Chess: "readonly" } },
  },
];
