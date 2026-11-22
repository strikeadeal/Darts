# Dartshift

Dartshift is a darts game for iPhone with five games: **Nine Dart Rush**, three rounds for the highest score; **301**, first to exactly zero; **Cricket**; **Around the Clock**; and **Shanghai**. Play any of them as a solo run to set a personal best, or pass one phone between two players for a local duel. Everything runs on the device, including scoring, artwork and sound.

## Play

1. Pick a game from the row above the mode buttons (swipe it sideways for more), then **Solo run** or **Local duel**. The lobby remembers the last game.
2. Put your finger on the dart beneath the board. A touch anywhere else never throws: the dart pulses and the prompt says where to start.
3. Flick it up the screen and let go while your finger is still moving. The faster the flick, the higher the dart lands; lean the stroke left or right to aim. Start with a medium flick at the bull. A curved, slowing or paused stroke scatters the dart, and the prompt says what to fix. Short, sideways or downward strokes cost no dart.

The thin inner ring scores treble and the outer ring double. The outer bull scores 25, the centre scores 50, and a miss uses one dart for zero points.

- **Nine Dart Rush.** Each player throws three darts per visit and gets three visits. The maximum is 540. Duels alternate visits and equal totals draw. **Play again** after a duel hands the first throw to the other player.
- **301.** Count down from 301. The first player to reach exactly zero wins, with any dart: a single, double, treble or either bull. Going below zero is a bust: the visit ends and the score goes back to where it started. Leaving 1 is fine. The empty dart slots on the scoreboard suggest a checkout, fewest darts first. With fewer than 20 left, the board outlines the number that finishes (both of its single beds), darkens its treble and double, which would bust, and badges the number on the rim. Each player gets ten rounds; if nobody finishes, the lowest score wins. A duel ends the moment someone reaches zero. A solo run's record is the fewest darts to finish.
- **Cricket.** The numbers 15 to 20 and the bull. A single is one mark, a double two, a treble three; the outer bull one and the bull two. Three marks close a number. In a duel, more marks on a number you have closed score its value (25 on the bull) while your rival still has it open. Close all seven with at least as many points as your rival to win. A solo run has no points: close all seven in the fewest darts. Rim badges ring your marks (a third of the ring per mark), a white dot shows a number only your rival has closed, and numbers everyone has closed go dark. Twenty rounds each; then more points wins, then more marks.
- **Around the Clock.** Hit 1, then 2, and so on to 20, then either bull. Any bed of the number counts. The board outlines the number you need, and the empty dart slots show the next ones. First to the bull wins; after fifteen rounds each, whoever got furthest. A solo run's record is the fewest darts.
- **Shanghai.** Seven rounds: in round 1 only 1s score, in round 2 only 2s, up to 7 (single, double or treble). Highest total wins. A single, double and treble of the number in one visit is a Shanghai: it wins a duel on the spot, and a solo run plays on. The empty slots show what a Shanghai still needs. A solo run's record is the best score.
- **301 matches saved before first to zero** (released 21 November 2026) finish under the double-out rules they began with, and set no record. The lobby marks them "double out". Starting a new 301 match replaces one.

On a keyboard, focus the dart, aim with the arrow keys, then press and release Space or Enter to throw. Shift and arrows make finer adjustments. Escape cancels. The keyboard places the dart exactly where the sight is, as before.

For your first 45 darts on a device, the prompt also says which way a clean dart missed the bull ("Below the bull · flick harder"). A tip from the last dart of a visit stays on the card between visits.

Personal bests started again with the flick (released after 20 November 2026), and the 301 record starts again with first to zero, since finishing without a double takes fewer darts. Until you set one, the lobby shows your newest older record as "Fewest · double out" or "Best · old throw"; older records are kept on the device and never overwritten. The back arrow saves your place. Select the **Resume** mode button to continue after closing the game.

## Install on iPhone

