# Dartshift · design decisions

Recorded before implementation.

- **Match.** Nine Dart Rush gives each player three visits of three darts. Highest total wins, equal totals draw. No busts, checkouts or sudden death. Compared with 301 this gives beginners a definite finish and experts a 540-point ceiling.
- **Target.** Use the regulation clockwise sector order and nominal steel-tip ring radii. Score the dart tip. A radial boundary belongs to the inner bed, and a sector boundary belongs to the clockwise sector. Wires never bounce a dart out.
- **Throw.** Start a stroke anywhere inside the playfield and swipe up. The angle steers the dart and a longer stroke reaches higher. Require upward travel of at least one-third of the board width to release a dart. A straight swipe of 60% reaches the bull. Vertical sensitivity leaves the lower double ring above the minimum throw distance and the upper double ring within one board width. Commit on release, save before the flight animation, and ignore taps, sideways strokes and interruptions.
- **Company.** Solo runs keep a local best. Local duels alternate after each visit, with an explicit handoff. Both people can play the whole match in airplane mode.
- **Look.** A near-black screen-printed sports poster, cream condensed italic type, vermilion flights, black steel and jade target bands. The lobby pairs one oversized original board illustration with two broad mode buttons. The playable board uses the scoring geometry beneath textured sisal and raised wires. One tip-anchored SVG dart supplies the foreground, flight and embedded poses so its silhouette and impact point stay consistent.
- **Stack.** Native HTML, CSS, ES modules and SVG. A dependency-free Node build fingerprints the offline cache. This small game needs neither a framework runtime nor a server. GitHub Actions tests, builds and deploys the static directory.
- **Installation.** Request standalone display, use relative manifest id, scope and start URL, opaque PNG icons and a dedicated Apple touch icon. Include legacy iOS title and standalone meta tags. iOS owns the status bar and system gestures. Use black-translucent status styling over an ink background, not a promise of native fullscreen. iOS does not reliably use manifest-generated splash screens. Accept the system launch surface and paint the ink shell immediately, avoiding a device-specific startup-image matrix.
- **Layout and gestures.** Portrait is the primary layout. Landscape reflows without requiring an orientation lock. Use viewport-fit=cover and four safe-area insets. The playfield sits inside the system gesture edges, with a visible dart beneath the target in portrait. Scope touch-action:none, pointer capture, selection and callout suppression to gameplay. Cancel interrupted throws. Keep zoom and ordinary scrolling available in reading surfaces. Use manipulation on buttons and contain overscroll.
- **Sound and feel.** Initialize Web Audio from a player gesture, resume it on subsequent interactions and synthesize short impact sounds. iPhone silent-switch/audio-route behavior depends on WebKit and the audio session. Honor mute and use visible impact feedback for every throw. Safari on iPhone exposes no general web vibration API. Skip haptic workarounds.
- **Offline and upgrades.** Precache every shipped asset under the project scope. Install atomically and keep an old worker in control until an update can be applied between sessions. Check on foregrounding. Save progress before any version transition.
- **Storage.** Save the match, solo record and mute preference locally after meaningful changes. Validate saved data and tolerate denied storage. Quotas, user clearing and OS eviction can remove records or cached files even for installed apps. Keep data tiny and allow recovery online.
- **Performance.** Target iOS 16.4+ and SE-class screens. Keep the board static, transform the ready dart during a swipe, stop animation on cancellation or backgrounding, keep effects brief and respect reduced motion. Aim for a 60 Hz frame budget. Physical device testing is needed to measure latency, battery and sustained frame rate.
- **Scope.** Leave out accounts, matchmaking, computer opponents, cosmetic currencies and external services. Next candidates are an optional 301 checkout mode and round-by-round personal-best splits.

## Initial release verification · 19 November 2026

- Node 22 passed all eight automated tests and built the Pages directory. The browser loaded its resources beneath `/Darts/`. The manifest URLs and declared icon dimensions were checked against the output.
- Chromium and WebKit completed solo and two-player matches through the visible controls. Checks covered short taps, turn handoffs, replay, sound settings, saved progress and replacement of a paused match. The normal-play runs recorded zero console errors.
- In Apple's iPhone 17 simulator (iOS 27.2), Safari offered the Dartshift name and icon in Add to Home Screen. Launching that icon opened the standalone web app. Simulated touch throws completed a 103-point solo match and saved the personal best. With the HTTP server stopped, a cold launch from the icon loaded the lobby and the same saved record. After reconnecting, Update game reloaded the installed app and retained all 103 points.
- WebKit finished all nine darts after the test HTTP server stopped. A separate Chromium test installed a waiting worker, applied it, reloaded into its new cache and resumed the saved match.
- WebKit layout checks exercised 320×568, 375×667, 390×844, 393×852 and 852×393 with explicit safe-area inset values up to 59 px. The board and pad fit inside the available area. A 180-frame desktop WebKit sample while aiming measured a 17 ms median interval and an 18 ms 95th percentile.
- Hardware checks remain for physical touch latency, sustained 60 fps, battery use and silent-switch/audio-route behavior. The oldest targeted iOS version and a live GitHub Pages deployment were not exercised.

## Swipe throw verification

- Chromium touch input and WebKit pointer input each completed a nine-dart run. Repeating the same straight swipe hit nine bulls. Taps and downward strokes left the dart count intact. Checks also covered touch cancellation, keyboard throws, duel handoffs, and leaving during a flight with reduced motion enabled or disabled.
- On the iPhone 17 simulator, the installed app picked up the swipe controls and completed a 150-point match using touch swipes. Both round transitions and replay responded to a single tap in the final run. The board and throw control fit all five portrait and landscape test viewports listed above. Physical-device swipe feel still needs a hands-on check.

## Board and dart verification

- In the installed iPhone 17 simulator app, a bull, treble 20 and double 20 in each of three rounds scored 450 points. In WebKit the animated tip finished within 0.12 CSS pixels of the saved impact on all three beds. Reduced-motion placement matched the same points.
- The board and throw control fit seven portrait and landscape viewport sizes with simulated safe-area insets, including 360×740 and 375×812. Physical-device frame rate and touch latency remain unmeasured.

## Physical throw · 20 November 2026

The board already has sisal, wire highlights and a shaded edge. Watching the point through a throw explains the flatness. The input code discards release velocity, the SVG translates between two screen positions in 190 ms, and every embedded dart repeats one silhouette and shadow. The foreground, trip to the board and contact give the eye conflicting evidence about distance.

Use a fixed camera, a slightly foreshortened scoring face and a tip-anchored dart with four projected fins. Bring the dart towards the hand on contact, extend with the stroke, then project its travel away from the eye with gravity and axial roll. End at the saved millimetre coordinate, cast a directional shadow, and let the shaft settle about its fixed point. The last part of the stroke controls a bounded lift and steering adjustment. Leave the familiar distance calibration at a medium release. Identical releases should remain repeatable.

A WebGL engine would add another rendering context, asset pipeline and offline payload for one moving object. Rotating a flat sprite would keep the same fin silhouette through the entire flight. Keep the existing SVG board and project just the dart. Use a stationary camera to protect wire readability. Omit random scatter, collisions and bounce-outs so that a close grouping remains a reward for consistency.

**Gesture and tuning.** Start with `tune` at the top of `src/throw.js`. At the neutral release speed of 2.8 board widths per second, the original 60% straight stroke reaches the bull. The last 90 ms add up to 32 mm of height and 16 mm of sideways correction. Only sideways velocity relative to the overall stroke steers the finish. The sampler interpolates the start of that window across event rates and includes time spent stationary before lift. Adjust `input.lift` and `input.trim` for sensitivity, `camera.arc` for loft, and `flight.byPace` for the difference between slow and fast flight times. Arrow keys still move the sight in board coordinates, and reduced motion places the dart immediately.

**Matches and records.** Keep `dartshift.save.v1`. Save the point before starting flight and score only its x and y in board millimetres. New touch hits also store two optional numbers for release pace and sideways trim. Coordinate-only hits render with a neutral entry pose. Keep the existing best as an all-time personal record. Release difficulty changes, but the same beds, nine-dart limit, 540-point ceiling and precision keyboard path remain available, and this record belongs to one player on one device.

**Performance budget.** Keep the iOS 16.4+ and SE-class target of 16.7 ms per frame. No idle animation loop. During a swipe, paint at most once per animation frame. During flight, read layout at launch and update transforms on one barrel, four reusable SVG fins and a separate shadow layer. Keep the board face, lighting and wall static. Flights take 202–270 ms. The last dart stays visible for another 170 ms before results. Compared with the old 190 ms tween, the nominal extra wait across a nine-dart run is under one second even at the slowest release. The complete uncompressed build grew by 10,338 bytes, including the local lane artwork, with zero runtime packages.

