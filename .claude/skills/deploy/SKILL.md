---
name: deploy
description: Publish Shakkivalmentaja to Firebase Hosting (shakkivalmentaja.web.app) and verify the live site. Only when the user explicitly asks to deploy or publish.
disable-model-invocation: true
---

# Deploying to Firebase Hosting

Deploying changes what real users get, so do it only when the user has asked in this conversation.

1. **Clean state:** `git status` should show the changes you mean to publish committed (or tell the user what is uncommitted). Deploy from `main`.
2. **Tests:** `npm test` must pass, including the network suite. If only the network suite fails because Lichess or Chess.com is down, tell the user and let them decide.
3. **Deploy:** `npm run deploy`. Firebase runs `node build.js` first (`predeploy` in `firebase.json`), so the service worker gets a new cache version automatically. You need the Firebase CLI and a login that has access to the `shakkivalmentaja` project.
4. **Verify the live site:**
   ```sh
   curl -s https://shakkivalmentaja.web.app/sw.js | sed -n 2p                   # CACHE = "shakkivalmentaja-<new timestamp>"
   curl -s https://shakkivalmentaja.web.app/ | grep -c "<something unique to this change>"
   ```
5. **Report:** tell the user it is live, and that installed apps pick up the update on the next launch after the service worker has downloaded it (usually the second launch).

If the deploy fails on authentication, ask the user to run `firebase login` themselves. Do not try to work around it.
