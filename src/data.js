import { kml, gpx } from "@tmcw/togeojson";
import { unzipSync } from "fflate";

export const MAX_BYTES = 12 * 1024 * 1024;
const GEOMETRIES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

export function fileType(href, filename = "") {
  const path = new URL(href, "https://forum.invalid").pathname;
  const match = `${path}\n${filename}`.match(
    /\.(geojson|kml|kmz|gpx|pmtiles|style\.json)(?:$|\n)/i,
  );
  return match?.[1].toLowerCase() || null;
}

export function checkedURL(value, base, allowedOrigins = []) {
  const url = new URL(value, base);
  const baseOrigin = new URL(base).origin;
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("unsafe_url");
  }
  if (url.protocol === "http:" && new URL(base).protocol === "https:") {
    throw new Error("unsafe_url");
  }
  if (url.origin !== baseOrigin && !allowedOrigins.includes(url.origin)) {
    throw new Error("origin_not_allowed");
  }
  return url.href;
}

export async function fetchBytes(
  url,
  { signal, maxBytes = MAX_BYTES, validateURL = (v) => v } = {},
) {
  validateURL(url);
  const response = await fetch(url, {
    signal,
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("too_large");
  }
  if (!response.body) {
    throw new Error("empty_data");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      length += value.byteLength;
      if (length > maxBytes) {
        throw new Error("too_large");
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export function normalizeGeoJSON(input) {
  const data =
    input?.type === "FeatureCollection"
      ? input
      : {
          type: "FeatureCollection",
          features: [
            input?.type === "Feature"
              ? input
              : { type: "Feature", properties: {}, geometry: input },
          ],
        };
  if (
    data.crs ||
    !Array.isArray(data.features) ||
    data.features.length > 50000
  ) {
    throw new Error("invalid_geojson");
  }
  let count = 0;
  let bounds = [Infinity, Infinity, -Infinity, -Infinity];
  function coordinates(value, depth = 0) {
    if (!Array.isArray(value) || depth > 5 || !value.length) {
      throw new Error("invalid_geojson");
    }
    if (typeof value[0] === "number") {
      const [lon, lat] = value;
      if (
        !Number.isFinite(lon) ||
        !Number.isFinite(lat) ||
        Math.abs(lon) > 180 ||
        Math.abs(lat) > 90
      ) {
        throw new Error("invalid_coordinates");
      }
      if (++count > 250000) {
        throw new Error("too_many_coordinates");
      }
      bounds = [
        Math.min(bounds[0], lon),
        Math.min(bounds[1], lat),
        Math.max(bounds[2], lon),
        Math.max(bounds[3], lat),
      ];
    } else {
      value.forEach((child) => coordinates(child, depth + 1));
    }
  }
  function geometry(value, depth = 0) {
    if (value === null) {
      return;
    }
    if (depth > 10 || !GEOMETRIES.has(value?.type)) {
      throw new Error("invalid_geojson");
    }
    if (value.type === "GeometryCollection") {
      if (!Array.isArray(value.geometries)) {
        throw new Error("invalid_geojson");
      }
      value.geometries.forEach((child) => geometry(child, depth + 1));
    } else {
      coordinates(value.coordinates);
      const point = (v) =>
        Array.isArray(v) && v.length >= 2 && v.every(Number.isFinite);
      const line = (v) => Array.isArray(v) && v.length >= 2 && v.every(point);
      const ring = (v) =>
        line(v) &&
        v.length >= 4 &&
        v[0][0] === v.at(-1)[0] &&
        v[0][1] === v.at(-1)[1];
      const polygon = (v) => Array.isArray(v) && v.length > 0 && v.every(ring);
      const validators = {
        Point: point,
        MultiPoint: (v) => v.every(point),
        LineString: line,
        MultiLineString: (v) => v.every(line),
        Polygon: polygon,
        MultiPolygon: (v) => v.every(polygon),
      };
      if (!validators[value.type](value.coordinates)) {
        throw new Error("invalid_geojson");
      }
    }
  }
  for (const feature of data.features) {
    if (feature?.type !== "Feature" || feature.crs || feature.geometry?.crs) {
      throw new Error("invalid_geojson");
    }
    geometry(feature.geometry);
  }
  if (!count) {
    throw new Error("empty_data");
  }
  return {
    data,
    bounds: [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
  };
}

export function kmzDocument(bytes, maxBytes = MAX_BYTES) {
  const candidates = [];
  let entries = 0;
  unzipSync(bytes, {
    filter(entry) {
      if (++entries > 1024) {
        throw new Error("too_many_zip_entries");
      }
      if (/\.kml$/i.test(entry.name)) {
        if (entry.originalSize > maxBytes) {
          throw new Error("too_large");
        }
        candidates.push(entry.name);
      }
      return false;
    },
  });
  const name =
    candidates.find((v) => v.toLowerCase() === "doc.kml") ||
    candidates.sort()[0];
  if (!name) {
    throw new Error("kmz_missing_kml");
  }
  const files = unzipSync(bytes, {
    filter: (entry) => entry.name === name && entry.originalSize <= maxBytes,
  });
  if (!files[name] || files[name].length > maxBytes) {
    throw new Error("too_large");
  }
  return files[name];
}

export function parseData(bytes, type, maxBytes = MAX_BYTES) {
  if (bytes.byteLength > maxBytes) {
    throw new Error("too_large");
  }
  const text = new TextDecoder().decode(
    type === "kmz" ? kmzDocument(bytes, maxBytes) : bytes,
  );
  if (type === "geojson") {
    return normalizeGeoJSON(JSON.parse(text));
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new Error("invalid_xml");
  }
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (
    xml.getElementsByTagName("parsererror").length ||
    !["kml", "gpx"].includes(xml.documentElement.localName)
  ) {
    throw new Error("invalid_xml");
  }
  if ((type === "gpx") !== (xml.documentElement.localName === "gpx")) {
    throw new Error("invalid_xml");
  }
  return normalizeGeoJSON(type === "gpx" ? gpx(xml) : kml(xml));
}

export function prepareStyle(input, base, validateURL) {
  const style = structuredClone(input);
  if (
    style.version !== 8 ||
    !style.sources ||
    !Array.isArray(style.layers) ||
    style.layers.length > 500 ||
    style.imports
  ) {
    throw new Error("invalid_style");
  }
  const absolute = (value) => {
    if (typeof value !== "string") {
      throw new Error("invalid_style");
    }
    const pm = value.startsWith("pmtiles://");
    const url = new URL(pm ? value.slice(10) : value, base).href
      .replace(/%7B/gi, "{")
      .replace(/%7D/gi, "}");
    validateURL(url);
    return `${pm ? "pmtiles://" : ""}${url}`;
  };
  for (const source of Object.values(style.sources)) {
    if (!["vector", "raster", "geojson", "raster-dem"].includes(source.type)) {
      throw new Error("invalid_style");
    }
    if (source.url) {
      if (!source.url.startsWith("pmtiles://")) {
        throw new Error("style_requires_pmtiles_url");
      }
      source.url = absolute(source.url);
    }
    if (source.attribution) {
      source.attribution = String(source.attribution).replace(
        /[&<>"']/g,
        (character) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[character],
      );
    }
    if (source.tiles) {
      source.tiles = source.tiles.map(absolute);
    }
    if (source.type === "geojson") {
      // Keep unbounded remote GeoJSON out of the MapLibre worker fetch path.
      if (typeof source.data === "string") {
        throw new Error("remote_geojson_style");
      }
      source.data = normalizeGeoJSON(source.data).data;
    }
  }
  if (style.glyphs) {
    style.glyphs = absolute(style.glyphs);
  }
  if (typeof style.sprite === "string") {
    style.sprite = absolute(style.sprite);
  } else if (Array.isArray(style.sprite)) {
    style.sprite = style.sprite.map((sprite) => ({
      ...sprite,
      url: absolute(sprite.url),
    }));
  }
  return style;
}

export function popupContent(properties, documentRef = document) {
  const table = documentRef.createElement("table");
  table.className = "gisvn-geo__properties";
  for (const [key, value] of Object.entries(properties || {}).slice(0, 60)) {
    const row = documentRef.createElement("tr");
    const label = documentRef.createElement("th");
    const cell = documentRef.createElement("td");
    label.textContent = key.slice(0, 120);
    cell.textContent = (
      typeof value === "object" ? JSON.stringify(value) : String(value ?? "")
    ).slice(0, 2000);
    row.append(label, cell);
    table.append(row);
  }
  return table;
}