## Physical throw verification · 20 November 2026

- All 14 Node tests passed, including the original nine. The new tests cover speed at release, pausing before lift, sideways correction, different event rates and screen widths, short strokes, misses, and reloading a mix of old and new hits. The production build precached 22 local assets.
- In the **installed iPhone 17 simulator PWA (iOS 27.2)**, Update game resumed a saved solo match and retained the 450-point record. On the final build, nine straight strokes of 60% board width made a 219-point run. In each of three visits, an 85 ms stroke hit single 20, a 215 ms stroke hit bull, and a 420 ms stroke hit single 3. Both visit transitions worked by touch.
- **Desktop browser automation** used Playwright because the Browser plugin was unavailable. At the local production route `/Darts/`, Chromium touch and WebKit pointer input each finished a solo run. Both engines finished 18-dart keyboard duels with reduced motion. Shift-arrow fine aim, Escape, Space and Enter, the sight, resume and handoffs worked. A landscape Chromium touch duel included nine reduced-motion swipes, leaving during flight, and all five handoffs. The final scoreboard agreed with the saved hits. The full solo and keyboard duel runs logged zero app errors.
- Compared the SVG tip with the saved point projected through the scoring face at the end of all nine flights in each desktop engine. Maximum error was 0.066 CSS px in WebKit and 0.007 CSS px in Chromium. During shaft settling and with reduced motion, the largest sampled error was below 0.001 CSS px. Across 109 WebKit in-flight frame intervals, median and 95th percentile were both 17 ms. Across 122 Chromium intervals they were 16.7 and 17.5 ms respectively.
- WebKit fit the board and throw control within simulated safe areas at 320×568, 360×740, 375×667, 375×812, 390×844, 393×852 and 852×393. A two-line hint initially overflowed the available space at 360×740. The shorter hint fits. Visual checks also covered the desktop playfield and the held, flying and embedded poses.
- WebKit cold-reloaded and completed a solo run after the local HTTP server stopped. Chromium applied the waiting worker over the previous production build, resumed an acknowledged visit on 150 points, and reached 153 after another dart. Offline reload retained those points, the 450-point best and mute.
- **Physical iPhone checks remain.** Judge grip, loft, release sensitivity and touch-to-photon latency by hand. Measure sustained frame rate and thermal behaviour on an SE-class device, and check sound with the silent switch and different audio routes. This pass used the simulator and desktop engines. iOS 16.4 hardware and the public Pages deployment were outside the test run.

## The room · 20 November 2026

**Diagnosis.** The throw was already three-dimensional, but nothing around it was. Every screen sat in a website frame: a logo bar, a page header with an eyebrow and round counter, and a personal-best footer. In portrait on a 390×844 phone those strips took about 170 px, and the board was 270 px wide. The board lived in a bordered card on a flat black page, so the dart's perspective stopped at the card edge. The lobby used a 547 KB poster photograph, which was flat art of a different board in different light. Screens replaced one another: the handoff and results swapped the playfield out, and the results screen dropped the board and the darts that decided the match. Feedback was a line of text under the board.

**Approach.** One persistent room, built from CSS 3D transforms. `#scene` holds three camera layers (wall, floor and the stage with the board, plate and dart) that all take the same `translate3d` per shot. The scene's `perspective-origin` is the bull, and its focal length is a multiple of the board width, so the room and the throw's projected dart share one vanishing point and one scale.
- **Shots.** Five named shots: intro, wide (lobby), oche (play), step (between visits) and final (results).
- **The oche shot is the identity transform.** During play the board, grip and dart are laid out exactly as an untransformed page, so `src/input.js` and `src/throw.js` measure the same geometry they always have.
- **The room's light.** One warm lamp pool up and to the left matches the shading already baked into the board face and dart shadows. A floor plane with the mat and oche line is rotated 90° into the room. There is a skirting line, a catch-ring surround and a neon sign for the wide shots.
- **HUD placement.** The score plate hangs on the wall above the board and moves with the camera, so it is lit and framed with the board you are reading it against. Back, help and sound are screen-space glass buttons that stay 44 px and reachable in every shot. The cards (modes, handoff, results) are screen-space overlays that cross-fade.
- **Feedback moments.** A score callout pops at the impact point. Hits of 40 or more flare the lamp. A visit of 100+ gets a second flare and a caller line ("Ton 40", "One hundred and eighty!"). The match end relights the neon with a short fanfare. A band-passed whoosh plays on release.
- **No idle loop.** Every effect is a one-shot CSS animation with no idle loop, and reduced motion removes all of them.
- **Tunables.** Camera, room, light and timing live in the commented "Scene tuning" block at the top of `style.css`, with the landscape and short-portrait overrides directly below. They are separate from the throw's `tune`.

**Transitions never hold up play.** A capture-phase `pointerdown`/`keydown` handler finishes every running animation before the event reaches anything else. So a tap skips any camera move or card animation, and a throw always starts on the settled layout. Left alone:
- The camera holds on the last dart for 420 ms, steps back over 480 ms, and the handoff card rises as the move ends.
- A new visit dollies in over 560 ms, but the dart can be picked up immediately.
- If a player never taps early, a visit transition costs about 0.5 s more than before: about 1 s across a solo run and 2.5 s across a duel. Tapping makes it zero.

**Rejected alternatives.**
- **WebGL (three.js or similar).** Rejected for four reasons:
  - It adds about 150 KB gzipped of engine plus a second render path.
  - Either the SVG board and dart move into textures, which means rewriting the throw and re-proving alignment, or they float in a separate layer over the canvas, which splits the light and the depth. A layered canvas would not share the throw's projection.
  - Text in WebGL loses native accessibility.
  - It costs GPU memory on SE-class phones.
- **A pre-rendered room image.** It would cost one heavy image per orientation and density, its light could not follow the camera, and the camera could not move.
- **Tilting the board during play.** It would put the scoring face in a different projection from the one the throw is tuned against. That changes where a release lands and needs `tune` retuned. The play shot stays square-on.
- **The View Transitions API for screen changes.** It needs Safari 18, and the target is iOS 16.4. It also cross-fades screenshots rather than moving through one space.
- **Device-motion parallax.** It needs a permission prompt on iOS and a running loop.
- **Ambient idle animation** (flicker, dust). It breaks the no-idle-loop rule. The neon flickers only when it turns on.

**Effect on the throw.** `src/input.js`, `src/throw.js`, `src/art.js` and `src/game.js` are unchanged. One CSS change touches the grip: its width is now rounded to an even whole pixel. WebKit snaps a transform's reference box to device pixels, so a fractional grip width (78.56 px) moved the dart's 50% origin by 0.22 px. The flight's final scale of about 0.5 turned that into a constant 0.11 px tip offset at 1×, and this was also the source of the earlier 0.066 px WebKit residual. With an even width, the tip finishes within 0.00002 CSS px of the saved point in both engines. Renders cancel any held aim, as before.

**Saved data.** `dartshift.save.v1` keeps the same shape and validation: match, best, muted, acknowledged. A new session-only key, `dartshift.resume`, is written by Update game only while a match is on screen. The reload then returns straight to the interrupted visit instead of the lobby. Updating from the lobby or results still lands in the lobby.

**Performance and size budget.**
- **Frame budget.** The 16.7 ms frame budget and the iOS 16.4+ and SE-class targets stand.
- **What changes during play.** The oche shot has no camera transform. Animations during a throw are the dart (unchanged), the one-shot callout and the lamp flare's opacity.
- **Camera moves.** Camera moves only animate `transform` on three layers. The floor is the only `preserve-3d` element, and masks and gradients are static.
- **At rest.** At rest nothing animates: `document.getAnimations()` is empty on the lobby, playfield, handoff and help sheet in both engines.
- **Size.** The precache dropped from 1,059,271 to 530,577 bytes (−50%). The 547 KB lobby photograph and the old lane SVG are gone. HTML, CSS and JS grew from 17.9 to 23.3 KB gzipped (+5.4 KB). No fonts, images or packages were added.

## Room verification · 20 November 2026

