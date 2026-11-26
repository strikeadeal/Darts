import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// src/light.js reads its tunables from style.css at bake time. A name it reads
// that the stylesheet doesn't define would reach the shader as NaN and spoil the
// whole room without an error, so every one must be set once in :root, as a
// number or a #rrggbb colour.
test("every light and material setting the bake reads is defined", () => {
  const light = readFileSync(new URL("../src/light.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  const reads = [...light.matchAll(/(num|hex|tint)\("(--[\w-]+)"\)/g)];
  assert.ok(reads.length >= 20, "found the settings");
  for (const [, kind, name] of reads) {
    const set = [...css.matchAll(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "gm"))].map((m) => m[1].trim());
    assert.ok(set.length >= 1, `${name} is set in style.css`);
    for (const value of set)
      assert.match(value, kind === "num" ? /^-?\d*\.?\d+$/ : /^#[0-9a-f]{6}$/i, `${name}: ${value}`);
  }
});

// The baked face is drawn in the SVG face's projection; if the throw's camera
// constants were inlined in the shader instead of passed in, a retune would split
// the picture from the scoring.
test("the bake takes the board's projection from the throw's tune", () => {
  const light = readFileSync(new URL("../src/light.js", import.meta.url), "utf8");
  assert.match(light, /uSkew: tune\.camera\.skew/);
  assert.match(light, /uFh: tune\.camera\.faceHeight/);
  assert.match(light, /k \* tune\.camera\.skew, k \* tune\.camera\.faceHeight/);
});
