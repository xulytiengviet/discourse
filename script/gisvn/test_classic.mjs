import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`)
  : require(resolve("packages/discourse-gisvn-geo/node_modules/playwright"));
const root = resolve("docs/gisvn/classic");
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://local").pathname;
  const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  try {
    if (!file.startsWith(`${root}/`)) throw new Error("Invalid path");
    const bytes = await readFile(file);
    response.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".gif": "image/gif" })[extname(file)] || "application/octet-stream");
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true, executablePath: process.env.GISVN_CHROMIUM_PATH, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1264, height: 850 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(await page.locator(".category").count(), 19);
  assert.equal(await page.locator(".forum-row").count(), 50);
  assert.equal(await page.locator(".subforums a").count(), 2);
  assert.equal(await page.locator("#member-list li").count(), 15);
  assert.equal(await page.locator("#topic-list li").count(), 15);
  assert.ok((await page.locator("#stats").textContent()).includes("4,239"));
  assert.equal(await page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)), true);
  if (process.env.GISVN_SCREENSHOT) await page.screenshot({ path: process.env.GISVN_SCREENSHOT });
  await page.locator(".forum-title").first().click();
  assert.equal(await page.locator("dialog").isVisible(), true);
  assert.ok((await page.locator("#dialog-body").textContent()).includes("Nguồn chưa chứa nội dung đầy đủ"));
  await page.locator("#dialog-close").click();
  await page.selectOption("#snapshot", "gisforum");
  assert.equal(await page.locator(".forum-row").count(), 49);
  assert.ok((await page.locator("#stats").textContent()).includes("4,297"));
  await page.fill("#search", "WebGIS");
  assert.equal(await page.locator(".forum-row").count(), 2);
  await page.fill("#search", "no-matching-forum-xyz");
  assert.equal(await page.locator(".forum-row").count(), 0);
  await page.fill("#search", "");
  await page.locator(".category button").first().click();
  assert.equal(await page.locator(".category button").first().getAttribute("aria-expanded"), "false");
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: 19 groups; 49 reference forums; 50 original rows + 2 subforums; distinct snapshot counts; images; dialog; search; collapse; responsive 390/768/1280; no JS errors.");
} finally {
  await browser.close();
  server.close();
}