- **Build.** All 14 Node tests passed. The production build precached 20 local assets.
- **Desktop engines.** Playwright Chromium and WebKit played the production build under `/Darts/`:
  - **Solo by swipe, both engines.** Each engine threw nine flights. The largest tip error at impact was 0.000021 CSS px, and the embedded dart sat within 0.000006 px of the saved point. Taps and downward strokes cost no dart. Flight frame intervals were 17.0 ms median and 18.0 ms 95th percentile in WebKit, and 16.7 and 17.8–18.4 ms in Chromium.
  - **Keyboard duels.** 18-dart keyboard duels with reduced motion finished in both engines. Focus moved from the dart to the handoff button to Play again with no loss. Results totals matched the game's own scoring of the saved hits.
  - **Other runs.**
    - A reduced-motion solo by swipe finished in both engines.
    - A landscape (852×393) touch duel finished in Chromium.
    - Leaving during a flight saved the dart, and Resume continued the run in both engines.
- **Two bugs found and fixed during verification.**
  - Premium hits blanked the screen. The effect class `flare` on the scene also matched the lamp's `.flare` rule, which gave the whole scene the lamp's box and zero opacity. Effect classes are now prefixed `moment-`.
  - The 0.11 px WebKit tip offset described above.
- **Updates and offline, in both engines.**
  - **Previous release to this build.** The previous release (main at 14d27f6) installed, part-played a solo run with mute on, then applied Update game. The new build kept the match, best, mute and acknowledged values and offered Resume.
  - **During play.** An update from this build during play reloaded straight into the same visit.
  - **Offline.** With the server stopped, a reload launched from cache, resumed, and took another dart.
- **Layout audit.**
  - **Sizes.** Every screen was checked at the seven sizes listed earlier with their insets, plus 667×375 and 932×430 landscape.
  - **What it checks.** Board, plate, throw control, HUD and cards stay inside the safe area. The board's disc overlaps nothing. Every visible control is at least 44 px.
  - **What it changed.** The landscape handoff and results framing, the SE results framing, and hiding the neon behind the landscape results card. The final run reported no problems.
- **iPhone 17 simulator (iOS 27.2, real WebKit).** Headless WebKit screenshots do not composite 3D transforms, so the reviewed after-shots come from Chromium, and the simulator confirmed real rendering:
  - **In Safari.** Update game moved from an earlier build to this one. A nine-dart solo run by touch ended on a treble 20, so the lamp flare, ton and neon relight all fired together without a blank frame.
  - **Installed app.** In the Home Screen app, Update game moved from the previous release to this build and kept the 450-point best. The old build's button needed a second tap; that is the previous release's code. The room filled the standalone screen around the status bar and home indicator, and a touch throw landed.
- **Physical iPhone checks remain.**
  - Compositing cost of the camera moves and room layers on an SE-class GPU, sustained frame rate and heat.
  - Touch-to-photon latency, and how the perspective reads at arm's length.
  - Landscape on a notched phone with the real sensor housing.
  - The whoosh and fanfare with the silent switch and different audio routes.
  - iOS 16.4 itself. The CSS relies on `round()` (Safari 15.4), `dvh` (15.4) and `overflow: clip` (16).
  - The public Pages deployment was not exercised.

## Grab and flight · 20 November 2026

Two problems: a throw could start anywhere on the playfield, and players said a thrown dart's flight lagged. This section supersedes "start a stroke anywhere inside the playfield" in the original Throw decision.

### Gesture

- **A stroke starts only on the dart.** The target is the dart's painted outline at rest, grown by 12 px on every side and never under 48 px across (`tune.grab` in `src/throw.js`, tested in `tests/grab.test.js`). The painted dart is at least 40×83 px (320×568), so the target is 64×107 px there and 64–75 px wide everywhere. That clears the 44 px iOS minimum without reaching the board or the floor beside the dart.
- **Pickup.** Touching the dart draws it back into the existing hand pose and dims the prompt, so the finger clearly has it. The dart's resting drop shadow is dropped at the same moment (see Lag).
- **A touch elsewhere** costs nothing and never throws. The prompt turns amber with "Touch the dart to pick it up" (also announced to VoiceOver) and the dart pulses once. A touch that is spent finishing a camera move or effect gets no cue, so tapping to skip stays quiet.
- **After a skipped camera move.** The room's capture-phase handler now rewinds the running moves to their start, notes where the dart was, then finishes them. The target spans from there to where the dart settles, so a touch anywhere on the path the player saw the dart travel picks it up. A touch after the move has ended uses the settled dart only.
- **No minimum flick speed.** Slow releases are already how a player aims lower ("ease off for a lower hit", and a pause before lifting drops 32 mm). A speed floor would turn that into a failed throw and make the game harder to learn.
- **Every bed is reachable from the dart.** Measured in WebKit at all nine layouts with their safe-area insets, a stroke started at the lowest point of the target can reach the outer edge of the double ring at a neutral release, with no help from lift or trim. That is stricter than the calibrated extremes with maximum lift and trim. Spare room above the finger is at least 281 px in portrait (320×568) and 133 px in landscape (852×393); spare room to the side is at least 67 px (320×568). `tests/grab.test.js` fixes the smallest layout in each orientation, and fails if a change to `tune.input` puts a double out of reach.
- **Unchanged.** No existing `tune` value changed. The release window, lift, trim, the 60% bull calibration and the keyboard throw are as they were.
- **Copy.** The prompt reads "Flick the dart up". The how-to-play step, the round announcement and the screen-reader description say to touch the dart. The "too short" hint is now "Swipe up at least ⅓ board width": the old wording wrapped to two lines in portrait, which moved the dart 19 px, and ran 328 px wide in landscape, off the edge at 667×375.

### Lag: what the profiler showed

Headless WebKit on Linux paints on the CPU, as iOS does (iOS composites on the GPU). Its idle playfield runs at a clean 16 ms in both engines, so slower frames are the app's work. Chromium hid the problem: at 6× CPU slowdown its flight frames stayed at 16.7 ms because rasterisation runs off its throttled main thread. That is also why earlier desktop numbers looked fine. Each lead was tested by ablation, removing one thing and measuring nine throws in WebKit at 390×844 @2×, and by timing the APIs used during release and landing.

| Lead | Verdict | Evidence (WebKit, before the fix) |
|---|---|---|
| Board `drop-shadow` re-rendered | **Confirmed, main cause** | Anything painting over the board (dart, shadow, landing) re-rendered the whole filtered board. Removing that filter alone: flight median 34 → 20 ms, p95 55 → 28 ms. Removing both filters: 16 / 21 ms. |
| Dart re-rasterised with its filter | **Confirmed, minor** | Dart filter off alone: median 34 → 29 ms. Its filter-sized dirty rectangle was what dragged the board in. |
| Approach shadow repaints a board-sized layer | **Confirmed, minor** | Shadow hidden: 34 → 29 ms. As a composited Web Animation it instead cost ~10 ms on the first frame (layer creation). |
| Flying dart has no layer, repaints stage | **Confirmed** | Shares the board's backing store. Giving the static board its own layer then took ~20 ms off landings and 4 ms off the first frame. |
| Release work before frame 0 | **Partly.** Work ruled out, timing confirmed | Release handler 2 ms in WebKit, 6.6 ms median at 6× in Chromium. `save()` ≤0.3 ms, `whoosh()` ≤0.3 ms, layout reads ≤2 ms. The harm was timing: the first frame took 52 ms, and `flyDart()` timed from release, so frame 1 was already ~22% into the flight. |
| Impact rebuilds the stage | **Confirmed, largest single frame** | 188–201 ms per landing, 264 ms when a visit ended. Hiding the room alone cut it to 74 ms, because the rebuild repainted the room's masked gradients. At visit ends the delayed step-back camera move and handoff card cost another ~100 ms: they were created at impact, although they only start 420 ms later. |
| Desktop measurements hid it | **Confirmed** | See above. |
| Impact sound | Ruled out | Muting changed nothing. |

### What changed

