---
name: run-tests
description: Run, read and debug Shakkivalmentaja's headless-Chrome browser tests. Use after any code change, when a test fails, or when adding a new test suite.
---

# Running and debugging the browser tests

## Run

```sh
npm run test:offline                      # all suites except the network one (~2.5 min)
npm test                                  # all suites, including "aloittelija ja haku" (Lichess, Chess.com)
node tests/run.mjs --only "kirjasto ja harjoitus"   # one or more suites, comma-separated
```

The runner (`tests/run.mjs`) builds the app first, serves `public/` on port 8765, starts headless Chrome with a fresh profile on port 9333, and runs each suite as a separate Node process. Suite names: `navigointi`, `animaatiot`, `välilehdet`, `asettelun vakaus`, `analyysi`, `peli`, `kirjasto ja harjoitus`, `opetus`, `aloittelija ja haku` (network). Screenshots go to `tests/output/`.

## Read the result

Each suite prints `ok: <message>` or `FAIL: <message>` per check and ends with `ERRORS: <page exceptions or none>`. A suite fails if it exits non-zero, prints any `FAIL`, or reports page exceptions.

**The runner prints only failure lines.** For a failing suite it shows lines that start with `FAIL`, `ERRORS` or `    at `, or that contain `Error`. Nothing from passing suites is shown, and nothing else from failing ones either. To see your own diagnostic output while debugging, print it with a line that contains `Error` (for example `console.log("Error DEBUG", JSON.stringify(x))`). Remove it afterwards.

## Debug a failure

1. Rerun only that suite 2–3 times. If it fails every time, it is a real failure, not timing. Do not fix a consistent failure by raising timeouts.
2. Check whether the failure also happens without your change (`git stash`, rebuild, rerun). A failure that predates your change is still a bug: report it to the user, and fix it in a separate commit if they want.
3. Inspect app state from the test with `run(() => ...)` / `ev("...")`. Useful reads are IndexedDB (`idbAll` helper in `library.mjs`), `localStorage`, `#statusText`, `#anaText` and `#fenInput`.
4. Look at the screenshot in `tests/output/` for layout problems.

## Add a suite

1. Copy the structure of an existing suite (for example `tests/analysis.mjs`): connect to `CDP_URL`, open `APP_URL`, clear storage, use `check(condition, message)`, and end with `console.log("ERRORS:", ...)`.
2. Register it in the `TESTS` list in `tests/run.mjs` with a Finnish name. Add `network: true` if it calls external services.
3. Messages are in Finnish, like the existing ones.
