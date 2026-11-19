import { mkdir, cp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

const root = new URL("../", import.meta.url),
  out = new URL("dist/", root);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const item of [
  "assets",
  "src",
  "index.html",
  "style.css",
  "manifest.webmanifest",
]) {
  await cp(new URL(item, root), new URL(item, out), { recursive: true });
}
const assets = (await readdir(out, { recursive: true, withFileTypes: true }))
  .filter((e) => e.isFile())
  .map((entry) => {
    const path = relative(
      fileURLToPath(out),
      join(entry.parentPath, entry.name),
    );
    return "./" + path.split(sep).join("/");
  })
  .sort();
const template = await readFile(
  new URL("worker.template.js", import.meta.url),
  "utf8",
);
const hash = createHash("sha256").update(template);
for (const asset of assets)
  hash.update(asset).update(await readFile(new URL(asset, out)));
const version = hash.digest("hex").slice(0, 16);
await writeFile(
  new URL("sw.js", out),
  template
    .replace("__VERSION__", version)
    .replace("__ASSETS__", JSON.stringify(assets)),
);
console.log("Built " + assets.length + " local assets · " + version);