- **Board shadow.** The board's `drop-shadow` filter is now a soft-edged ellipse (`.board-wrap::before`) painted once. The board has its own layer (`will-change: transform`) and is never repainted by a dart, shadow or callout. Pixel difference against the old filter at 390×844 @2×: mean 0.28/255, 0.11% of pixels over 16 levels.
- **Dart shadow.** The dart keeps its drop shadow at rest only (`.throw-control:not(.held)`). A held or flying dart is never re-filtered.
- **Flight driver.** The dart's path is a Web Animation of `transform`: 24 keyframes, linear between them, within 0.1 px of the curve. The compositor moves it even when the main thread is late, and its clock starts on the first frame that reaches the screen, so a late first frame delays the start rather than causing a jump. A rAF loop re-poses only the barrel and four fins (roll and pitch) from the animation's own time.
- **Approach shadow.** It moved out of the board-sized `.board-objects` SVG into a 200-unit SVG at the impact point. It stays empty until it becomes visible at 75% of the flight, then the same loop moves and fades it. Arc, depth, roll, shadow approach and the pace-driven durations are unchanged.
- **Measurement at pickup.** Geometry the flight needs is read at pickup (or the first aim key), after any camera move has finished, so release forces no layout. The hit is still saved with `save()` before the flight starts.
- **Landing.** The board stays on screen. On the contact frame the only change is the new dart added to the board and the thrown dart hidden (its control's fade held at zero). One frame later the callout is added and the scoreboard and throw control are updated in place (`morph`), not rebuilt. The landing is announced at contact.
- **Visit and match ends.** The hold before the camera steps back (`--hold`) moved from CSS delays into `src/app.js`. The step-back move, handoff card, results card and their room effects are now created when the hold ends, not at impact. A tap during the hold still skips it. One visible change: the results card now rises with the pull-back, 420 ms after the last dart, instead of at once.
- **The capture-phase skip** leaves a dart in flight alone, and ignores finished animations.

**Fixed along the way:**
- The camera-arrival re-measure called `reset()` even mid-stroke. A stroke begun within about a second of a landing could be silently cancelled.
- The resting dart's `handScale` mixed `getScreenCTM()` (which leaves out the room's perspective) with `getBoundingClientRect()`. During every dolly-in the dart was drawn 30% too large and popped smaller on arrival.
- Keyboard focus now carries across the hold to the handoff card.
- Leaving mid-flight no longer lets the deferred landing redraw the playfield over the lobby. That bug was found while testing this change.

### Before and after

Nine-throw solo runs in the strokes' fixed cycle (215, 120 and 380 ms strokes): 78–153 flight intervals per run. All numbers are in ms.
- **Release to first frame:** the release event to the first rAF callback after the handler.
- **First interval:** that first frame's own duration.
- **Contact:** the worse of the two frames that render the landing.
- **Next frame:** the frame that brings in the callout, scoreboard and next dart; in the old build, the frame after the rebuild.
- **p95:** across the 600 ms after contact.
- **"Over 25 ms":** the share of flight frames longer than 25 ms.

| Run | Build | Release to first frame (median / max) | First interval (median / max) | Flight (median / p95 / max) | Flight frames over 25 ms | Contact (median / max) | Contact, visit end (median) | Next frame (median / max) | 600 ms after (p95 / max) |
|---|---|---|---|---|---|---|---|---|---|
| WebKit 390×844 | before | 5 / 15 | 47 / 57 | 30 / 48 / 57 | 66 / 78 | 187 / 349 | 222 | 41 / 210 | 187 / 349 |
| | after | 11 / 19 | 16 / 19 | 16 / 19 / 23 | 0 / 135 | 19 / 29 | 16 | 35 / 53 | 35 / 65 |
| WebKit 375×667 (SE) | before | 6 / 14 | 49 / 55 | 30 / 50 / 69 | 70 / 80 | 176 / 270 | 235 | 40 / 129 | 164 / 270 |
| | after | 8 / 13 | 16 / 18 | 16 / 19 / 28 | 1 / 137 | 17 / 28 | 17 | 29 / 63 | 28 / 75 |
| WebKit, 2-core quota | before | 6 / 25 | 80 / 106 | 53 / 84 / 106 | 41 / 49 | 346 / 481 | 399 | 74 / 100 | 349 / 481 |
| | after | 15 / 21 | 20 / 28 | 16 / 20 / 37 | 3 / 139 | 22 / 37 | 22 | 51 / 89 | 56 / 98 |
| Chromium, 4× slowdown | before | 11.7 / 14.8 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 / 151 | 16.7 / 33.4 | 16.7 | 16.7 / 16.7 | 16.7 / 33.4 |
| | after | 11.4 / 15.4 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 / 143 | 16.7 / 16.8 | 16.8 | 16.7 / 16.7 | 16.7 / 16.8 |
| Chromium, 6× slowdown | before | 12.1 / 22.2 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 / 153 | 33.4 / 66.6 | 49.9 | 16.6 / 33.4 | 16.8 / 66.6 |
| | after | 12.8 / 25.8 | 16.6 / 16.7 | 16.7 / 16.7 / 16.8 | 0 / 145 | 16.7 / 16.7 | 16.7 | 16.7 / 33.3 | 16.8 / 33.4 |

The release handler stayed small: 1–2 ms in WebKit; in Chromium at 6×, 5.1 ms median and 15.9 ms worst, against 6.6 ms and 17.5 ms before. It builds 24 keyframes where it used to read layout.

**What is still over budget.** WebKit's frame after contact, which brings in the callout, scoreboard and next dart, runs at a 29–35 ms median, 63 ms worst, and 51 ms median on a 2-core quota. Ablation spreads it over several pieces, none dominant:
- the throw control's opacity fade and the callout, each a new layer this WebKit composites in software;
- the scoreboard's text;
- the landed dart's settle and impact-ring animations.

The contact frame itself and every flight frame are within or near budget. iOS composites opacity layers on the GPU, so this frame should be much cheaper there, but only a device can confirm it.

### Tip alignment

Re-measured by jumping each flight animation to its end and projecting the saved point through the board plane, nine varied throws per run:
- **Flying dart's tip at the end of its path:** at most 0.000017 CSS px.
- **Embedded dart:** at most 0.000005 px.

This held in WebKit and Chromium at 390×844, 320×568 and 852×393. The even-width grip fix is unchanged.

## Grab and flight verification · 20 November 2026

- **Build.** All 18 Node tests pass, including four new ones for the touch target, a touch during a camera move, the 44 px floor and reach from the dart. The production build precaches 20 local assets with no new packages; `scripts/check/` is not shipped.
- **Engines and how they were run.** Playwright 1.63 with the Chromium 157 headless shell and WebKit 26.6 (Playwright build `webkit-2359`) on Linux, an Intel Xeon at 2.1 GHz with 4 cores, at device scale 2. Chromium throttling used CDP `Emulation.setCPUThrottlingRate`. The WebKit "2-core quota" ran every WebKit process in a cgroup v1 CFS quota of 200% (10 ms periods). One core (100%) was unusable even before these changes (165 ms frames), so it isn't reported. The tools are `scripts/check/flight.cjs` and `scripts/check/match.cjs`.
- **Matches.** 53 complete matches under `/Darts/` on the release candidate, then 7 of them again after the final fix (leaving mid-flight); all passed:
  - **Coverage:** all nine viewports with their simulated insets; Chromium touch (CDP touch events), WebKit pointer and keyboard in both engines, with and without reduced motion; solo and duel.
  - **Per-match checks:** every throw saves exactly one hit, an off-dart swipe costs nothing and shows the cue, and the first touch during each dolly-in picks the dart up. Results totals match the saved hits, keyboard focus reaches "Start round" and "Play again", and the console stays clean.
  - **Under load:** run three at a time, WebKit pointer runs sometimes touched where the harness had read the dart mid-move after the camera had already arrived. That stale touch was confirmed by recording each touch; those runs pass when run one at a time.
- **At rest.** No animation is running on the lobby, playfield, handoff or help screens in either engine. Under reduced motion `document.getAnimations()` is empty on all of them. With motion on, it still lists finished one-shot CSS animations held by `fill: both` (lamp, neon, card, callout), exactly as the previous build did. Reduced motion places the dart at once.
- **Updates and offline, in both engines.**
  - **Previous release to this build:** main at b0276a7 was installed with a working service worker, part-played with mute on, then the server switched to this build. "Update game" reloaded straight into the same visit, keeping darts, mute and acknowledged state.
  - **Offline:** with the server stopped, a reload launched from cache, resumed, and took a dart by swipe.
  - **Leaving mid-flight:** pressing back while a dart is in the air saved it, and Resume continued in both engines, with and without reduced motion.
- **Not available here.** No macOS machine or iPhone was attached to this session, so neither the iOS simulator nor Safari Web Inspector timelines were used.

**Still needs a hands-on check on a physical iPhone, ideally SE-class on iOS 16.4:**
- **Safari Web Inspector timeline of a few throws.** Look for:
  - frames from release to contact;
  - whether the contact frame and the frame after it are inside 16.7 ms;
  - that the board layer is never repainted during a flight (Layers tab).
- **Grab feel.** Whether the target is forgiving enough at arm's length, whether the pulse and amber cue read as "touch here", and whether a touch on the dart during a dolly-in picks it up.
- **The flight.** That the compositor-driven path and the main-thread fin roll stay in step, with no visible lag between dart and shadow.
- **Board shadow and resting dart:** the board shadow looks the same as the old filtered one, and the resting dart is sharp. The board's `will-change` layer's memory on a 2× SE, roughly 1.3 MB.

## Full screen in the installed app · 20 November 2026

