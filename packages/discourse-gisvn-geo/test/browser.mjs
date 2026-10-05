import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`)
  : await import("playwright");
const root = resolve(".");
const ranges = [];
const server = createServer(async (req, res) => {
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><link rel="stylesheet" href="/public/maplibre-gl.css"><div id="map" style="width:900px;height:500px"></div><script src="/public/gisvn-geo-runtime.js"></script>',
    );
    return;
  }
  try {
    const pathname = new URL(req.url, "http://local").pathname;
    const path = resolve(root, `.${pathname}`);
    if (!path.startsWith(`${root}/`)) {
      throw new Error("bad path");
    }
    const bytes = await readFile(path);
    res.setHeader(
      "Content-Type",
      {
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
      }[extname(path)] || "application/octet-stream",
    );
    if (req.headers.range) {
      ranges.push(req.headers.range);
      const [, start, requestedEnd] =
        req.headers.range.match(/bytes=(\d+)-(\d+)/);
      const end = Math.min(Number(requestedEnd), bytes.length - 1);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        ETag: '"fixture-1"',
      });
      res.end(bytes.subarray(Number(start), end + 1));
    } else {
      res.end(bytes);
    }
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.GISVN_CHROMIUM_PATH,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const [file, type] of [
    ["vinh-long.geojson", "geojson"],
    ["vinh-long.kml", "kml"],
    ["vinh-long.kmz", "kmz"],
    ["route.gpx", "gpx"],
    ["demo.style.json", "style.json"],
    ["sample.pmtiles", "pmtiles"],
    ["pmtiles.style.json", "style.json"],
  ]) {
    const result = await page.evaluate(
      async ({ file, type }) => {
        const states = [];
        const viewer = window.GISVNGeo.createViewer(
          document.querySelector("#map"),
          {
            url: new URL(`/examples/${file}`, location.href).href,
            type,
            onStatus: (...args) => states.push(args),
          },
        );
        try {
          await viewer.ready;
          const canvas = document.querySelector("canvas");
          const ready = Boolean(canvas?.width);
          const fullscreen = Boolean(
            document.querySelector(".maplibregl-ctrl-fullscreen"),
          );
          return { ready, fullscreen, states };
        } finally {
          viewer.destroy();
        }
      },
      { file, type },
    );
    assert.equal(result.ready, true, file);
    assert.equal(result.fullscreen, true, file);
    assert.equal(
      result.states.some(([state]) => state === "error"),
      false,
      JSON.stringify(result),
    );
    assert.equal(
      await page.locator("canvas").count(),
      0,
      "WebGL canvas cleaned up",
    );
    console.log(`PASS WebGL ${file}, controls and cleanup`);
  }
  assert.ok(ranges.length > 0, "PMTiles used HTTP Range");
  await page.evaluate(async () => {
    window.testViewer = window.GISVNGeo.createViewer(
      document.querySelector("#map"),
      {
        url: new URL("/examples/vinh-long.geojson", location.href).href,
        type: "geojson",
        onCoordinates: (value) => {
          window.testCoordinates = value;
        },
      },
    );
    await window.testViewer.ready;
  });
  await page.locator("canvas").click({ position: { x: 450, y: 250 } });
  await page.waitForSelector(".gisvn-geo__properties");
  assert.ok(
    (await page.locator(".gisvn-geo__properties").textContent()).includes(
      "Vĩnh Long",
    ),
  );
  assert.equal(await page.locator(".maplibregl-popup-content img").count(), 0);
  assert.ok(
    await page.evaluate(() => window.testCoordinates.includes("105.970")),
  );
  await page.locator(".maplibregl-ctrl-fullscreen").click();
  assert.equal(
    await page.evaluate(() => Boolean(document.fullscreenElement)),
    true,
  );
  await page.evaluate(async () => {
    await document.exitFullscreen();
    window.testViewer.destroy();
  });
  console.log("PASS feature popup, safe text, coordinates and fullscreen");
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${ranges.length} Range requests; no uncaught browser errors`,
  );
} finally {
  await browser.close();
  server.close();
}
