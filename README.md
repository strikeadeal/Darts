# Dartshift

**Nine Dart Rush** is a three-round darts game for iPhone. Play a solo run to set a personal best, or pass one phone between two players for a local duel. Everything runs on the device, including scoring, artwork and sound.

## Play

1. Pick **Solo run** or **Local duel**.
2. Hold the orange throw pad. A moving white sight appears on the board.
3. Drag your thumb to steer. Lift when the centre of the sight crosses your target. The tip lands at its last displayed position. A quick tap costs no dart.

Each player throws three darts per visit and gets three visits. The thin inner ring scores treble and the outer ring double. The outer bull scores 25, the centre scores 50, and a miss uses one dart for zero points. The maximum is 540. Duels alternate visits and equal totals draw.

On a keyboard, focus the throw pad, hold Space or Enter, steer with the arrow keys, then release. Escape cancels the throw. The back arrow saves your place. Select the **Resume** mode button to continue after closing the game.

## Install on iPhone

After deployment, open [Dartshift on GitHub Pages](https://strikeadeal.github.io/Darts/) in Safari. Open **Share → Add to Home Screen**, leave **Open as Web App** enabled if offered, then tap **Add**. On some Safari layouts, Share sits in the page menu.

Launch **Dartshift** from its icon once while online and let the first download finish. The service worker caches the complete game for later launches without signal. The installed app can have a separate store from a Safari tab. Play from the icon to keep a consistent record.

When a release is ready, **Update game** activates it and reloads. Your last landed dart, current match, solo best and sound setting persist. A waiting update also activates after all windows using the old worker close. System storage eviction or clearing website data can remove offline files and records. Open online again to restore the files.

## Run locally

Use Node.js 22 or newer. The project has no package dependencies.

```sh
npm test
npm run dev
```

Open [the local game](http://localhost:4173/Darts/). The server serves the built release at the same project subpath as Pages. After editing, run `npm run build` again. `npm start` serves an existing build. Service workers require HTTPS or localhost. Use the HTTPS Pages URL for a physical iPhone.

## Deploy

The repository is **strikeadeal/Darts**. Once, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**. GitHub Actions must be enabled for the repository.

Push to `main`. The Pages workflow runs the scoring tests, builds `dist/`, uploads it, and deploys to the project URL. **Actions → Deploy Dartshift → Run workflow** can redeploy the same commit. No secrets, paid services, custom domain or deployment branch are required. Generated output stays out of source control.

## Code and verification

- `src/game.js` contains board scoring, deterministic aim, match progression and saved-match validation. `tests/game.test.js` exercises those rules with Node's built-in test runner.
- `src/input.js` owns pointer capture, keyboard input, frame-timed presentation and cancellation. `src/art.js` draws the playable board from the scoring constants.
- `scripts/build.mjs` hashes the shipped files and worker template, then emits the scoped precache worker. Every font and image is local. The OFL font licenses are in `assets/fonts/`.
- [Design decisions](DECISIONS.md) covers the rules, iOS trade-offs and device checks.

### Next and deliberately out of scope

Next up would be personal-best round splits and a 301 checkout mode. This release leaves out accounts, online matchmaking, computer opponents and cosmetic unlocks.

### Verification limits

The production build was exercised under `/Darts/` in Chromium, WebKit and an iPhone 17 simulator. Safari installation, home-screen launch and a complete touch-driven solo match passed in the simulator. The installed app also cold-launched with the server stopped and retained its record after a release update. Browser tests separately verified an in-progress match across a worker update. Physical iPhone performance, silent-switch behavior and the first live Pages deployment still need confirmation. Exact viewport checks and timing measurements are in [DECISIONS.md](DECISIONS.md).
