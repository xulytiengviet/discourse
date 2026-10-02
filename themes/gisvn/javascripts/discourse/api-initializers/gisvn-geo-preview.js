import { apiInitializer } from "discourse/lib/api";

const MAPLIBRE_VERSION = "6.11.2";
const PMTILES_VERSION = "4.5.0";
const MAPLIBRE_MODULE =
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.mjs`;
const MAPLIBRE_CSS =
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const PMTILES_MODULE =
  `https://unpkg.com/pmtiles@${PMTILES_VERSION}/dist/esm/index.js`;

const MAX_TEXT_BYTES = 12 * 1024 * 1024;
const GEO_TYPES = new Set(["geojson", "kml", "pmtiles"]);

let librariesPromise;
let protocolRegistered = false;

function fileType(url) {
  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith(".geojson")) {
    return "geojson";
  }
  if (pathname.endsWith(".kml")) {
    return "kml";
  }
  if (pathname.endsWith(".pmtiles")) {
    return "pmtiles";
  }
  return null;
}

function safeHttpUrl(href) {
  try {
    const url = new URL(href, window.location.href);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function ensureMapLibreCss() {
  if (document.querySelector('link[data-gisvn-maplibre-css="1"]')) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS;
  link.dataset.gisvnMaplibreCss = "1";
  document.head.appendChild(link);
}

async function loadLibraries() {
  if (!librariesPromise) {
    ensureMapLibreCss();

    librariesPromise = Promise.all([
      import(MAPLIBRE_MODULE),
      import(PMTILES_MODULE),
    ]).then(([maplibre, pmtiles]) => {
      if (!protocolRegistered) {
        const protocol = new pmtiles.Protocol();
        maplibre.addProtocol("pmtiles", protocol.tile);
        protocolRegistered = true;
      }

      return { maplibre, pmtiles };
    });
  }

  return librariesPromise;
}

function basename(url) {
  const part = url.pathname.split("/").filter(Boolean).pop() || url.hostname;
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function statusText(type) {
  if (type === "pmtiles") {
    return "PMTiles · tải theo HTTP Range";
  }
  if (type === "geojson") {
    return "GeoJSON";
  }
  return "KML";
}

async function fetchText(url) {
  const sameOrigin = url.origin === window.location.origin;
  const response = await fetch(url.href, {
    credentials: sameOrigin ? "same-origin" : "omit",
    headers: { Accept: "application/json, application/vnd.google-earth.kml+xml, application/xml, text/xml, */*" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const advertised = Number(response.headers.get("content-length") || 0);
  if (advertised > MAX_TEXT_BYTES) {
    throw new Error("Tệp quá lớn để xem trực tiếp trong bài viết.");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_TEXT_BYTES) {
    throw new Error("Tệp quá lớn để xem trực tiếp trong bài viết.");
  }

  return new TextDecoder("utf-8").decode(buffer);
}

function parseCoordinateList(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => {
      const [lon, lat, altitude] = tuple.split(",").map(Number);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return null;
      }
      return Number.isFinite(altitude) ? [lon, lat, altitude] : [lon, lat];
    })
    .filter(Boolean);
}

function textOf(parent, tagName) {
  const node = parent.getElementsByTagName(tagName)[0];
  return node?.textContent?.trim() || "";
}

function kmlToGeoJSON(kmlText) {
  const xml = new DOMParser().parseFromString(kmlText, "application/xml");

  if (xml.querySelector("parsererror")) {
    throw new Error("KML không hợp lệ.");
  }

  const features = [];
  const placemarks = [...xml.getElementsByTagName("Placemark")];

  for (const placemark of placemarks) {
    const properties = {
      name: textOf(placemark, "name"),
      description: textOf(placemark, "description"),
    };

    for (const point of placemark.getElementsByTagName("Point")) {
      const coords = parseCoordinateList(textOf(point, "coordinates"));
      if (coords[0]) {
        features.push({
          type: "Feature",
          properties,
          geometry: { type: "Point", coordinates: coords[0] },
        });
      }
    }

    for (const line of placemark.getElementsByTagName("LineString")) {
      const coords = parseCoordinateList(textOf(line, "coordinates"));
      if (coords.length >= 2) {
        features.push({
          type: "Feature",
          properties,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    }

    for (const polygon of placemark.getElementsByTagName("Polygon")) {
      const rings = [];
      const outer = polygon.getElementsByTagName("outerBoundaryIs")[0];
      if (outer) {
        const coords = parseCoordinateList(textOf(outer, "coordinates"));
        if (coords.length >= 4) {
          rings.push(coords);
        }
      }

      for (const inner of polygon.getElementsByTagName("innerBoundaryIs")) {
        const coords = parseCoordinateList(textOf(inner, "coordinates"));
        if (coords.length >= 4) {
          rings.push(coords);
        }
      }

      if (rings.length) {
        features.push({
          type: "Feature",
          properties,
          geometry: { type: "Polygon", coordinates: rings },
        });
      }
    }
  }

  if (!features.length) {
    throw new Error("KML chưa có Point, LineString hoặc Polygon mà GISVN preview hỗ trợ.");
  }

  return { type: "FeatureCollection", features };
}

function normalizeGeoJSON(value) {
  if (!value || typeof value !== "object") {
    throw new Error("GeoJSON không hợp lệ.");
  }

  if (value.type === "FeatureCollection") {
    return value;
  }

  if (value.type === "Feature") {
    return { type: "FeatureCollection", features: [value] };
  }

  if (value.type && value.coordinates) {
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: value }],
    };
  }

  throw new Error("JSON không phải GeoJSON Feature/FeatureCollection/Geometry.");
}

function emptyStyle() {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "gisvn-background",
        type: "background",
        paint: { "background-color": "#eef6fa" },
      },
    ],
  };
}

function addGeoJSONLayers(map, data, prefix) {
  const sourceId = `${prefix}-source`;
  map.addSource(sourceId, { type: "geojson", data });

  map.addLayer({
    id: `${prefix}-polygon`,
    type: "fill",
    source: sourceId,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": "#1687ba",
      "fill-opacity": 0.28,
      "fill-outline-color": "#005d8d",
    },
  });

  map.addLayer({
    id: `${prefix}-line`,
    type: "line",
    source: sourceId,
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": "#006d9f",
      "line-width": 3,
    },
  });

  map.addLayer({
    id: `${prefix}-point`,
    type: "circle",
    source: sourceId,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": "#087caf",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
}

function visitCoordinates(value, visit) {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    visit(value[0], value[1]);
    return;
  }

  for (const child of value) {
    visitCoordinates(child, visit);
  }
}

