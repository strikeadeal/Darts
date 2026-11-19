# Dartshift · design decisions

Recorded before implementation.

- **Match.** Nine Dart Rush gives each player three visits of three darts. Highest total wins, equal totals draw. No busts, checkouts or sudden death. Compared with 301 this gives beginners a definite finish and experts a 540-point ceiling.
- **Target.** Use the regulation clockwise sector order and nominal steel-tip ring radii. Score the dart tip. A radial boundary belongs to the inner bed, and a sector boundary belongs to the clockwise sector. Wires never bounce a dart out.
- **Throw.** Start a stroke anywhere inside the playfield and swipe up. The angle steers the dart and a longer stroke reaches higher. Use net displacement relative to board width so identical swipes land together across screen sizes. Commit on release, save before the flight animation, and ignore taps, sideways strokes and interruptions.
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