**The symptom.** On an iPhone 14 Pro (393×852 pt, Dynamic Island) on iOS 27.2, the installed app stopped short of the bottom of the screen. The room, floor and lane ended early, and a dead dark band filled the bottom. The throw control and its hint sat well above the home indicator.

### Cause

**Confirmed from the screenshot's geometry.** The page is laid out in a viewport about 793 pt tall, 59 pt (the top safe area) short of the 852 pt screen, while still drawn from the top of the screen.
- **The model.** `scripts/check/viewport.cjs` opens the build in a 393×793 window, reports a 393×852 screen, sets `navigator.standalone`, and applies insets of 59 top and 34 bottom.
- **The old build in that model.** The hint's second line ends at 747 pt (the line box; its glyphs end a few points higher). The screenshot shows about 743 pt.
- **In a full 852 pt viewport,** the same line ends at 806 pt. The old build's numbers match the screenshot only in the short viewport.
- **What the band is.** Everything sized from that viewport stops at 793 pt: `--sh` and `--grip` (both from `100dvh`), `.scene` and `#panel` (`position: fixed; inset: 0`), and the help sheet (a modal `<dialog>` with a bottom margin of 0). Below that is the root background, which is the band.

**Why it happens (reported, not yet measured on this phone).** Several developers report the same failure in iOS 26 and 27 installed web apps that use `viewport-fit=cover` with a `black-translucent` status bar. It is referenced as WebKit bug 301108, which I couldn't open from here. The reports agree that `100%`, `100vh`, `100dvh`, `innerHeight` and fixed `inset: 0` can come out short by roughly the top inset. They conflict on the details:
- The shortfall was 47 px on one device and 62 px on another. One device reported `env(safe-area-inset-top)` as 0 while the gap was still there.
- `100lvh` was full height in two simulator and emulation reports. No report measured it on a device, and WebKit 316008 reports `lvh` wrong in a nearby configuration (without the status-bar meta tag).
- One report saw rotating to landscape and back clear the gap. Another saw no change.
- A Safari tab is not affected.

**Why the earlier checks missed it.** Desktop emulation sets the window to the screen size, so the layout viewport is always the full screen. The iPhone 17 simulator check in "Room verification" also ran iOS 27.2 and reported "the room filled the standalone screen", but it recorded no measurement. The band is near-black next to a vignetted dark floor, so a visual check can miss it. Whether the simulator reproduces the bug is unknown.

### Fix

- **One height for the screen, `--vh`.** CSS defaults it to `100dvh`, which is right in a Safari tab.
- **The installed iPhone app sets it from the screen.** `src/viewport.js` `fullHeight()` returns the screen's height when two things hold:
  - The page is an iOS home-screen app: `navigator.standalone`, or display-mode standalone where that WebKit-only property exists.
  - The window spans the screen's width.
  - Because iOS keeps `screen.*` in portrait order, portrait takes the long side and landscape the short one. An installed iPhone app always fills the screen, so this needs no unit or inset WebKit might get wrong.
  - Anything else gets `null` and keeps the CSS default: Safari tabs, iPad Split View or Stage Manager windows, Android and desktop installs.
- **Everything screen-sized goes through `--vh`:**
  - `--sh` and `--grip`, and so the board width, its position and the grip;
  - `.scene` and `#panel`, now `inset: 0 0 auto; height: var(--vh)` rather than `inset: 0`;
  - the help and switch sheets, with `bottom: calc(100% - var(--vh))`, which moves the dialog's bottom from the layout viewport's to the screen's and is 0 wherever the two agree;
  - the sheets' and landscape cards' `max-height`.
  - The backdrop overshoots by 128 px, because `::backdrop` can't read custom properties on iOS 16.
  - `tests/viewport.test.js` fails if a viewport unit or `inset: 0` comes back on those layers.
- **Changes while the app is open.** `--vh` is set before the first render. It is checked again on `resize`, `orientationchange`, `pageshow` and a return from the background, then once more a frame later in case iOS reports the new width late. A change cancels any held aim, which re-measures the resting dart, as a resize already did.
- **Opening and closing a dialog** changes neither the screen nor the window width, so it can't move the room. The dialog's own offset follows the layout viewport live.
- **The floor and lane now reach the bottom edge.** The floor plane already projected past the screen; only the scene's clip cut it off. The throw control keeps its place, `--bottom + 6px` above the screen's bottom, so the hint sits just clear of the home indicator. The cards keep a 12 px gutter above it.

**Rejected alternatives.**
- **`calc(100dvh + env(safe-area-inset-top))`.** The reported shortfall doesn't always equal the inset, and the inset itself has read 0. It would also double-count once Apple fixes the bug.
- **`100lvh` in standalone.** The only evidence is simulator and emulation runs, and it has been reported wrong nearby. It also doesn't move fixed elements or dialogs, whose offsets are measured from the short viewport.
- **Dropping `black-translucent`.** This swaps a dead band at the bottom for an opaque status bar at the top, which one project tried and then reverted. iOS reads the tag at install time, so every player would also have to reinstall.
- **`-webkit-fill-available`, `innerHeight`, `visualViewport.height` and `clientHeight`.** All have been reported short.
- **Moving the room into normal flow.** One report measured a normal-flow `min-height: 100vh` element at full height. But the room, cards and dialogs are fixed overlays and the top layer, and they still need the real height as a number.

### iOS versions

- **iOS 16.4–18.** The layout viewport is already the screen, so JS sets the same value CSS would. Nothing changes.
- **iOS 26–27 with the bug.** The room fills the screen.
- **Once WebKit fixes it,** the screen height and the viewport agree again, and the dialog offset returns to 0. Nothing needs removing.
- **The known limit.** This assumes the installed app is drawn under the status bar, which `black-translucent` asks for.
  - If a future iOS stops drawing under it, as Apple suggested for pages without the tag in WebKit 317153, the room would overrun the bottom by the status bar's height.
  - The readout below shows that directly as the amber and cyan rules parting.
  - The fix would then be to drop `--vh` back to the CSS default when `innerHeight` matches the window.
- **Display Zoom** scales `screen.*` and the viewport together, so it's unaffected.

### Throw, re-measured

The fix gives the installed app the layout the earlier audits measured at full screen size. In the short-viewport model, every value matches a true full-size window: board width, dart position and grip.
- **Board widths** in the smallest layouts are 288 px (320×568), 293.5 px (667×375) and 302 px (852×393).
- **The touch target's lowest point** is 544, 387 and 387 px. These are exactly the figures in `tests/grab.test.js`, so the reach test still holds on the smallest screen in each orientation.
- **The phone in the report** (393×852) keeps its 353.7 px board.
- **Its grip** grows from 118.4 px (the short viewport) to 145.1 px, and the whole throw control drops 59 px. The extra height above the finger adds room to reach.
- **The hand pose.** The resting dart's `handScale` there falls from about 1.2 to 1. The shaft is no longer turned further into depth to make up for a cramped grip; this is the pose the layout was designed and tested with at this size.
- **No `tune` value changed.**

**Tip alignment.** Measured by pausing each flight at its end and projecting the saved point through the board plane, nine varied swipes per layout, Chromium. Largest tip error:

| Layout | Largest tip error (CSS px) |
|---|---|
| 393×852, laid out at 793 | 0.000021 |
| 320×568, laid out at 548 | 0.000015 |
| 852×393 notched landscape | 0.000018 |
| 667×375 | 0.000014 |
| Safari tab, 393×659 | 0.000016 |

WebKit isn't installed in this environment, so the earlier WebKit figures weren't repeated.

### Verification

- **Automated.** All 21 Node tests pass. The three new ones cover the height decision (portrait, landscape, notchless, Safari tab, iPad window, bad values) and the stylesheet rule. The build precaches 22 assets, adding `src/viewport.js` and `src/probe.js`.
- **Desktop emulation (Chromium).**
  - **The short-viewport model** at 393×793 on 393×852 and at 320×548 on 320×568: the scene, panel, throw control and help sheet now end at the screen's bottom (852 and 568) instead of the layout viewport's (793 and 548). The help sheet's bottom moved from 793 to 852.
  - **Landscape** at 852×393 and 667×375 is unchanged and correct. **A Safari tab** keeps `100dvh`.
  - **Matches.** Full matches with the existing runner: a touch solo at 393×852, a reduced-motion touch duel at 852×393, a keyboard solo at 320×568 and a reduced-motion keyboard duel at 375×667, all with no errors.
  - **The readout** opens, persists across a reload and toggles off.