function geoJSONBounds(data) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const feature of data.features || []) {
    visitCoordinates(feature?.geometry?.coordinates, (lon, lat) => {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    });
  }

  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) {
    return null;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

function fitBounds(map, bounds) {
  if (!bounds) {
    return;
  }

  const [[minLon, minLat], [maxLon, maxLat]] = bounds;

  if (minLon === maxLon && minLat === maxLat) {
    map.setCenter([minLon, minLat]);
    map.setZoom(13);
    return;
  }

  map.fitBounds(bounds, { padding: 34, maxZoom: 15, duration: 0 });
}

function waitForLoad(map) {
  if (map.loaded()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => map.once("load", resolve));
}

function genericVectorLayers(map, sourceId, layerIds) {
  layerIds.forEach((sourceLayer, index) => {
    const safeId = sourceLayer.replace(/[^a-zA-Z0-9_-]/g, "-");
    const prefix = `gisvn-pm-${index}-${safeId}`;

    map.addLayer({
      id: `${prefix}-fill`,
      type: "fill",
      source: sourceId,
      "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": index % 2 ? "#62a9c8" : "#1687ba",
        "fill-opacity": 0.32,
        "fill-outline-color": "#075c82",
      },
    });

    map.addLayer({
      id: `${prefix}-line`,
      type: "line",
      source: sourceId,
      "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": index % 2 ? "#2d7a99" : "#005f8c",
        "line-width": 2,
      },
    });

    map.addLayer({
      id: `${prefix}-point`,
      type: "circle",
      source: sourceId,
      "source-layer": sourceLayer,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 4,
        "circle-color": index % 2 ? "#4d91ae" : "#087caf",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    });
  });
}

async function renderPMTiles(map, url, pmtiles) {
  const archive = new pmtiles.PMTiles(url.href);
  const [header, metadata] = await Promise.all([
    archive.getHeader(),
    archive.getMetadata(),
  ]);

  const sourceId = "gisvn-pmtiles-source";
  const isRaster = [2, 3, 4, 5].includes(header.tileType);

  map.addSource(sourceId, {
    type: isRaster ? "raster" : "vector",
    url: `pmtiles://${url.href}`,
  });

  if (isRaster) {
    map.addLayer({
      id: "gisvn-pmtiles-raster",
      type: "raster",
      source: sourceId,
    });
  } else {
    const layerIds = [
      ...(metadata?.vector_layers || []).map((layer) => layer.id),
      ...(metadata?.tilestats?.layers || []).map((layer) => layer.layer),
    ].filter(Boolean);

    const uniqueLayerIds = [...new Set(layerIds)];

    if (!uniqueLayerIds.length) {
      throw new Error(
        "PMTiles vector thiếu metadata vector_layers/tilestats để tạo style xem nhanh."
      );
    }

    genericVectorLayers(map, sourceId, uniqueLayerIds);
  }

  const values = [
    header.minLon,
    header.minLat,
    header.maxLon,
    header.maxLat,
  ];

  if (values.every(Number.isFinite)) {
    fitBounds(map, [
      [header.minLon, header.minLat],
      [header.maxLon, header.maxLat],
    ]);
  }

  return {
    header,
    metadata,
    summary: isRaster
      ? `Raster PMTiles · z${header.minZoom}–${header.maxZoom}`
      : `Vector PMTiles · z${header.minZoom}–${header.maxZoom}`,
  };
}

