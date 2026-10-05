import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { zipSync, strToU8 } from "fflate";
import {
  checkedURL,
  fetchBytes,
  fileType,
  kmzDocument,
  normalizeGeoJSON,
  parseData,
  popupContent,
  prepareStyle,
} from "../src/data.js";

const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
const point = { type: "Point", coordinates: [105.97, 10.25] };
const kml =
  '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Vĩnh Long</name><ExtendedData><Data name="population"><value>123</value></Data></ExtendedData><Point><coordinates>105.97,10.25,5</coordinates></Point></Placemark></Document></kml>';

test("detects all formats, signed URLs and Discourse hashed upload names", () => {
  for (const type of [
    "geojson",
    "kml",
    "kmz",
    "gpx",
    "pmtiles",
    "style.json",
  ]) {
    assert.equal(fileType(`https://files.test/map.${type}?token=abc`), type);
  }
  assert.equal(
    fileType("/uploads/hash.json", "province.style.json"),
    "style.json",
  );
  assert.equal(fileType("/uploads/hash.json"), null);
});

test("exact origin allowlist rejects credentials, mixed content and executable URLs", () => {
  const base = "https://forum.test/t/1";
  assert.equal(
    checkedURL("/uploads/a.kml", base),
    "https://forum.test/uploads/a.kml",
  );
  assert.equal(
    checkedURL("https://files.test/a.kml", base, ["https://files.test"]),
    "https://files.test/a.kml",
  );
  for (const url of [
    "javascript:alert(1)",
    "https://files.test.evil/a",
    "http://forum.test/a",
    "https://user:secret@forum.test/a",
  ]) {
    assert.throws(() => checkedURL(url, base, ["https://files.test"]));
  }
});

test("supports GeometryCollection and rejects projected coordinates and malformed GeoJSON", () => {
  assert.deepEqual(
    normalizeGeoJSON({ type: "GeometryCollection", geometries: [point] })
      .bounds,
    [
      [105.97, 10.25],
      [105.97, 10.25],
    ],
  );
  for (const input of [
    {},
    { type: "FeatureCollection", features: {} },
    { type: "Point", coordinates: [600000, 1200000] },
    { type: "Unknown", coordinates: [0, 0] },
  ]) {
    assert.throws(() => normalizeGeoJSON(input));
  }
});

test("KML preserves Vietnamese names and ExtendedData", () => {
  const result = parseData(strToU8(kml), "kml");
  assert.equal(result.data.features[0].properties.name, "Vĩnh Long");
  assert.equal(result.data.features[0].properties.population, "123");
});

test("KML preserves polygon holes and MultiGeometry", () => {
  const xml =
    "<kml><Placemark><MultiGeometry><Point><coordinates>1,2</coordinates></Point><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 3,0 3,3 0,0</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>1,1 2,1 2,2 1,1</coordinates></LinearRing></innerBoundaryIs></Polygon></MultiGeometry></Placemark></kml>";
  const geometry = parseData(strToU8(xml), "kml").data.features[0].geometry;
  assert.equal(geometry.type, "GeometryCollection");
  assert.equal(geometry.geometries[1].coordinates.length, 2);
});

test("KMZ chooses doc.kml, enforces expanded-size limit, ignores other files", () => {
  const bytes = zipSync({
    "other.kml": strToU8("bad"),
    "doc.kml": strToU8(kml),
    "image.jpg": new Uint8Array(100000),
  });
  assert.equal(
    parseData(bytes, "kmz").data.features[0].properties.name,
    "Vĩnh Long",
  );
  assert.throws(() => kmzDocument(bytes, 20), /too_large/);
  assert.throws(
    () => kmzDocument(zipSync({ "image.jpg": strToU8("x") })),
    /kmz_missing_kml/,
  );
  assert.throws(() => kmzDocument(strToU8("not zip")));
});

test("GPX reads waypoint, route and track segments", () => {
  const xml =
    '<gpx version="1.1"><wpt lat="10" lon="106"><name>A</name></wpt><rte><rtept lat="10" lon="106"/><rtept lat="11" lon="107"/></rte><trk><trkseg><trkpt lat="10" lon="106"/><trkpt lat="11" lon="107"/></trkseg><trkseg><trkpt lat="12" lon="108"/><trkpt lat="13" lon="109"/></trkseg></trk></gpx>';
  const result = parseData(strToU8(xml), "gpx");
  assert.equal(result.data.features.length, 3);
  assert.ok(
    result.data.features.some((f) => f.geometry.type === "MultiLineString"),
  );
});

test("rejects XML entities, invalid XML and unsupported empty overlays", () => {
  for (const xml of [
    '<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml/>',
    "<kml><broken>",
    "<kml><GroundOverlay/></kml>",
  ]) {
    assert.throws(() => parseData(strToU8(xml), "kml"));
  }
});

test("popup renders hostile attributes as plain text", () => {
  const popup = popupContent(
    {
      "<img src=x onerror=alert(1)>": "<script>alert(2)</script>",
      name: "Vĩnh Long",
    },
    dom.window.document,
  );
  assert.equal(popup.querySelectorAll("img,script").length, 0);
  assert.ok(popup.textContent.includes("<script>"));
});

test("style resolves relative PMTiles and glyph templates without changing source-layer", () => {
  const base = "https://files.test/styles/map.style.json";
  const validate = (url) =>
    checkedURL(url, "https://forum.test", ["https://files.test"]);
  const style = prepareStyle(
    {
      version: 8,
      sources: { vn: { type: "vector", url: "pmtiles://../vn.pmtiles" } },
      glyphs: "./fonts/{fontstack}/{range}.pbf",
      layers: [
        {
          id: "districts",
          type: "fill",
          source: "vn",
          "source-layer": "districts",
        },
      ],
    },
    base,
    validate,
  );
  assert.equal(style.sources.vn.url, "pmtiles://https://files.test/vn.pmtiles");
  assert.ok(style.glyphs.endsWith("/{fontstack}/{range}.pbf"));
  assert.equal(style.layers[0]["source-layer"], "districts");
  assert.throws(() =>
    prepareStyle(
      {
        version: 8,
        sources: { x: { type: "vector", url: "https://evil.test/a.json" } },
        layers: [],
      },
      base,
      validate,
    ),
  );
  assert.throws(() =>
    prepareStyle(
      {
        version: 8,
        sources: { x: { type: "geojson", data: "huge.geojson" } },
        layers: [],
      },
      base,
      validate,
    ),
  );
});

test("streamed downloads enforce actual byte limit even without Content-Length", async () => {
  const original = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        pull(c) {
          c.enqueue(new Uint8Array(10));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  try {
    await assert.rejects(
      fetchBytes("https://files.test/a", { maxBytes: 15 }),
      /too_large/,
    );
    assert.equal(cancelled, true);
  } finally {
    globalThis.fetch = original;
  }
});
