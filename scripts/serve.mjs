import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist", import.meta.url));
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".webmanifest": "application/manifest+json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (path === "/" || path === "/Darts") {
      res.writeHead(302, { Location: "/Darts/" });
      res.end();
      return;
    }
    if (!path.startsWith("/Darts/")) throw Error();
    path = resolve(root, path.slice(7) || "index.html");
    if (!path.startsWith(root + sep)) throw Error();
    const body = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log("Dartshift is running at http://localhost:" + port + "/Darts/"),
);