- **Not run.** There was no Mac, no iOS simulator and no iPhone in this session, so nothing here comes from real iOS. The service-worker update and offline paths were not re-run. The change touches no worker or storage code, and the two new files are in the precache.

**Still to check on the phone,** after this is deployed and Update game has applied it:
- **The readout.** Open **How to play**, tap the title five times, close the sheet and screenshot.
  - Expected: `standalone true`, screen `393×852`, `--vh 852 (852px)`, scene `0–852`, and amber and cyan rules meeting at the bottom edge.
  - Those numbers confirm the cause directly: `inner`, the `units` row and `safe` show what this iOS build reports.
- **Lifecycle.** Screenshot again after rotating, after going to the home screen and back, and after opening and closing How to play. The last six lines log each event.
- **Touches below the old edge.** Touch the floor in the bottom 60 pt. The `touch` row should show a y above 793.
- **Turn it off** with the same five taps.
- **The other phones.** Check a notchless phone (SE) and a notched one if available, and a Safari tab to confirm it is unchanged.

### On the phone · first readout

The first fix shipped in #12. The readout was screenshotted on the reporting iPhone 14 Pro, installed app, after Update game. The user agent says iOS 18.7, but that is the OS token Safari has frozen since iOS 26; the phone runs iOS 27.2.

| Value | Portrait | Landscape |
|---|---|---|
| `screen` | 393×852 @3 | 393×852 |
| `innerWidth×innerHeight`, `visualViewport` | 393×793 | 852×334 |
| `documentElement.clientWidth×clientHeight` | 393×793 | 852×393 |
| `100%` / `100dvh` / `100svh` | 793 / 793 / 793 | 334 / 334 / 393 |
| `100vh` / `100lvh` | 852 / 852 | 393 / 393 |
| Safe areas (top, bottom, left, right) | 59, 34, 0, 0 | 0, 20, 59, 59 |
| `--vh`, scene | 852, 0–852 | 393, 0–393 |

- **Confirmed.**
  - **The shortfall.** The layout viewport is 59 px (the portrait top inset) short in portrait, and the visual viewport is 59 px short in landscape too.
  - **The decision code** worked as designed: `navigator.standalone` was true, and `--vh` was 852, then 393 after rotation, then back to 852.
  - **Updates.** It was refreshed on rotation, return from the background and focus, all logged.
  - **Insets** are correct.
  - **`100vh` and `100lvh` are full height on this phone.** That holds for these readings only.
- **Landscape fills the screen.** Before the fix, the board and grip came from `100dvh` (334) there, so landscape was also squeezed.
- **Portrait still stopped at 793.**
  - The room was laid out to 852, but nothing painted below 793. The amber bar at `--vh` was invisible, and the cyan bar at the layout viewport's bottom sat on the edge of the dark band.
  - Touches below 793 produced no event at all. The lowest logged was at 792.
- **What tells the two apart.** In landscape the document was 393 tall (`clientHeight`) and painting reached 393, past a 334 px `innerHeight`. In portrait the document was 793 tall and painting stopped at 793. WebKit paints and hit-tests the installed app only as far as the document reaches, and a fixed layer taller than the document is cut off at the document's bottom.

**Second fix.**
- **The document is now screen height too.** `src/viewport.js` sets `html { height }` to `--vh` along with `--vh`. The root keeps `overflow: hidden`, so a document taller than the layout viewport still can't be scrolled.
- **Reach.** The reach test gained the phone's measured landscape layout (bottom inset 20, board 303 px).
- **Re-measured.** Tip error, 9 swipes per layout in the Chromium model:
  - 0.000020 CSS px at 393×852 laid out at 793;
  - 0.000019 at 320×568 laid out at 548;
  - 0.000017 at 852×393 with the measured insets;
  - 0.000019 at 667×375;
  - 0.000019 in a Safari tab.
- **No `tune` change.**

**The readout as an experiment.** Its new **Fix** button switches live between three ways of reaching the bottom, and the choice persists:
- `doc`: the document is `--vh` tall. This is shipped.
- `fixed`: the first fix alone.
- `flow`: the root left `overflow: visible`, with a normal-flow body at least `--vh` tall.

New rows show the document's height and scroll position. Touches are logged as both pointer and touch events, in case WebKit sends one without the other.

**If `doc` fails on the phone,** the band is outside anything the page can draw. That would mean the web view itself ends at 793. The remaining lever is the status-bar style: dropping `black-translucent` makes iOS reserve the top 59 px as a status bar band. That trades the dead band for an opaque top bar and needs every player to reinstall. That isn't decided until the readout rules out the page-side fixes.

### On the phone · second readout

Same phone and installed app, after Update game to #13. Safari reports `Version/26.6.1`; the OS token is frozen at 18.7.

- **`doc` didn't work.** With the document `--vh` tall and the root `overflow: hidden`, the bottom still stayed dead.
- **`flow` worked.** That is the root left `overflow: visible`, with a normal-flow body at least `--vh` tall.
  - **Portrait:** the room reached the bottom edge, with the amber bar on it. Touches at 840 arrived as both pointer and touch events.
  - **WebKit's own figures came back to full height:** `innerHeight`, `visualViewport` and `100%` read 852, and `100dvh` 852. Only `clientHeight` (793) and `100svh` (793) stayed short.
  - **Landscape:** `innerHeight` was 393, where the first readout had 334.
  - **No scroll:** the scroll offset stayed 0 throughout. Rotation, a return from the background and focus were all logged.
- **What this means.** A root that clips (`overflow: hidden` on `html`) cuts the installed app off at the short layout viewport, whatever the document's height. With the root left visible, `body`'s `overflow: hidden` passes to the viewport instead, which still stops the page scrolling. A body at least screen height then gives WebKit the full screen back.
- **Not isolated.** `doc` and `flow` differ in two things: the root's overflow, and how the document height is set. With one round per deploy, I shipped the combination that was measured working rather than splitting them.

**Shipped.**
- `src/viewport.js` sets `--vh` and a `data-screen` attribute on the root, and no longer sets the height inline.
- In `style.css`, `:root[data-screen]` gets `height: auto; overflow: visible`, and its `body` gets `height: auto; min-height: var(--vh)`. This is exactly the `flow` rules.
- Safari tabs, iPad windows and other browsers never get the attribute, so they keep `height: 100%; overflow: hidden`.
- `tests/viewport.test.js` checks both rules.
- The readout's fix switch is gone. The readout itself stays behind the five-tap flag for the remaining checks.

**Re-measured in the Chromium model.**
- **Tips.** 9 swipes per layout; largest tip error:
  - 0.000018 CSS px at 393×852 laid out at 793;
  - 0.000019 at 320×568 laid out at 548;
  - 0.000015 at 852×393 with the phone's insets;
  - 0.000016 at 667×375;
  - 0.000015 in a Safari tab.
- **Layouts** are unchanged from the previous round, and the reach test holds.
- **Scrolling.** A wheel and a touch scroll gesture on the lobby left the scroll offset at 0.
- **Matches.** A touch solo (393×852), a reduced-motion touch duel (852×393) and a keyboard solo (320×568) all finished.
- **Dialog and readout.** The help sheet ends at 852. The readout toggles on and off.
- **No `tune` change.**

**Still to check on the phone with this build:**
- Play a few darts in portrait: the dart sits near the home indicator and picks up.
- Open How to play: the sheet reaches the bottom edge, with the backdrop covering everything.
- Try to drag the lobby and the help text: the page doesn't move, and the help text still scrolls when it's long.
- Rotate during a visit.
- After those, turn the readout off with the five taps.

## 301 · 20 November 2026

Dartshift gets a second game beside Nine Dart Rush: classic 301, solo and as a local duel. This section was written before the code and the code follows it.

### Rules

- **Start and count.** Each player starts on 301. Every dart's score comes off the remaining total. First to exactly zero wins.
- **Double out, no double in.** The last dart must be a double or the bull (50). One rule set, no settings. Double-out is what makes 301 a different game from Nine Dart Rush; straight-out would just be "score 301 fast". Double-in is left out: on a phone, a beginner already spends visits hunting a double to finish, and doing it at the start too would turn many matches into ten rounds of nothing.
- **The bull counts as a double** for the finish, as in the regulation game. The outer bull (25) does not.
- **Bust.** Any of these ends the visit at once and puts the score back to what it was at the start of that visit:
  - **below zero**;
  - **left on 1**, which can't be finished on a double;
  - **zero without a double**, e.g. single 20 on 20.
  Every dart of a bust visit still counts as thrown.