After deployment, open [Dartshift on GitHub Pages](https://strikeadeal.github.io/Darts/) in Safari. Open **Share → Add to Home Screen**, leave **Open as Web App** enabled if offered, then tap **Add**. On some Safari layouts, Share sits in the page menu.

Launch **Dartshift** from its icon once while online and let the first download finish. The service worker caches the complete game for later launches without signal. The installed app can have a separate store from a Safari tab. Play from the icon to keep a consistent record.

In an iPhone Safari tab, after your first finished match, the lobby shows these steps once.

When a release is ready, the game offers **Update game** in the lobby, between visits or on the results, never while you're throwing. **Later** puts it off until the next launch. Update game activates the release and reloads, then shows one line on what changed. Edit `releaseNote` in `src/app.js` each release. Your last landed dart, current matches, solo bests and sound setting persist. A waiting update also activates after all windows using the old worker close. System storage eviction or clearing website data can remove offline files and records. Open online again to restore the files.

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

- `src/game.js` contains board scoring, match progression for every game (Cricket, Around the Clock and Shanghai share one replay in `rules`), checkout routes, saved-match validation and the save format. `x01.highlightBelow` there is the one setting for when 301 highlights the finishing number (fewer than 20 left). `tests/game.test.js`, `tests/x01.test.js`, `tests/zero.test.js` and `tests/modes.test.js` exercise those rules with Node's built-in test runner.
- `src/throw.js` holds the release model and the tuning values for gesture sensitivity, camera, flight, grip and impact. `tune.input` sets how a flick lands; [The flick](DECISIONS.md) says which values to try first on a phone. `tune.grab` sets the touch target around the dart.
- `scripts/model/difficulty.mjs` is a model of human thumb flicks (casual and skilled) that plays the throw and reports hit rates, Nine Dart Rush and 301 against the previous release (`scripts/model/legacy-throw.mjs`). `node scripts/model/difficulty.mjs --quick` takes about a minute. `tests/throw.test.js` uses its stroke generator.
- `src/coach.js` picks the prompt after a throw that went astray, from what the release measured; it never changes where a dart lands. `tests/coach.test.js` covers it. `scripts/check/tabs.cjs` checks that an older tab never overwrites newer saves.
- `src/input.js` owns pointer capture, keyboard input, frame-timed presentation and cancellation. `src/art.js` draws the playable board from the scoring constants.
- `style.css` opens with **Scene tuning**: the room's camera shots, depth, lamp and transition timings, with the landscape and short-portrait overrides beneath. `src/app.js` moves one persistent room between those shots. The play shot is untransformed, so the throw's own `tune` is unaffected.
- `scripts/build.mjs` hashes the shipped files and worker template, then emits the scoped precache worker. Every font and image is local. The OFL font licenses are in `assets/fonts/`.
- [Design decisions](DECISIONS.md) covers the rules, iOS trade-offs and device checks.

### Next and deliberately out of scope

Next up would be personal-best round splits. This release leaves out 501, Killer (it wants three or more players; Dartshift is one or two), legs and sets, accounts, online matchmaking, computer opponents and cosmetic unlocks.

### Verification limits

The flick was measured with the stroke model and checked in Chromium under `/Darts/` (`scripts/check/flick.cjs`): saved hits equal the model replayed on the page's own touch samples, and the flying tip ends on the scored point. How it feels under a real thumb on a real iPhone has not been checked. The dart-only grab and the compositor-driven flight were profiled and played under `/Darts/` in Chromium and WebKit (`scripts/check/` holds the profiler and match runner; they need Playwright and are not part of the build). The match runner plays 301 too: `node scripts/check/match.cjs chromium dist 390x844 solo keyboard 0 301` (`SEED=19` starts a touch run on 19 left), and checks the finishing highlight before every dart. `scripts/check/finish.cjs` screenshots and measures the highlight at the nine viewport sizes and resumes an old double-out save; `scripts/check/update.cjs` runs Update game from a previous build and an offline launch. The match runner also plays Cricket, Around the Clock and Shanghai (`… solo keyboard 0 cricket`), checking the board's targets before every dart, and `scripts/check/modes-update.cjs` runs Update game into them, an offline launch and a rollback to the previous release. First to zero and the three new games were checked in Chromium only; see [First to zero](DECISIONS.md) and [Three more games](DECISIONS.md) for what still needs the phone. Earlier, the throw and the 3D room were checked in Chromium, WebKit and the iPhone 17 simulator, in Safari and as the installed app. Checks covered full solo and duel matches, touch, keyboard and reduced motion, saved-point alignment, offline reload, service-worker updates and a safe-area layout audit at nine viewport sizes. Physical iPhone touch feel, the room's compositing cost and sustained frame rate on an SE-class phone, and sound with the silent switch need hardware testing. [Design decisions](DECISIONS.md) records the simulator strokes, frame timings and viewport results.

The installed app's full-screen layout (`src/viewport.js`) was checked in Chromium with a model of the iOS 26+ short viewport. On an iPhone 14 Pro with iOS 27, the shipped approach was measured filling the screen and taking touches to the bottom edge in portrait and landscape. That approach is a visible root with a body as tall as the screen, applied only in the installed app. To read what an installed copy reports, open **How to play** and tap its title five times. A viewport readout appears and stays on across launches until the same five taps turn it off. Players never see it otherwise. `?viewport` does the same in a Safari tab.
