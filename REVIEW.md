# Dartshift player experience review

21 November 2026 · `main` at `42538dd`, build `9da773f5e0bf601a` · [Live game](https://strikeadeal.github.io/Darts/)

## 1. Summary

The five gaps that matter most, in order:

1. **Players can't see what their flick did.** Height comes from release speed, but nothing on screen shows how hard a flick was. A clean dart that lands low but still on the board gets no coaching, and there's nowhere to practise without spending match darts.
2. **"With a friend" only means the same phone.** GamePigeon's whole premise is taking turns with someone who isn't in the room. Dartshift could do that with no server, using a challenge link.
3. **Records can silently disappear.** An older tab erases a newer personal best (reproduced). Safari and the installed app keep separate records, and nothing in the game tells a Safari visitor to install it or warns them.
4. **There's little reason to come back after the first few runs.** Each game has one number, with no history, stats, daily goal or practice game.
5. **VoiceOver and Switch Control users can't throw on an iPhone.** The only non-flick path needs a hardware keyboard, and text is fixed in pixels, so Dynamic Type has no effect.

## How this review was done, and its limits

- **Read:** `README.md`, all of `DECISIONS.md`, every file in `src/`, `style.css`, the manifest, the worker template, the build and the check scripts. `npm test` passes and the build matches the live fingerprint.
- **Played:** I played the production build under `/Darts/` with the service worker on, using Playwright Chromium with iPhone emulation (touch, `isMobile`, an iOS user agent and simulated safe-area insets).
  - Nine Dart Rush solo at 393×852 and 320×568, with first-time stroke styles.
  - A Nine Dart Rush duel in landscape (852×393), all 18 darts.
  - Two 301 solos at 393×852 (bust cards, the checkout guide, "Out of rounds").
  - Leaving mid-match, reloading (Resume), an offline cold reload and an update arriving mid-match.
- **Not available:** there was no Mac attached, so there was **no iOS simulator, real WebKit, Safari or Add to Home Screen**. Every iOS-specific statement below is from the code, `DECISIONS.md` or published reports, and is labelled as such.
- **Stroke timing is approximate.** Touches driven through CDP arrive later than scheduled, so the speeds the page measured were about half the speeds I scripted. I use the strokes only for **relative** findings (what gets coached, what doesn't), never for absolute calibration.
- **Competitor research came from search results only.** The fetch tool couldn't resolve the competitors' sites, App Store pages or reviews, so I couldn't open any of them. Citations below are search results and their summaries. GamePigeon's throw mechanics in particular are second-hand.
- **Prior draft:** a `REVIEW.md` appeared in history and was deleted. I reproduced its stale-tab claim independently before including it. Everything else here comes from my own reading and play.

## 2. Ranked gaps

### Gap 1 · Players can't see the cause of a throw, so they can't learn it

**What's wrong, and who it affects.** Every new player, and anyone whose natural flick doesn't match the tuned neutral speed. The game's main rule is that release speed sets the height. That's unusual: in GamePigeon-style games the player expects to drag to a spot. But speed is the one variable the player gets no feedback on.

**Evidence.**
- **Observed: clean but wrong throws get no feedback.** At 393×852, five clean strokes of slightly different speeds all landed on single 3, at the bottom of the board. After each one the prompt reset to "Flick the dart up".
  - `coach()` (`src/app.js:623`) only speaks after a fault of 6 mm or more, or when the dart is **off the board** (more than 170 mm out).
  - A player who is consistently too soft or too hard, but on the board, never hears "flick harder" or "flick softer".
- **Observed: a third of throws can never be coached.** Advice after the last dart of a visit (and after every 301 bust) is dropped, because the handoff card replaces the throw control (`src/app.js:694`). In my 301 runs, every bust visit ended with no coaching.
- **Observed: on small screens and in landscape, the only on-screen hint about the mechanic is hidden.** The second line, "Faster flies higher · keep it straight", is hidden in short portrait (`style.css:1231`, every SE-class phone) and in landscape (`style.css:1298`). It survives only in the help sheet.
- **Observed: a newcomer's instinctive stroke is penalised.** "Drag to the target and let go", the most natural first stroke for a drag-and-drop user, was a miss with "Let go while still flicking". That coaching is good. The gap is the clean-but-wrong case.
- **Observed: there's nowhere to practise.** "Solo run" starts a scored match at once (`start()`, `src/app.js:418`). There's no first-run warm-up or practice board. Every learning dart is a match dart, and a bad first run becomes the first personal best.
- **From `DECISIONS.md`: the tuning is uncertain.**
  - The neutral speed has moved 2.8 → 4 → 5 board widths per second in two days, and the swipe minimum went ⅓ → ¼ → 0.
  - "Neutral speed" says the evidence for the neutral value is "thin" and "needs the phone".
  - Players' natural flick speeds evidently vary. A fixed neutral will always be wrong for some of them, so they need to *see* their speed.
- **Benchmarks.**
  - **GamePigeon:** secondhand guides describe aiming by sliding a finger to the spot and releasing ([appdrum](https://appdrum.com/how-to-play-darts-in-gamepigeon-905/), [dartboardhub](https://dartboardhub.com/how-to-win-in-darts-game-pigeon/)). The player controls *where* directly, so there's no hidden speed variable to learn.
  - **Darts of Fury:** a walkthrough notes the throw "can take a lot of effort" to get used to ([Gamezebo](https://www.gamezebo.com/walkthroughs/darts-of-fury-tips-cheats-and-strategies/)). Its listing advertises a tutorial.
  - **Practice modes:** Darts Club and Darts Match both list one ([Darts Club listing](https://apps.apple.com/us/app/darts-club/id1389760587)).
  - **Visible cause:** Paper Toss and Flick Golf make the hidden variable visible (a wind arrow and number) rather than leaving the player to infer it ([FRVR Paper Toss](https://frvr.com/play/papertoss/)).

**Impact: high.** This is the first minute for every player and the feel of every dart after that. If a player can't connect "how hard" to "how high", the game reads as random, and they quit before the room, the records or 301 matter.

**Effort: medium.**
- Display the strength the release already measured (`readStroke().speed` against `tune.input.cruise`) after each throw.
- Extend `coach()` to on-board misses.
- Carry the last tip onto the handoff card.
- Add a no-score practice board. It can reuse `play()` with a match that's never saved, or a third mode.

**Risk.**
- **The throw:** none if it stays read-only. Nothing should change `tune` or `releaseThrow`.
- **Saves:** practice must never write match or record keys.
- **Performance:** a strength indicator is one more element changing per landing, during the frame `DECISIONS.md` already reports as over budget in WebKit. Fold it into the existing `morph` update rather than adding a layer.

**Direction.**
- After every throw, the player should be able to see how hard it was compared with a bull flick, and which way to adjust, including when they're on the board.
- The first launch should offer a short, unscored warm-up.
- Practice should stay one tap away from the lobby afterwards.

### Gap 2 · No way to play a friend who isn't holding the phone

**What's wrong, and who it affects.** Anyone who came for "GamePigeon-style darts". GamePigeon's defining loop is asynchronous: you take your turn in a chat thread, Messages sends the state, your friend takes theirs ([screenwise guide](https://screenwiseapp.com/guides/how-to-play-imessage-games), [appdrum](https://appdrum.com/how-to-play-darts-in-gamepigeon-905/)). Dartshift's only multiplayer is pass-the-phone ("Face a friend. Pass the phone."). After a solo run, nothing invites a friend at all: the results card offers only Play again and Modes (`src/app.js:785`).

**Evidence.**
- From the code: no `navigator.share`, no URL or hash handling, no import path.
- From the code: a match is tiny and fully replayable. `status()` rebuilds everything from `hits`, two numbers per dart, so a whole Nine Dart Rush visit list fits easily in a URL.
- Benchmarks: Darts of Fury and Darts Club advertise online multiplayer. GamePigeon does it through iMessage.

**Impact: high.** It turns a solo score into a reason to message someone, and a message into a reason to reopen the game. It's the main retention loop in this genre.

**Effort: medium for a one-way "beat my score" challenge, large for turn-by-turn 301.**
- It touches the results card, a URL or hash reader at startup, a new "challenge" match type and the lobby.
- No server is needed: the link carries the state, and the Web Share API opens the iOS share sheet.

**Constraint caveats.**
- **Links open in Safari, not the installed app.** Links tapped in Messages open in Safari ([report on iOS 18.3](https://community.glideapps.com/t/open-url-from-other-app-in-pwa/59048)).
- **Safari and the installed app don't share storage** ([WebKit 181849](https://bugs.webkit.org/show_bug.cgi?id=181849)).
- **What that means for the design:**
  - A challenge must be self-contained in the link: it carries the challenger's darts, and the reply carries both players'.
  - It must play correctly in a Safari tab.
  - The installed app needs a "paste a challenge" path. iOS shows its own Paste confirmation for clipboard reads.
- **Link integrity.** A link can be edited. That's acceptable between friends, but the game should state it rather than imply verified results.
- **Real-time online play** would need a server or a relay. That breaks the static, no-backend constraint and isn't recommended. The link-based version gets most of the value.

**Risk.**
- **Saves:** challenge matches must stay out of `dartshift.save.v1`, `dartshift.301.v1` and `dartshift.flick.v1`, and set no personal records.
- **Offline:** creating a challenge works offline. Sending one needs whatever messaging the player uses.
- **Stale-tab bug:** opening links creates new Safari tabs, which makes Gap 3's overwrite more likely. Fix that first.

**Direction.** After a solo Nine Dart Rush run, a player can send "beat my 214" to anyone. The friend plays the same nine darts' worth in their own browser, sees the challenger's visit totals beside their own, and can send the result back. Do 301 head-to-head by link only if the first version is used.

### Gap 3 · Records can be lost, and the player isn't told where they live

**What's wrong, and who it affects.** Every returning player. Records and the saved match are the only things that persist, and there are four ways to lose them:

- **Reproduced: a stale tab overwrites newer progress.** I opened the game in tab A, then tab B. In B, I played a 301 solo to three darts, and separately a Nine Dart Rush run with a record of 27. Then I tapped the sound button in A.
  - The 301 match became `null`, and `dartshift.flick.v1.rush` went from 27 to `null`.
  - Cause: each page reads the saves once at load (`src/app.js:36`), and every `save()` writes all three keys from that copy (`src/app.js:56–65`).
  - Real iPhone triggers: two Safari tabs, a tab restored after an update, or the challenge links in Gap 2.
- **Inferred from published reports: Safari and the installed app have separate stores.**
  - The README warns about this ("The installed app can have a separate store from a Safari tab"), but the game never does.
  - Someone who plays in Safari first and installs later starts again at "—", with no explanation and no way to move their records ([WebKit 181849](https://bugs.webkit.org/show_bug.cgi?id=181849)).
- **From published reports: Safari tabs can lose storage after seven days without use.**
  - WebKit's seven-day cap on script-writable storage applies to Safari tabs. Home Screen apps "have their own counter of days of use" ([iTnews](https://www.itnews.com.au/news/apple-cops-flak-for-deleting-local-browser-storage-after-7-days-539833), [Apple forums](https://developer.apple.com/forums/thread/710157)).
  - So a player who never installs loses records after a week away.
  - The game never calls `navigator.storage.persist()`. WebKit grants it by heuristics that favour Home Screen apps ([WebKit storage policy](https://webkit.org/?p=14403)). Reports conflict on whether it returns `true` ([WebKit 271401](https://bugs.webkit.org/show_bug.cgi?id=271401)).
- **From the code: there's no install guidance and no backup.**
  - iOS has no install prompt, and the game never detects a Safari tab to explain Add to Home Screen. Install steps exist only in the README.
  - There's no export or backup of records.

**Impact: high.** A personal best is the main reason to return in a solo game. Losing one silently, or finding the installed app starts empty, breaks trust in a way that's hard to win back. Without install guidance, many players will also never reach the offline, full-screen version the game is designed around.

**Effort.**
- **Stale-tab fix: small.** Re-read and merge before writing, or listen for the `storage` event and refresh `saves`.
- **Install card and persistence request: small.**
- **A records transfer code (Safari → app, or to a new phone): medium.** It can share the encoding from Gap 2.

**Risk.**
- **Saves (the merge):** the merge rules must keep the rollback guarantees `DECISIONS.md` relies on: `save.v1` keeps its shape, and older copies never touch the 301 or flick keys. Test it against the three-build rollback in "301 verification".
- **Layout:** the install card shows only in a Safari tab on iPhone, so it doesn't touch the installed layout or `src/viewport.js`.

**Direction.**
- No write ever replaces a newer save with an older one.
- A Safari visitor on an iPhone learns, once and dismissibly, how to add the game to the Home Screen and why: it plays offline, runs full screen and keeps their records.
- A player can carry their records from Safari to the app, or to a new phone, without a server.

### Gap 4 · Few reasons to come back

**What's wrong, and who it affects.** Players who have done a few runs of each game. After that, the lobby offers one number per game ("Personal best"), two games and nothing new from day to day.

**Evidence.**
- **From the code:**
  - The only stored records are `{ rush, 301 }` plus the old-throw bests (`src/game.js:232–273`).
  - Nothing records history, averages, darts thrown or recent runs.
  - Nine Dart Rush results show round splits for that run only. 301 shows darts, three-dart average and best visit for that run only.
  - The README already lists "personal-best round splits" as next.
- **Observed: 301 solo can end with nothing.**
  - A run of 16 darts ended "Out of rounds" on 26 left, with the note "Check out within 10 rounds to set a best". A single-dart bust uses up a whole round.
  - `DECISIONS.md` models about one casual 301 run in five failing to finish. Those runs leave no trace.
- **Benchmarks.**
  - Darts Club lists 301, 501, Half-It, Clock, Cricket and Count-Up. Darts Match lists Around the Clock and a practice mode ([Darts Club](https://apps.apple.com/us/app/darts-club/id1389760587), [Darts Match](https://apps.apple.com/app/id791552453)).
  - FRVR Paper Toss uses daily goals and a daily reward as its hook ([FRVR](https://frvr.com/play/papertoss/)).
  - Flick Golf rewards build-up through practice and bonus scoring ([Gamezebo review](https://www.gamezebo.com/reviews/flick-golf-review/)).

**Impact: medium to high.** Once the throw is learnable (Gap 1), this decides whether a player opens the app next week. Short drill games also double as practice for the throw.

**Effort: medium.**
- **Stats and recent-run history: small to medium.** Store a short ring buffer of finished runs in a new key.
- **A daily challenge: medium.** A date-seeded target set or drill, offline, with one attempt or a best-of-day.
- **One or two drill games: medium each.** For example Around the Clock, or a doubles drill. Each needs its own replay in `status()` and its own save key.

**Risk.**
- **Saves:** new keys only, following the "second key, not a new format" rule in `DECISIONS.md`.
- **Lobby:** a third game needs a lobby redesign. The two-way switch won't scale, and the 320×568 lobby already hides the tagline to fit.
- **Excluded items:** `DECISIONS.md` excludes 501, legs and sets, cosmetic unlocks and computer opponents. None of these suggestions needs them.

**Direction.** Each visit should have something new or measurable:
- lifetime stats and the last few runs per game;
- a daily target with one attempt;
- at least one short drill that rewards accuracy at specific beds, especially doubles, which is exactly what 301 asks for and the flick makes hard.

### Gap 5 · Screen-reader, switch and large-text users

**What's wrong, and who it affects.** Blind and low-vision players, and players with limited fine motor control. That's a small group, but for them the game is unplayable.

**Evidence.**
- **From the code and observed: VoiceOver probably can't trigger a throw.**
  - The throw control is a `<button>` with no click handler. Only pointer strokes and `keydown`/`keyup` throw (`src/input.js:164`, `:206`).
  - In Chromium, `click()` on `#throw` threw nothing.
  - VoiceOver's double-tap activates with a click or a stationary tap, and a stationary tap is refused as "Flick up to throw". So on an iPhone without a hardware keyboard, VoiceOver and Switch Control users can't throw. This is inferred; check it on a device.
  - `DECISIONS.md` calls the keyboard throw "the way to play for anyone who can't flick", but few iPhone players have a keyboard.
- **From the code: text ignores Dynamic Type.**
  - Every size is a fixed `px` value, including 9 px and 10 px scoreboard labels (`style.css:203`, `:559`).
  - In the installed app there's no Safari page-zoom control, so this is inferred: Larger Text does nothing.
- **Working:** live announcements, spoken checkout routes, 44 px controls, focus management and reduced motion are all good (see section 4).

**Impact: medium overall, high for those players.**

**Effort: medium.**
- Give the throw button an accessible aim and release that reuses the keyboard's sight. For example an adjustable control that VoiceOver users swipe to move the sight, then activate to throw.
- Scale type from a root that respects `-apple-system-body`.

**Risk.**
- **Layout:** type scaling touches nearly every layout rule. The safe-area audit at nine viewports in `DECISIONS.md` would have to be rerun. Cap the scale on the playfield and let it grow in sheets and cards.
- **Records:** an exact aim path sets records, as the keyboard already does. That's a decision already made and recorded.

**Direction.** Someone using VoiceOver or Switch Control on an iPhone can finish a match. Help, results and handoff text grow with the system text size, without breaking the playfield.

### Gap 6 · Duels feel anonymous and always start the same way (low to medium)

**Evidence.**
- **Anonymous:** "Player 1" and "Player 2" everywhere, with no names.
- **Same starter:** "Play again" calls `start(match.mode)` (`src/app.js:789`), so Player 1 always throws first. In 301, Player 1 also wins outright with no reply visit.
- **Already in `DECISIONS.md`:** "a per-match starter choice" and alternating legs are excluded.
- **What's new:** the Play again rematch makes repeat duels the normal case, so the same seat starts every time, not once. If you still want it excluded, keep it excluded. The cheapest fix is to alternate on Play again only.
- Observed in landscape: the scoreboard's 9 px labels are hard to read at arm's length when the phone is handed over.

**Effort: small.** Optional names when a duel starts, stored locally, plus alternating on rematch.

**Risk:** saves. Names would need a new key, or a field in a new key.

### Gap 7 · Updates interrupt play and don't say what changed (low to medium)

**Evidence.**
- **Observed:** an update found mid-match shows its toast at `top: var(--top) + 58px` (`style.css:1130`). That covers the scoreboard's dart slots and the 20, treble 20 and double 20 area, the most-aimed part of the board. It stays until tapped and has no dismiss.
- **The button is a small underlined link,** not a 44 px control. I didn't measure it, so check this in the layout audit.
- **No release note.** Players aren't told what an update does, even when it resets personal bests, as the flick release did ("Best · old throw").

**Effort: small.** Offer the update in the lobby, handoff or results only (the code already resumes mid-match safely), and show one line on what changed.

**Risk:** offline and update paths. Keep the existing `dartshift.resume` behaviour.

## 3. Quick wins

All small effort, low risk, no throw changes:

1. **Fix the stale-tab overwrite.** Refresh `saves` on the `storage` event, or re-read before each write (Gap 3). This is the only verified data-loss bug.
2. **Coach on-board misses too.** "A bit low · flick harder" when a clean dart lands well below its line, using the same rule `coach()` uses off the board, with a smaller radius. Choose the threshold so a near-bull dart says nothing.
3. **Show the last tip on the handoff card and after a bust,** so a third of throws aren't left uncoached.
4. **Restore "Faster flies higher"** on short-portrait and landscape layouts, even if shortened, or show it for the first match only.
5. **Move the update toast off the playfield,** or show it only between visits, and add one line on what changed.
6. **Request persistent storage** (`navigator.storage.persist()`) at the end of the first finished run. It can't hurt where it isn't granted.
7. **Show a one-time "Add to Home Screen" card** in an iPhone Safari tab (not standalone), with the two steps and the reason: it plays offline and keeps your records.
8. **Alternate the first player on Play again in duels,** if you're willing to revisit that exclusion.
9. **Raise the 9 px and 10 px scoreboard labels** to at least 11 px, and check the 320 px duel wrap already noted in `DECISIONS.md`.

## 4. Working well: protect these

- **One persistent room.** The camera moves give the lobby, play, handoff and results a sense of place no other screen-based darts game I looked at describes. Landings keep the board on screen and update in place.
- **Feedback moments.** The score callout at the impact point, lamp flares on 40+, caller lines ("Ton 40", "One hundred and eighty!"), the BUST callout and card with its reason ("Left on 1 · back to 26") and the neon relight read clearly. I saw all of them in play.
- **A touch off the dart costs nothing,** and the cue ("Touch the dart to pick it up", with a pulse) points the player at the dart. It worked at every size I tried.
- **Coaching, when it fires, is specific and actionable.** "Let go while still flicking" appeared exactly when I dragged and stopped.
- **Saving and resuming.** Back saves the visit, Resume labels show the round (and the remaining score in 301), reload offers Resume, and an update reloads straight into the visit. Offline cold reload worked here, with the lobby, Resume and a dart all from cache.
- **A save design that survives rollbacks.** Separate keys per game, the old throw's records kept untouched, and validation on load. Any new feature should follow the same rule: new keys, never a reshaped one.
- **The 301 checkout guide** in the empty slots, with routes spoken to VoiceOver ("Checkout: single 1, double 20").
- **Performance discipline.** No idle loop, the flight driven by the compositor, a static board layer and reduced motion removing every effect. New UI should keep to the "nothing animates at rest" rule.
- **Controls.** A consistent 44 px glass HUD, keyboard focus carried through handoffs and results, and a polite live region.
- **`DECISIONS.md` itself.** It made this review faster. Keep recording what wasn't verified.

## 5. Check on a real iPhone

Physical-device checks already listed in `DECISIONS.md` still stand. These are the ones that bear on the gaps above:

1. **Natural flick strength.** Have three people who've never played throw five darts at the bull with no instruction. Record where they land and whether each got any prompt. This is the single best test of Gap 1, and of whether the neutral speed suits real thumbs.
2. **VoiceOver.** With VoiceOver on, focus "Throw dart" and double-tap, then try a double-tap-and-hold and swipe. Does anything throw? Also check Switch Control.
3. **Larger Text.** Set the largest Dynamic Type in Settings, then check the installed app's lobby, help and results. Fixed pixel sizes suggest nothing changes.
4. **Separate stores.** Set a best in a Safari tab, then install and open the app. Confirm the app starts with "—". Then check whether a link tapped in Messages opens Safari or the installed app on iOS 26 or 27.
5. **`navigator.storage.persist()`.** In the installed app and in a Safari tab, check what it returns and whether `navigator.storage.persisted()` stays true across launches.
6. **The update toast on a notched phone.** Check where it sits relative to the scoreboard and the 20 segment, and whether "Update game" is easy to hit.
7. **Two Safari tabs.** Open the game twice, play in one and toggle sound in the other. Confirm the overwrite happens in real WebKit, as it does in Chromium.
8. **Interruptions mid-flick.** A call, Control Centre or the app switcher during a stroke and during a flight: confirm no dart is lost or double-counted.
9. **SE-class performance** during the landing frame. `DECISIONS.md` reports 29–35 ms in desktop WebKit, so anything added in Gaps 1 and 4 shouldn't add to that frame.
10. **Sound with the silent switch,** and with Bluetooth audio, since feedback relies on sound plus the callout.

## 6. Briefs for the top three gaps

### Brief A · Make the flick learnable: show its strength, coach every miss, add practice

**Problem and evidence.**
- Release speed sets the height, but players never see how fast they flicked.
- `coach()` (`src/app.js:623`) only speaks after a stroke fault of 6 mm or more, or a dart off the board. A clean dart that lands low on the board gets "Flick the dart up" again. In testing, five clean darts in a row landed on single 3 with no tip.
- Tips are dropped after the last dart of each visit and after 301 busts (`src/app.js:694`).
- "Faster flies higher · keep it straight" is hidden on SE-class phones and in landscape (`style.css:1231`, `:1298`).
- There's no practice: "Solo run" starts a scored match, so a player's learning darts set their first personal best.
- `DECISIONS.md` records three changes to the neutral speed in two days and calls its evidence thin. Players' natural flicks differ, so the game has to show them where theirs sits.

**Goal.** Within a few throws, a first-time player understands that harder means higher, and knows after any throw whether to flick harder or softer.

**Constraints.**
- Don't change the release model: `releaseThrow`, `readStroke`, `tune` and `swipeLanding` stay as they are. Read their outputs only. The throw may be under a separate audit.
- Static site, offline, no CDN assets, iOS 16.4+.
- Practice never writes `dartshift.save.v1`, `dartshift.301.v1` or `dartshift.flick.v1`, and sets no records.
- Keep the performance rules in `DECISIONS.md`: no idle loop, and no extra work on the contact frame. Anything new joins the next-frame `morph`.
- Reduced motion and VoiceOver get equivalents: announce the strength in words.

**Left to you.**
- How strength is shown: a gauge, a mark beside the dart's path, or a word.
- Its scale against `tune.input.cruise`.
- The on-board coaching threshold, and the wording.
- Whether practice is a third lobby button, a mode inside each game, or a first-launch warm-up that's skippable and reachable later.
- Whether practice shows a grouping of recent darts.

**Done when:**
- After every touch throw, including the third dart of a visit and a bust, the player sees and hears how hard it was compared with a bull flick, plus a direction tip whenever a clean dart lands noticeably high or low.
- A near-bull dart produces no nagging.
- A first launch offers a short, unscored warm-up, and practice is reachable from the lobby afterwards.
- The hint line, or an equivalent, is visible at 320×568, 393×852 and 852×393.
- `npm test` passes, and new tests cover the coaching rule (thresholds both sides) and that practice leaves all three save keys byte-for-byte unchanged.
- Full touch and keyboard matches pass in `scripts/check/match.cjs` at 320×568, 393×852 and 852×393, with and without reduced motion.
- The landing frame budget is re-measured as in "Grab and flight", with no regression.

**Deliverables:** the code, the tests, and a `DECISIONS.md` section covering what was chosen and rejected, the measurements, and what to check on a phone.

### Brief B · Challenge a friend by link, no server

**Problem and evidence.**
- GamePigeon's core is asynchronous play with a friend through a chat. Dartshift only offers pass-the-phone, and its results card has no way to invite anyone.
- A match is fully replayable from its `hits` (`status()` in `src/game.js`), so its state fits in a link.
- Constraints of the platform:
  - Links tapped in Messages open in Safari, not the installed app ([report](https://community.glideapps.com/t/open-url-from-other-app-in-pwa/59048)).
  - Safari and the installed app don't share storage ([WebKit 181849](https://bugs.webkit.org/show_bug.cgi?id=181849)).

**Goal.** After a solo Nine Dart Rush run, a player can send a challenge to anyone. The recipient plays the same game against those visit totals and can send the result back.

**Constraints.**
- No backend or relay: GitHub Pages only, and the link carries all state.
- Use the Web Share API, with a copy-link fallback.
- It must work in a Safari tab, where most recipients land. The installed app needs a way to take a challenge in, for example pasting a link or code.
- Challenge matches never touch the three existing save keys or set personal records. Any new storage uses a new key.
- Fix Gap 3's stale-tab overwrite first or as part of this work. Challenge links open new tabs.
- Offline: creating a challenge, and playing a received one once the page is cached, both work without a network.
- Keep payloads short enough for a message bubble, and validate everything decoded from a link with the same rules as `decodeMatch`.

**Left to you.**
- The encoding: hash or query, compression, versioning.
- Whether the recipient sees the challenger's darts visit by visit as they play, or only the totals.
- Whether a reply can be challenged back again, as a rally.
- Copy and presentation.
- Whether 301 is included now. It's recommended to leave it out of the first version.

**Done when:**
- From the results of a solo Nine Dart Rush run, "Challenge a friend" opens the iOS share sheet with a link.
- Opening that link in a fresh profile (no saves, Safari tab) shows who's challenging and the target, plays nine darts and shows a clear win, loss or draw, with both players' visits.
- The recipient can send the result back, and opening the reply shows the comparison to the original player.
- A malformed or edited link is rejected with a friendly message.
- All three existing save keys are unchanged throughout, which is tested.
- It works under `/Darts/` with the service worker on, online and offline.
- Real-phone checks are listed: Messages → Safari, and the installed app's paste path.

**Deliverables:** the code, the tests (encoding round-trip, validation, keys untouched), a browser check script under `scripts/check/`, and a `DECISIONS.md` section that includes the integrity caveat (links can be edited).

### Brief C · Keep records safe, and get players into the installed app

**Problem and evidence.**
- **Reproduced in Chromium: a stale tab wipes newer progress.**
  - With two tabs open, a newer tab played a 301 solo to three darts and set a Nine Dart Rush record of 27.
  - Tapping sound in the older tab set the 301 match and `dartshift.flick.v1.rush` to `null`.
  - Cause: `saves` is read once at load (`src/app.js:36`) and `save()` writes all keys from that copy (`src/app.js:56–65`).
- **Separate stores and the seven-day cap.** Safari and the installed app keep separate records. A Safari tab is subject to WebKit's seven-day storage cap, while a Home Screen app is not.
- **No in-game guidance.** The game never tells a Safari visitor to install it, never warns that records won't carry over, and never asks for persistent storage. There's no backup.

**Goal.** No action in any tab can replace newer saved progress with older. iPhone Safari visitors are guided once to install. Records can move from Safari to the app, or to another phone.

**Constraints.**
- **Save format.**
  - Keep every existing save key's shape and meaning.
  - Older cached copies must still read and write `save.v1` correctly and never touch the other keys, as in "301 · Storage" in `DECISIONS.md`.
  - Rerun the three-build update and rollback check from "301 verification".
- **Install card.**
  - It appears only in an iPhone Safari tab: not standalone, not iPad, not other browsers.
  - It's dismissible, shown at most once per dismissal, and never covers the playfield during a match.
  - Don't touch `src/viewport.js` behaviour in the installed app.
- **Transfer without a server.** A code or link the player copies, validated on import with existing rules. Import must never lower an existing record without an explicit confirmation.
- **Persistent storage.** Call `navigator.storage.persist()` where available, and tolerate `false` or a missing API.

**Left to you.**
- **The merge rule.** Field-level newest-wins, best-of for records, or refusing and reloading a stale tab.
- **Card copy and timing.** For example, after the first finished run rather than on first load.
- **Transfer format.** It may share Brief B's encoding if built together.
- **Duplicates.** Whether to show where records live ("Saved on this device · Safari").

**Done when:**
- An automated two-page test shows the sound toggle, a throw, Back and Update game in a stale tab never lowering or erasing a newer match or record in either game.
- The install card appears in an emulated iPhone Safari tab, not in standalone mode or on desktop, and stays dismissed.
- Exporting records from one profile and importing them into a fresh one reproduces both records. An import with lower values asks before replacing.
- `persist()` is requested once at the chosen moment.
- `npm test` passes, with tests for the merge and import validation.
- The rollback sequence from "301 verification" passes.
- `DECISIONS.md` records the merge rule, what was rejected, and the real-iPhone checks (the separate store, `persist()`'s result, the seven-day behaviour).

**Deliverables:** the code, the tests, the two-tab check script, and the `DECISIONS.md` section.

## Considered and not recommended

- **Real-time online play.** It needs a server or a paid relay, which breaks the no-backend constraint. Challenge links (Gap 2) cover the main use without one.
- **Haptics.** `DECISIONS.md` excludes haptic workarounds, and I found no new evidence that changes that. The visual and sound feedback held up in play.
- **Computer opponents, 501, legs and sets, and cosmetic unlocks** stay out, per `DECISIONS.md`. Gaps 2 and 4 give replay value without them.
- **Further tuning of the release** is out of scope here. Gap 1 is about showing the player what the release measured, not changing it.

## Sources

Competitor and platform research. I couldn't open any of these pages from the review environment, so the summaries come from search results.

- GamePigeon Darts: [appdrum guide](https://appdrum.com/how-to-play-darts-in-gamepigeon-905/), [dartboardhub tips](https://dartboardhub.com/how-to-win-in-darts-game-pigeon/), [screenwise guide to iMessage games](https://screenwiseapp.com/guides/how-to-play-imessage-games), [Wikipedia](https://en.wikipedia.org/wiki/GamePigeon)
- Darts of Fury: [Gamezebo walkthrough](https://www.gamezebo.com/walkthroughs/darts-of-fury-tips-cheats-and-strategies/), [App Store listing](https://apps.apple.com/app/id1098189391)
- Darts Club and Darts Match: [Darts Club listing](https://apps.apple.com/us/app/darts-club/id1389760587), [Darts Match listing](https://apps.apple.com/app/id791552453)
- Flick games: [FRVR Paper Toss](https://frvr.com/play/papertoss/), [Flick Golf review, Gamezebo](https://www.gamezebo.com/reviews/flick-golf-review/)
- iOS web app storage and links: [WebKit 181849](https://bugs.webkit.org/show_bug.cgi?id=181849), [WebKit storage policy](https://webkit.org/?p=14403), [WebKit 271401](https://bugs.webkit.org/show_bug.cgi?id=271401), [Apple developer forums on the seven-day cap](https://developer.apple.com/forums/thread/710157), [iTnews on the seven-day cap](https://www.itnews.com.au/news/apple-cops-flak-for-deleting-local-browser-storage-after-7-days-539833), [links opening in Safari](https://community.glideapps.com/t/open-url-from-other-app-in-pwa/59048)