- **First to finish wins outright.** In a duel, Player 1 throws first, and if Player 1 checks out, Player 2 does not get an equalising visit. That is the classic rule, and it keeps "game shot" final.
- **Ten rounds.** Each player gets at most ten visits (30 darts). A strong swipe player finishes 301 in six to nine darts; a beginner may never hit the double. Ten rounds caps a duel at 60 darts, about six Nine Dart Rush matches, rather than letting it run forever.
- **Tie-break at the limit.** If nobody has checked out after ten rounds, the lowest remaining score wins. Equal remaining scores draw, as equal totals do in Nine Dart Rush. Sudden death was rejected: it would add another phase to explain for a case that only comes up when both players miss doubles for ten rounds.
- **Solo 301** is a race against the dart count: check out in as few darts as possible within ten rounds. A run that doesn't finish ends "Out of rounds" with the remaining score and sets no record.

### Checkout guide

- When the remaining score can be finished with the darts left in the visit, the empty dart slots on the scoreboard show a route, e.g. `T20 D20` for 100 with three darts in hand. When no route exists (above 170, the bogey numbers 169, 168, 166, 165, 163, 162, 159, or too few darts), the slots stay empty.
- Routes come from `checkout()` in `src/game.js`, not a hand-typed table: fewest darts first, then the cheapest route by a fixed cost (single set-up darts over trebles over doubles and bulls; finishes D20, D16, D18, D12 … then the bull). Because a single set-up dart is cheaper than a treble, routes often finish on the bull (121 is T20, 11, Bull rather than T20, T11, D14). That suits this game: a straight stroke of 60% of the board width is the calibrated bull shot, so the bull is the easiest double here. Routes never pass through a bust. They are always valid, but not always the route a professional would choose.
- The guide is on for everyone, always. Beginners need it most, and a player who knows their outs can ignore four small labels.
- Screen readers hear the route after each dart and at the start of each visit ("41 left. Checkout: single 1, double 20.").

### Match model and saves

- **Game and player count are separate.** `match.mode` keeps meaning player count (`"solo"`/`"duel"`). A 301 match adds `game: "301"`. A match with no `game` is Nine Dart Rush, so every existing match object is unchanged.
- **One replay for both games.** `status()` replays the saved hits as before. For Nine Dart Rush the replay is the same code; it now also returns the list of visits. For 301 it walks the hits visit by visit, applying busts and the checkout, so a visit can close after one, two or three darts. Starting score, bust reverts and the winner are all rebuilt from the hits; nothing else needs saving. The app reads visit boundaries, the current player and dart from `status().visits` instead of `n % 3`, for both games.
- **Validation.** A saved 301 match is rejected if any hit comes after the match ended (a checkout, or the end of round ten), as well as for the existing coordinate checks.
- **Storage: a second key, not a new format.** `dartshift.save.v1` keeps exactly its current shape and meaning: the Nine Dart Rush match, the Nine Dart Rush best, mute and the acknowledged visit. 301 lives in a new key, `dartshift.301.v1`: its match, its best, its acknowledged visit, and which game the lobby last showed.
  - **No migration is needed.** Every current save loads exactly as before, including a Nine Dart Rush match in progress and its best.
  - **An older cached copy** that meets a newer save (a rollback, or an old tab writing before it reloads on update) sees only `save.v1`, in the shape it expects, and plays Nine Dart Rush normally. It never reads or writes `dartshift.301.v1`, so it cannot misread a 301 match as Nine Dart Rush and cannot drop the 301 record. Putting 301 into `save.v1` would have failed both ways: the old validator accepts any solo match of up to nine hits, and the old `save()` rewrites only the four fields it knows.
  - **One match per game.** Each game keeps its own match in progress, so a paused Nine Dart Rush run survives starting a 301 duel. Within a game, starting the other mode still asks before replacing the saved match.
  - **Update game** writes `dartshift.resume` as `"1"` for Nine Dart Rush (as before) and `"301"` for 301. An older copy treats `"301"` as "go to the lobby".

### Lobby

- A two-way switch, **Nine Dart Rush | 301**, sits above the Solo and Duel buttons. The lobby remembers the last game shown, so the common path (open, tap Solo or Duel) is still one tap, and choosing the other game costs one tap, once.
- The switch updates the room in place: the tagline, the button descriptions, the personal-best plate and the neon sign ("NINE DART RUSH" or "DOUBLE OUT 301"), which relights. The board and camera don't move.
- Resume labels are per game: "Resume solo run · Round 4 of 10 · 121 left".

### Records

- Nine Dart Rush keeps `best` (0–540, highest) in `save.v1`, untouched.
- 301 keeps its own record in `dartshift.301.v1`: **fewest darts to check out in a solo run**, an integer from 6 (the fewest possible: 180 then a 121 finish) to 30. Every dart counts, busts included. A run that doesn't finish sets nothing. Duels set no record, as in Nine Dart Rush.

### Presentation

The room's existing pieces, used for the new moments:
- **Remaining** is the big number on the scoreboard and counts down dart by dart. In a duel the other player's remaining sits in the corner.
- **Bust.** The dart's callout reads BUST over the bed it hit, the impact plays the dull miss thud, the visit ends at once and the camera steps back as at any visit end. The card's big number reads BUST with the reason as its caller line ("Below zero · back to 40"), and the busted darts are struck through on the scoreboard.
- **Checkout.** The finishing dart's callout reads "Game shot", flares the lamp whatever the double's value, then the match ends with the neon relight and fanfare.
- **Ton-plus visits** get the same caller line ("Ton 40") and second lamp flare as in Nine Dart Rush.
- **Results.** Instead of a ten-row round table, the card shows darts thrown, three-dart average and best visit for each player.

### Left out

- **501, other starting scores and double-in.** One starting score keeps the lobby to one extra choice.
- **Legs and sets**, alternating the throw between legs, and a per-match starter choice. Player 1 always throws first.
- **A straight-out setting.**
- **A 301 average or best-visit record.** Only fewest darts is kept.
- **Computer opponents**, as before.

### What changed in the code

- `src/game.js`:
  - `freshMatch(mode, game)`, the 301 replay in `status()` and the visit list for both games;
  - `checkout()`, and 301 validation in `decodeMatch()`;
  - `readSaves()` and `writeSaves()` for the two keys.
  `scoreAt()` is untouched.
- `src/app.js` reads visit boundaries from `status().visits`, keeps one match, record and acknowledged visit per game, and adds the lobby switch and the 301 copy. The throw, flight, camera, hold and landing code paths are the same functions as before.
- `style.css`:
  - adds the switch, the checkout and struck-out slots, and the bust callout colour;
  - in the scene tuning's short-portrait block, adds a wide shot (`--wide-y: -0.05; --wide-z: 2.2`), so the lobby board clears the taller lobby on SE-class screens.
- No `tune` value, `src/input.js`, `src/throw.js`, `src/art.js` or worker change.

## 301 verification · 20 November 2026

- **Automated.** All 34 Node tests pass. The 13 new ones in `tests/x01.test.js` cover:
  - each bust (below zero, left on 1 including on a first dart, zero off a single or treble, zero off the outer bull);
  - checkouts on a double and on the bull, finishing on the first, second and third dart;
  - a duel won outright with no reply, and turn order after a bust;
  - the ten-round limit: solo, duel won on the lower score, and a drawn duel;
  - rebuilding mid-visit and just-bust saves, and rejecting darts after the end;
  - every checkout route from 2 to 170, including the bogey numbers;
  - loading current `save.v1` saves unchanged, and the 301 key surviving an older copy's rewrite.

  The production build precaches 22 local assets, as before.
- **Engine.** This session had Playwright 1.63 with Chromium only. WebKit and Firefox weren't installed, and no Mac, simulator or iPhone was attached. Everything below is Chromium under `/Darts/`, with simulated safe-area insets.
- **Complete matches** with `scripts/check/match.cjs`, which now plays 301 too. All passed with clean consoles, results matching the saved hits and focus checks in keyboard runs:
  - **301 by keyboard, a scripted route.** Each run hits all three bust types, then checks out on D3 with the third dart.
    - Solo at 390×844 with reduced motion and at 320×568 and 375×667: 17 darts, three bust cards, "Checked out", record 17.
    - Duel at 390×844: Player 1 wins on the game shot, and Player 2 never gets a reply visit.
  - **301 by touch.** A 393×852 solo and a 320×568 reduced-motion solo ran to the ten-round limit ("Out of rounds", the latter with a bust). A 375×667 duel, a 390×844 duel and an 852×393 reduced-motion duel with four busts went the full sixty darts and were decided on the lower score.
  - **301 checkout by touch.** A solo seeded on 50 finished with a calibrated straight stroke on the bull: game shot, "Checked out", record saved.
  - **Nine Dart Rush regressions:** a touch solo at 390×844, a touch duel at 852×393, a keyboard duel with reduced motion at 390×844, and keyboard solos at 320×568 and 390×844. Each had nine or eighteen darts, the same cards and the same totals.