async function renderPreview(card, type, url) {
  const button = card.querySelector(".gisvn-geo-preview__load");
  const status = card.querySelector(".gisvn-geo-preview__status");
  const mapNode = card.querySelector(".gisvn-geo-preview__map");

  button.disabled = true;
  status.textContent = "Đang tải thư viện bản đồ…";
  mapNode.hidden = false;

  try {
    const { maplibre, pmtiles } = await loadLibraries();

    const map = new maplibre.Map({
      container: mapNode,
      style: emptyStyle(),
      center: [106.0, 16.0],
      zoom: 4,
      attributionControl: true,
    });

    map.addControl(new maplibre.NavigationControl(), "top-right");
    await waitForLoad(map);

    if (type === "pmtiles") {
      status.textContent = "Đang đọc header/metadata PMTiles…";
      const result = await renderPMTiles(map, url, pmtiles);
      status.textContent = result.summary;
    } else {
      status.textContent = `Đang tải ${type === "kml" ? "KML" : "GeoJSON"}…`;
      const text = await fetchText(url);
      const data =
        type === "kml" ? kmlToGeoJSON(text) : normalizeGeoJSON(JSON.parse(text));

      addGeoJSONLayers(map, data, `gisvn-${type}`);
      fitBounds(map, geoJSONBounds(data));
      status.textContent = `${type === "kml" ? "KML" : "GeoJSON"} · ${data.features.length} đối tượng`;
    }

    button.textContent = "Đã mở bản đồ";
  } catch (error) {
    mapNode.hidden = true;
    button.disabled = false;
    button.textContent = "Thử lại";
    status.textContent =
      `Không thể xem trực tiếp: ${error?.message || "lỗi không xác định"}. ` +
      "Nếu tệp nằm trên R2/domain khác, hãy kiểm tra CORS; PMTiles cần HTTP Range.";
  }
}

function buildCard(anchor, type, url) {
  const card = document.createElement("section");
  card.className = "gisvn-geo-preview";
  card.dataset.gisvnGeoPreview = "1";

  const header = document.createElement("div");
  header.className = "gisvn-geo-preview__header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "gisvn-geo-preview__title-wrap";

  const badge = document.createElement("span");
  badge.className = "gisvn-geo-preview__badge";
  badge.textContent = type.toUpperCase();

  const title = document.createElement("strong");
  title.className = "gisvn-geo-preview__title";
  title.textContent = basename(url);

  titleWrap.append(badge, title);

  const actions = document.createElement("div");
  actions.className = "gisvn-geo-preview__actions";

  const load = document.createElement("button");
  load.type = "button";
  load.className = "btn btn-primary gisvn-geo-preview__load";
  load.textContent = "Xem bản đồ";

  const original = document.createElement("a");
  original.className = "btn gisvn-geo-preview__original";
  original.href = url.href;
  original.target = "_blank";
  original.rel = "noopener noreferrer";
  original.textContent = "Mở tệp";

  actions.append(load, original);
  header.append(titleWrap, actions);

  const status = document.createElement("div");
  status.className = "gisvn-geo-preview__status";
  status.textContent = statusText(type);

  const map = document.createElement("div");
  map.className = "gisvn-geo-preview__map";
  map.hidden = true;

  card.append(header, status, map);

  load.addEventListener("click", () => renderPreview(card, type, url));

  anchor.insertAdjacentElement("afterend", card);
}

export default apiInitializer((api) => {
  api.decorateCookedElement((element) => {
    for (const anchor of element.querySelectorAll("a[href]")) {
      if (anchor.dataset.gisvnGeoPreviewAttached === "1") {
        continue;
      }

      const url = safeHttpUrl(anchor.getAttribute("href"));
      if (!url) {
        continue;
      }

      const type = fileType(url);
      if (!type || !GEO_TYPES.has(type)) {
        continue;
      }

      anchor.dataset.gisvnGeoPreviewAttached = "1";
      buildCard(anchor, type, url);
    }
  });
});
