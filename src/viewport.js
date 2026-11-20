// The height the room is laid out in, when CSS can't be trusted to know it.
//
// iOS 26 and later lay an installed web app (viewport-fit=cover, black-translucent
// status bar) out in a viewport shorter than the screen by about the status bar,
// while still drawing it from the top of the screen: 100%, 100vh, 100dvh, innerHeight
// and position:fixed all stop short, and a dead band fills the bottom (see
// DECISIONS.md, "Full screen in the installed app"). An installed iPhone app always
// fills the screen, so when the window spans the screen's width its height is the
// screen's other side. iOS keeps screen.* in portrait order in every orientation.
//
// Returns CSS px, or null to keep the stylesheet's own height (Safari tabs, iPad
// windows, other browsers).
// ponytail: trusts the screen only for iOS home-screen apps (navigator.standalone);
// Android and desktop installs keep 100dvh, which is right there.
export function fullHeight({ standalone, innerWidth, screenWidth, screenHeight }) {
  if (standalone !== true || !(screenWidth > 0 && screenHeight > 0)) return null;
  const short = Math.min(screenWidth, screenHeight),
    long = Math.max(screenWidth, screenHeight);
  if (Math.abs(innerWidth - short) <= 1) return long; // portrait
  if (Math.abs(innerWidth - long) <= 1) return short; // landscape
  return null;
}

// Set --vh from the screen and mark the root (data-screen), which style.css uses
// to grow the document to the screen: a fixed room alone was cut off where the
// short viewport ended (DECISIONS.md). Returns true when it changed, so callers
// can re-measure anything laid out from it.
export function fitScreen() {
  const root = document.documentElement;
  const h = fullHeight({
    // The WebKit flag, or the display mode where that WebKit flag exists (iOS only).
    standalone:
      navigator.standalone === true ||
      ("standalone" in navigator &&
        matchMedia("(display-mode: standalone)").matches),
    innerWidth,
    screenWidth: screen.width,
    screenHeight: screen.height,
  });
  const value = h ? h + "px" : "";
  if (root.style.getPropertyValue("--vh") === value) return false;
  if (value) root.style.setProperty("--vh", value);
  else root.style.removeProperty("--vh");
  root.toggleAttribute("data-screen", !!value);
  return true;
}