- **Update, offline and rollback.** This used a real service worker, three builds (the previous release at 5fca17d, this build, and this build with one changed byte) and one browser profile:
  1. The previous release, mid Nine Dart Rush solo, with mute on and a best of 450. Update game reloaded straight into the same visit on 230. The next dart saved, and the best and mute were kept.
  2. On this build, a 301 solo was left on the bust card. Updating to the newer build resumed on that bust card ("Left on 1 · back to 121"), and the next visit showed the checkout guide.
  3. With the server stopped, a reload launched from cache in the 301 lobby, resumed and took a dart.
  4. **Rollback.** The previous release was served again and applied with its Update game. It resumed its own Nine Dart Rush match with best 450 and took a dart, and the 301 key was byte-for-byte unchanged.
  5. Forward to this build again: the 301 match, the 301 record, the Nine Dart Rush match, best and mute were all intact.
- **Looked at** (screenshots): the lobby for both games, the checkout guide, the bust card and the results at 390×844, 320×568 and 852×393, and the How to play sheet. At 320×568 the lobby panel covered the lower half of the board until the short-portrait wide shot above was added. Now the board ends at 319 px and the panel starts at 331 px.
- **Pre-existing, left alone.** In a duel at 320 px wide, the scoreboard's "Player 1" label wraps to two lines next to "Player 2 · 244". The previous release does the same in a Nine Dart Rush duel.
- **Not re-run.**
  - The nine-viewport safe-area audit and the 44 px control audit; only the sizes above were checked.
  - Tip alignment and frame timing, because no throw, flight or landing code changed.
  - WebKit.

**Still to check on the phone:**
- **The lobby switch.** Pick 301, close the app, reopen it and confirm 301 is still selected. Check the neon relights, and that the switch is easy to hit and doesn't crowd the board on an SE.
- **A 301 solo to a checkout.** Watch that:
  - the remaining score counts down;
  - the checkout slots are readable at arm's length;
  - a bust ends the visit with the dull thud and the BUST callout;
  - the game shot gets the flare, neon and fanfare.
- **A 301 duel through at least one bust handoff,** in portrait and landscape.
- **VoiceOver on one 301 visit.** It should read the remaining score and the checkout after each dart, "Bust, left on 1. Back to 121." on a bust, and the checkout route on the slots.
- **Update game from the live release mid-match.** The existing Nine Dart Rush match and best should carry over.

## The flick · 20 November 2026

Players say the throw is too easy. This section supersedes "Identical releases should remain repeatable" and the gesture tuning in "Physical throw", and the stroke rules in "Grab and flight" where they say otherwise.

### Measured first: the stroke model and the targets

`scripts/model/difficulty.mjs` imitates a human flick and plays the throw with it. `scripts/model/legacy-throw.mjs` is the release model as shipped before this change (main at c83ebb6, copied verbatim and checked against git), so "before" can be re-measured at any time. Run `node scripts/model/difficulty.mjs` (about 7 minutes; `--quick` for a rougher pass). Everything is seeded and prints the same numbers every run.

**The model.**
- **A stroke** is a minimum-jerk reach from rest, lifted part-way through. Lifting near peak speed is a decisive flick; lifting while slowing is hesitant. The path bows sideways, the finger trembles at 8–12 Hz, and sometimes it stops before lifting. The touch screen samples it at 60 or 120 Hz with random phase, adds 0.25 px of noise, reports thirds of a pixel, and reports the lift on the next sample at the last position.
- **The player has learned the throw.** For each bed they aim at, they find the plan whose average landing on their own phone is the bed, by whichever of three ways hits it most often: keep a natural flick speed and vary the length; keep a length and vary the speed; or slide to a spot, stop and lift. Then they throw it with their own noise.
- **Two profiles,** at a 340 px board (an iPhone 15 or 16 in portrait). Motor noise is physical, so it is in CSS px and seconds.

| Per throw, 1σ | Casual | Skilled |
|---|---|---|
| Where the finger lifts, along the stroke | 9 px | 3.5 px |
| Direction | 2.5° | 1.0° |
| Peak flick speed | 15% (+0.1 widths/s) | 6% (+0.05 widths/s) |
| Lift timing (0.5 = at peak speed, 1 = stopped) | 0.62 ± 0.08 | 0.52 ± 0.04 |
| Bow of the path, per its length | 2% ± 2.5% | 0.5% ± 0.8% |
| Stops before lifting | 8% of throws, 30–150 ms | 1%, 30–120 ms |
| Tremor | 0.8 px | 0.4 px |

  These are assumptions, not measurements. The ones I am least sure of are the speed spreads; `--robust` repeats everything with every noise ×⅔ and ×1.5.
- **Measures.** Hit rates aiming at the bull (50 only), treble 20 and doubles 20 and 16; the expected Nine Dart Rush score with every dart aimed at whichever of T20, T19, bull or single 20 scores most; and darts to finish 301, double out, following the game's own checkout guide, played without the ten-round limit (the limit is shown as the share finished within 30 darts). Each figure is the mean of a 60 Hz and a 120 Hz phone. First-time players are modelled separately: casual noise, a natural speed and length drawn from wide spreads, aiming at the bull and correcting half of each miss.

**Before** (main at c83ebb6):

| Profile | Bull | T20 | D20 | D16 | Nine Dart Rush | 301 darts (mean / median) | 301 within 10 rounds | Aims T20 by |
|---|---|---|---|---|---|---|---|---|
| Casual | 6.7% | 10.0% | 14.0% | 18.5% | 199 | 20.8 / 19 | 90.8% | flick |
| Skilled | 36.3% | 40.6% | 42.5% | 49.1% | 328 | 10.5 / 10 | 100% | slide and stop |

- **The diagnosis holds.** A skilled player's best throw is not a throw: slide to a spot, stop, lift. The stop makes the release speed exactly zero every time, so the speed correction is a constant the player learns, and the lift point is read while the finger is still. The same plan with no motor noise spreads by only 0.6–0.8 mm.
- **A fast flick was already noisy, for the wrong reason.** With the finger moving at lift, the last 60 Hz sample can fall up to 16.7 ms before it, and at 700 mm per board width that is up to 35 mm of height decided by when the screen happened to sample. Skilled flickers lost 10 points of T20 rate at 60 Hz against 120 Hz.
- **Gap now:** skilled ÷ casual is 1.65 in Nine Dart Rush, 1.98 in 301 darts (casual ÷ skilled) and 4.1 in T20 rate.
- First-time players: 97% of first darts land on the board and the median distance from the bull falls from 63 mm (dart 1) to 24 mm (dart 15).

**Targets, set here before any tuning.** Each is checked with the full model run:

| | Target | Before |
|---|---|---|
| Casual, clearly harder | T20 ≤ 6%, bull ≤ 4%, D20 ≤ 8% | 10.0%, 6.7%, 14.0% |
| | Nine Dart Rush ≤ 160 | 199 |
| | 301 ≥ 27 darts, but ≥ 60% still finish within 10 rounds | 20.8, 90.8% |
| Skilled, still clearly rewarding | T20 ≥ 25%, bull ≥ 20%, D20 ≥ 25% | 40.6%, 36.3%, 42.5% |
| | Nine Dart Rush ≥ 270 | 328 |
| | 301 ≤ 14 darts, ≥ 98% within 10 rounds | 10.5, 100% |
| Wider gap | Nine Dart Rush skilled ÷ casual ≥ 1.8 | 1.65 |
| | 301 darts casual ÷ skilled ≥ 2.2 | 1.98 |
| | T20 rate skilled ÷ casual ≥ 5 | 4.1 |
| Learnable | ≥ 85% of first darts and ≥ 95% of third darts on the board; median miss at dart 15 ≤ half of dart 1 | 97%, 100%; 63 → 24 mm |
| The player decides, not the screen | A clean skilled flick with no motor noise spreads ≤ 3 mm per axis at 60 Hz; 60 and 120 Hz agree within 2 mm on average and within 3 points of T20 rate | — |
| Clean strokes stay clean | A clean stroke's miss is exactly 0; ≥ 85% of skilled strokes earn none | — |
| No pointer aiming | Slide and stop is never a profile's best way to aim; it hits T20 ≤ 2% for the skilled profile | It is the skilled profile's best way |
| Robust | Casual harder, skilled ≥ 270 and a wider gap still hold with every motor noise ×⅔ and ×1.5 | — |
