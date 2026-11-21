# Dartshift player experience review

21 November 2026 · Main at `42538dd` · [Live game](https://strikeadeal.github.io/Darts/)

## Summary

1. **Give players a warm-up.** The first valid flick spends a match dart, and the lesson from a bad third dart disappears at the handoff.
2. **Protect newer progress from stale tabs.** An older tab can erase a newer 301 match when the player toggles sound.
3. **Make a full match playable without a flick or hardware keyboard.** The “Throw dart” button has no standard activation path on its own.
4. **Explain installation and offline readiness in the game.** A player arriving from a link gets no indication of how to install or when an offline launch will work.
5. **Make 301 readable without darts shorthand.** Checkout targets share slots with thrown scores, and a final-visit bust can disappear into generic results.

## Evidence and coverage

I synced `main` to `origin/main`, read [README.md](README.md), [DECISIONS.md](DECISIONS.md) and all eight [source modules](src/), and checked the HTML, CSS, manifest and cache flow. The production build precached 22 local assets, all 41 Node tests passed, and its worker fingerprint matched the live Pages release (`9da773f5e0bf601a`).

**Native test limit.** The iOS 27.2 simulator was available through Xcode's command line. Fresh iPhone 14 Pro (393×852) and SE (3rd generation) profiles stalled during startup. The 14 Pro eventually reached Safari’s start page. Opening the local and live URLs timed out. Live URL launch also timed out on the already booted iPhone 17. The XCTest UI runner never opened its control endpoint. The match and lifecycle results below come from desktop browser runs at phone sizes. The native install, icon launches, matches, offline play and update remain unverified for this revision. Earlier device evidence in [DECISIONS.md](DECISIONS.md) covers earlier builds and the installed viewport fix.

| Complete matches through visible controls | Viewport and input | Observed finish |
| --- | --- | --- |
| Nine Dart Rush solo | 320×568, Chromium touch and WebKit pointer | Nine darts, round cards, run result and record |
| Nine Dart Rush duel | 393×852 WebKit pointer and 852×393 Chromium touch | 18 darts, five handoffs and winner |
| 301 solo | 393×852 Chromium touch and 667×375 WebKit pointer | 30 darts, out of rounds and remaining score |
| 301 solo checkout | 393×852 WebKit keyboard | Three bust types and a 17-dart checkout |
| 301 duel | 667×375 Chromium touch and 852×393 WebKit keyboard | A 60-dart round-limit win and a separate game-shot win |

These Playwright runs used simulated safe-area insets, a mix of standard and reduced motion, and included 320×568, the repository's smallest layout target. Visible results matched the saved hits and the match runs reported clean consoles. The scripted scores describe the exercised paths. Judging a player's learning curve or the feel of the release requires hands-on play.

**Return and update.** In browser tests a fresh lobby led to a first throw and a recorded Rush result. After leaving a new run, reloading offered Resume. In WebKit, serving previous main `231d88f` and then `42538dd` on the same test URL exposed **Update game**, returned directly to the saved visit and kept the existing record. With the test origin unreachable, the cached page reloaded, resumed and accepted the next dart. Chromium passed the same flow with a controlled worker-version change.

## Benchmark notes

The comparison used publisher listings and documentation, plus a player walkthrough for GamePigeon's Darts. The listings establish the features advertised by each publisher. They leave the precise feel of the gestures and effect on retention open.

| Game and sources | What Dartshift can learn |
| --- | --- |
| **GamePigeon Darts.** The publisher places multiplayer in iMessage. The walkthrough describes opening a conversation, picking Darts and taking a three-dart turn. The listing also records automatic sending and result previews for GamePigeon. The conversation gives friends a shared place to return to. The materials leave the release model and dedicated practice flow unclear. [Publisher's App Store listing](https://apps.apple.com/us/app/gamepigeon/id1124197642) · [Darts walkthrough](https://www.youtube.com/watch?v=Iejuyod4SiM) | A friend is the entry point and the reason to reopen. Dartshift can borrow the low-friction invitation and easy rematch while keeping its offline duel. |
| **Darts of Fury.** Yakuto advertises swipe control, a replayable tutorial, large arena scoring, friend challenges and recurring League progression. [Official game site](https://dartsoffury.com/) · [Gameplay support](https://support.yaku.to/hc/en-gb/categories/10624110483601-Darts-of-Fury) · [Publisher's App Store listing](https://apps.apple.com/us/app/darts-of-fury-pvp-multiplayer/id1098189391) | The tutorial gives the gesture a place to be learned. Score feedback and a next objective give each visit a purpose. Dartshift already has the arena feedback and can give that feedback more time to be understood. |
| **Flick Kick Football Kickoff.** PikPok describes different outcomes from the same flick, dedicated practice and target challenges, local pass-and-play, and arcade and timed replay modes. [Official game page](https://pikpok.com/games/flick-kick-football-kickoff/) · [Publisher's App Store listing](https://apps.apple.com/us/app/flick-kick-football-kickoff/id421764869) | One gesture can carry both consequence-free practice and competitive play. A small target drill can add variety and teach skill with the existing board. |

## Ranked gaps

### 1. The first useful feedback comes inside a scored match

**Evidence.** Both mode buttons take a fresh player straight to the oche. The first screen says “Flick the dart up” and “Faster flies higher · keep it straight.” The full explanation of where to touch and when to release sits behind the help icon. In the touch and pointer runs, an off-dart swipe left the score alone and prompted the player to touch the dart. Once picked up, a valid upward flick spent a dart. [The landing flow](src/app.js#L623) puts the diagnosis on the next dart's prompt. If the dart ends a visit, that prompt has no visible destination. On the match-ending dart the coaching is also omitted from the live announcement. The recent removal of minimum travel makes small accidental upward releases possible, a trade-off already recorded in [DECISIONS.md](DECISIONS.md#no-minimum-swipe--21-november-2026).

**Impact — High.** New players and guests can practice only by spending darts in a run or making the other player wait. A miss due to late release can send a different lesson from a clean low hit. A few low-stakes comparisons could teach the difference between changing speed, leaning the direction and releasing cleanly. How many tries a real novice needs is still open.

**Effort — Medium.** A short, replayable warm-up, an entry from the lobby or help, and a stable way to read the last result. Reuse the current throw, board and scoring.

**Risk.** A mandatory tutorial would slow repeat visits. Additional effects or a new per-frame overlay could revive impact lag. Practice scoring must stay outside match and personal-best storage.

**Direction.** Offer an optional first warm-up with a clear starting target, immediate feedback in plain language, and one easy route into Nine Dart Rush. Let guests try it without replacing a paused duel. Carry a useful last-dart tip through the player's own visit boundary. Keep the release-model audit separate.

### 2. A stale tab can replace a newer match without warning

**Evidence.** Reproduced in Chromium and WebKit on the same origin and browser profile. Open Dartshift in two tabs. In A, start 301 solo and land one dart. In the untouched tab B, tap sound. The saved 301 match becomes empty and reloading A loses **Resume Solo run**. [App startup and save](src/app.js#L24) read the snapshots once and write all three keys on each save. The sound handler calls that same write path. A stale personal-best overwrite is possible by the same mechanism. The reproduction above confirmed match loss.

**Impact — High for affected players.** A player can lose a long solo run or duel through an unrelated action. This requires two clients sharing a store. The frequency is unknown, and WebKit isolates an installed Home Screen app's store from Safari. [WebKit tracking and Home Screen storage](https://webkit.org/tracking-prevention/)

**Effort — Medium.** Scope writes to the intended change, reconcile records and match revisions, and handle a conflict before an outdated copy can replace a newer match. Test shared storage with updates and older save shapes.

**Risk.** This is the highest-risk change to existing saves. Watch old records, mixed-throw runs, acknowledgement of the visit card, write failures and update resume. A dart still needs to be durable before its flight starts.

**Direction.** Let preferences, game choice and independent matches coexist across tabs. If the same match diverges, keep the current saved version safe and make any replacement explicit. Resolve genuine conflicts without concatenating hits from different visits. Keep installs local and offline.

### 3. Keyboard support leaves a gap for people playing directly on the phone

**Evidence.** The dart exposes a button called “Throw dart.” Browser DOM activation of that button consumed zero darts in Chromium and WebKit. The implementation binds pointer motion and arrow/Space/Enter key events, with no action for the button's normal click. The board is exposed as a single image called “Dartboard, twenty at the top,” and the exact-aim sight is visual. The keyboard 301 runs did work, and scores, busts and checkout routes have live announcements. Actual VoiceOver and Switch Control interaction were outside this pass. [Throw input](src/input.js#L164) · [Board markup](src/art.js#L205) · [Announcements](src/app.js#L665)

**Impact — High.** A player who can't flick, see the sight, or use an external keyboard may reach a labelled control and then have no way to aim and release. A guest with a different input need can stall an otherwise playable local duel.

**Effort — Medium.** Provide a discoverable alternate aiming action using native controls and meaningful target labels, with focus and announcements across results, handoffs and checkout. Reuse the exact-aim and scoring path.

**Risk.** Compatibility clicks after a touch release can double-throw if the actions overlap. Extra controls could clutter the oche or shift the pickup geometry. Preserve the existing keyboard aim and local record policy, which already allows exact aim.

**Direction.** Offer a deliberate aim-and-throw sequence a player can finish by ordinary button activation. Let players hear or read the target they're about to hit, and reach a double or bull in 301. Keep the touch flick the primary presentation for players who choose it.

### 4. The browser lobby gives no path to the Home Screen or a reliable offline launch

**Evidence.** The fresh lobby showed game choice, Solo run, Local duel, help and sound. The HTML has a valid manifest and icon, and the worker caches assets. In-game help only covers play. Installation, first online launch and separate storage are described in the README, away from the player's journey. The worker registration failure is silent and the lobby offers no readiness signal. On iPhone, Apple's route goes through Safari's Share or Page Menu, then Add to Home Screen and, where offered, Open as Web App. [Lobby](src/app.js#L313) · [Worker registration](src/app.js#L831) · [Apple's installation steps](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27)

**Impact — Medium.** It matters most for players who find Dartshift by link and expect to return from an icon or play on a flight. Starting in Safari works. A Safari best can then appear to have vanished when the player launches the new app with its separate store. The share-to-install conversion and its failure rate are unknown.

**Effort — Small.** A discoverable, dismissible iPhone installation hint, instructions that fit both Safari layouts, and a compact readiness state derived from successful cache setup.

**Risk.** A persistent prompt can crowd the SE lobby. A premature “ready offline” claim could strand a player. A ready state should describe current cache readiness, since device storage can still be evicted. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)

**Direction.** Keep the first game one tap away. Make installation easy to find in Safari, describe where progress stays, and guide a new icon user through the initial online cache. Hide installation guidance in standalone.

### 5. 301 makes it hard to connect the next target with the last outcome

**Evidence.** On 41 left with three darts available, the scoreboard displayed `1` and `D20` inside the same three cells that later display scored points. Its accessible label spelled out “Checkout single 1, double 20.” At the start of a game and when no route exists, empty cells give no explanation. In a deliberately prepared [round-ten state](src/game.js#L154) on 41, I played D20. The live region said “Bust, left on 1. Back to 41.” The persistent result showed “Out of rounds,” 41 left, and a generic record message. The previous visit's bust reason was available on the ordinary handoff card. [Scoreboard and callouts](src/app.js#L456) · [Results](src/app.js#L707)

**Impact — Medium.** New 301 players can miss the difference between a recommended bed and a score they already hit. On the toughest visit, a one-point mistake can look like a timeout or a confusing score reset. Players who know darts can already use the compact routes.

**Effort — Small.** Distinguish route from visit history, explain the active target in plain language and carry the decisive bust or checkout into the result. Most work is scoreboard and result presentation.

**Risk.** New lines can squeeze the board in landscape and small portrait or cause repeated VoiceOver announcements. Keep route arithmetic, ten rounds and double-out intact.

**Direction.** Make the next legal target quickly readable and make the result explain the decisive dart. Use an outline or explicit label as well as colour. Keep the working result stats and use a quieter ending for an unfinished solo than for a checkout.

### 6. Solo play has little memory of getting better

**Evidence.** Rush shows round splits in the completed result. A returning player sees only a single best. 301 keeps fewest darts for a successful checkout. A player who reaches a new low remaining score still leaves an unfinished run with no saved milestone, and Play again replaces the last result. The next-step note already proposes Rush personal-best splits. The review adds a concrete reason to show how close a player came, including before their first checkout. [Current results](src/app.js#L707) · [Record policy](DECISIONS.md#records)

**Impact — Medium.** Solo regulars get a goal while the best is within reach. After a strong best or several unfinished 301 runs, improvement can be real without leaving much trace.

**Effort — Medium.** Persist a small recent-results or comparison summary and render it on return and replay. Scope the first pass to Rush comparison against a previous run or best splits, and a simple 301 finishing milestone.

**Risk.** Historical matches lack those splits. Avoid making up old history or comparing across incompatible throw versions. Additional writes should follow the safeguards in gap 2.

**Direction.** Answer “what improved?” and “what should I try next?” with a recent comparison and an achievable next target. Keep fewest darts as the 301 record. A closest-remaining milestone serves players without a checkout. Defer the previously excluded average and best-visit record categories.

### 7. Friends on separate phones have no challenge to respond to

**Evidence.** The 18-dart duel had a clear **Pass to Player 2** and five handoffs, with both totals displayed. The results supported **Play again**, which starts with Player 1 again. Nothing on the results card lets a player send a friend a score to beat. The lobby's Rush description explicitly says “Pass the phone.” The 301 button describes winning on a double and leaves the same-device requirement to the “Local duel” label. GamePigeon puts the invite and return path inside the conversation, and PikPok demonstrates same-device play can stand on its own. [Lobby and player labels](src/app.js#L257) · [Results actions](src/app.js#L783) · [GamePigeon's listing](https://apps.apple.com/us/app/gamepigeon/id1124197642) · [PikPok's listing](https://apps.apple.com/us/app/flick-kick-football-kickoff/id421764869)

**Impact — Medium.** Friends in the room already get a good match. People arriving from Messages cannot immediately do anything together across two phones. How many players want this is open.

**Effort — Small for a score challenge.** Put a share action on a completed run with game, result and canonical link, using the system share sheet or a copyable fallback. Use display text and a normal play link as the first version.

**Risk.** Scores are locally produced and exact keyboard aim is available, so a shared result is friendly and unverified. Avoid a misleading invite that suggests an active shared match.

**Direction.** Clarify same-phone play in both modes and make it easy to send a friendly “beat my run” challenge. This is the within-constraints answer to the social gap. Automatic remote turn delivery would introduce a messaging or sync dependency, plus turn history, abuse handling and ongoing testing. Leave matchmaking and remote duels outside this review's recommendations. Keep the existing handoffs and replay.

## Quick wins

- Add “Pass the phone” to the 301 duel description. On the existing visit card, say **Next player** alongside the name where both scores look equal at a glance.
- Put the final bust reason in the 301 results line when the last visit busts. Reserve the celebratory finish cue for a result that warrants it. Currently [finish](src/app.js#L785) calls the fanfare on any animated match ending, including a solo timeout.
- Update the README's “short strokes cost no dart” wording. Current `minimumRise` is zero, with tap/rest and sideways guards. Explain that a small upward nudge can throw, consistent with the latest decision. [README](README.md#play) · [Current release settings](src/throw.js#L5)
- Add installation steps to the existing help for iPhone Safari. This can land ahead of the offline-readiness signal.

## What to protect

- **The room and the board.** The persistent room connects lobby, oche, handoff and results. Tip placement, visible embedded darts and the impact callout make points feel earned. Keep geometry stable during play, and keep animation brief and skippable.
- **The two game lengths.** Rush is a complete nine-dart arc even for a beginner. In 301, an explicit bust reason and the return to the visit's starting score make a complex rule understandable. Ten rounds caps a difficult match and a legitimate checkout ends it immediately.
- **The same-phone handoff.** One clear action transfers the phone, with both players' standings visible. Preserve the explicit handoff and easy replay.
- **The offline foundation.** Local assets and a scoped precache let the small game run without service or sign-in. Saving on release, preserving the old record keys, and distinguishing a resumed visit from a new match are strengths.
- **The existing access work.** Keyboard aiming, live score and checkout announcements, labelled HUD controls, mute, and reduced motion already give future changes a good starting point. Preserve the no-idle-loop rendering and the 44-point control target.

## What to check on a real iPhone

- **First visit and first throws.** Give a new player only the Pages URL. Watch whether they find Safari's install action and understand “Open as Web App,” then observe their first three throws without coaching them yourself. Ask them to explain one low hit, one off-dart pickup and one late release. Test left and right thumb, one-handed reach, natural arcs, a small upward nudge, both board extremes and the home-indicator edge.
- **Display and performance.** Try a 60 Hz SE-class phone and a notched 393×852 phone in both orientations, including Safari chrome, installed safe areas, Display Zoom and enlarged text. On the oldest available supported iOS, check the board, pickup, route slots and results. Capture release-to-visible-flight, contact and the next frame with Web Inspector over repeated visits, including Low Power Mode and a warmed device. The frame target is 16.7 ms at 60 Hz.
- **Comfort and access.** Play a full visit with VoiceOver, then check Switch Control or an external keyboard with focus visible. Hear the aim or discover where it goes silent, then check bust, checkout, handoff and replay. Check contrast in daylight, text size and Reduced Motion. Try silent mode, speaker and Bluetooth, including mute after audio interruption.
- **Real lifecycle.** Install fresh, launch once online, force-quit, go to airplane mode, then launch from the icon and finish a resumed visit. Try an incoming interruption, rotation or app switch during pickup and just after release. Apply a real Pages update in a saved 301 visit and on a handoff. Compare Safari and icon records, and reproduce the stale-tab case in Safari with disposable test state. Check deliberate website-data removal in a test profile to learn what a player sees after data loss. Actual system eviction timing varies.
- **A real handoff and a real endgame.** Watch two people finish 301 through a bust and play a rematch. Check who they think is up, where they look for the recommended double, and whether they can explain the outcome after the results card arrives.

## Ready-to-use build briefs

### 1. Teach the flick through a short warm-up

Build an optional practice entry for Dartshift. A first-time player reaches a counted match immediately. An off-dart swipe teaches pickup. The first valid attempt spends a dart, and the third dart's coaching disappears when the visit ends. Use the current oche and outcome feedback to help players find a repeatable release before asking them to chase a score.

- **Constraints.** Static GitHub Pages, iOS 16.4+, offline after initial caching, local assets. Use the existing release model, flight, board and scoring. Leave room for the separate throw audit. Practice plays outside competitive match state and records.
- **Builder decisions.** Choose how to expose and dismiss the warm-up, how to demonstrate a reference flick, and what feedback stays on screen. Keep direct Solo and Duel entries. Use a small first target and a reason to try again. Decide how to retain actionable coaching at a visit boundary within the available layout.
- **Done when.** A newcomer can find practice, pick up the dart, throw several times, explain which change to try next, and get into a Rush run without an obligatory tutorial. A bad last dart can still teach something after the visit. A returning player can replay practice offline without disturbing paused matches or bests. The same pickup and stroke still produce the same landing in practice and a match.
- **Deliverables.** The warm-up and its entry points, targeted checks for practice isolation, and a short first-use test record on a real iPhone. Include portrait, compact portrait, landscape and reduced-motion coverage.

### 2. Preserve newer saves when the same game is open twice

Fix silent overwrites of Dartshift progress. Open two copies on the same origin before either has a saved 301 match. Start 301 solo and throw in A. Toggle sound in B. Reload A and the Resume button is gone. The current write path serializes every key from the tab's in-memory snapshot.

- **Constraints.** Local/offline storage, iOS 16.4+ and static GitHub Pages. Preserve existing save shapes or migrate them compatibly, including old-throw records and carried matches. Keep save-before-flight and update resume.
- **Builder decisions.** Decide how clients discover newer state, how fine-grained a save is, and how to surface a conflict when both clients advance the same match. Sound and mode selection should stay lightweight. Keep the policy clear and deterministic through reloads.
- **Done when.** The two-tab sound reproduction preserves A's exact hit count, remaining score and resume state. An unrelated mode selection, record change or foregrounded stale client cannot silently roll back either game's newer data. If two clients diverge on one match, a player sees a clear path to continue the current save before any explicit replacement. Old saves, offline reload and update-at-handoff still work.
- **Deliverables.** The persistence change, a repeatable two-client regression test, and coverage for a direct same-match conflict, an older save and a real worker update. Record which iPhone contexts shared storage during verification.

### 3. Provide a playable alternate aim and throw

Make a full Dartshift match playable with ordinary on-screen button activation. The current dart has the accessible name “Throw dart.” Standard DOM activation consumes zero darts. The functioning keyboard path needs arrows and keys, and its visual sight provides no verbal target. Build on the exact-aim route so players with motor or vision access needs can play and pass the phone.

- **Constraints.** Static GitHub Pages, iOS 16.4+, offline and no CDN assets. Preserve the current flick and keyboard interactions, local record rules and scoring. One deliberate action can commit one dart. Keep reduced motion and native control semantics.
- **Builder decisions.** Pick a compact way to choose and confirm a target. Decide where an alternate control belongs, how the player learns which bed is selected, and how focus moves across aim, next turn and replay. Let either guest use the alternate input during a duel.
- **Done when.** With VoiceOver on a real iPhone and no hardware keyboard, a player can select a bed, hear its name, release once, hear the result and play through a full Rush run. The path can choose doubles and the bull, complete a 301 checkout and handle a bust and a duel handoff. Check Switch Control or equivalent activation and verify that a normal flick cannot trigger a second throw through its compatibility click.
- **Deliverables.** The alternate input, visible and spoken instructions, a regression check for single-dart commit, and a short phone verification record covering focus, both orientations and offline play.
