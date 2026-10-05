import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

await mkdir("public", { recursive: true });
await build({
  entryPoints: ["src/runtime.js"],
  bundle: true,
  format: "iife",
  globalName: "GISVNGeo",
  target: "es2022",
  minify: true,
  legalComments: "linked",
  outfile: "public/gisvn-geo-runtime.js",
});
await copyFile(
  "node_modules/maplibre-gl/dist/maplibre-gl.css",
  "public/maplibre-gl.css",
);
await build({
  entryPoints: ["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "linked",
  outfile: "public/maplibre-worker.js",
});
const hashes = {};
for (const file of [
  "gisvn-geo-runtime.js",
  "maplibre-gl.css",
  "maplibre-worker.js",
]) {
  hashes[file] = createHash("sha256")
    .update(await readFile(`public/${file}`))
    .digest("hex");
}
await writeFile(
  "public/checksums.json",
  JSON.stringify(hashes, null, 2) + "\n",
);
