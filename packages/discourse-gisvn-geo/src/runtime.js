import * as maplibregl from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import {
  checkedURL,
  fetchBytes,
  MAX_BYTES,
  parseData,
  popupContent,
  prepareStyle,
} from "./data.js";

const defaultWorkerURL = new URL(
  "maplibre-worker.js",
  document.currentScript?.src || location.href,
).href;

function layers(source, sourceLayer, index = 0) {
  const common = {
    source,
    ...(sourceLayer ? { "source-layer": sourceLayer } : {}),
  };
  return [
    {
      ...common,
      id: `gisvn-${index}-fill`,
      type: "fill",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": "#1687ba",
        "fill-opacity": 0.3,
        "fill-outline-color": "#075c82",
      },
    },
    {
      ...common,
      id: `gisvn-${index}-line`,
      type: "line",
      filter: [
        "match",
        ["geometry-type"],
        ["LineString", "Polygon"],
        true,
        false,
      ],
      paint: { "line-color": "#006d9f", "line-width": 2 },
    },
    {
      ...common,
      id: `gisvn-${index}-point`,
      type: "circle",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#087caf",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
  ];
}

function waitForLoad(map, signal) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      map.off("load", loaded);
      map.off("error", failed);
      signal.removeEventListener("abort", aborted);
      error ? reject(error) : resolve();
    };
    const loaded = () => finish();
    const failed = (event) => finish(event.error || new Error("map_error"));
    const aborted = () => finish(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => finish(new Error("timeout")), 30000);
    map.once("load", loaded);
    map.once("error", failed);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) {
      aborted();
    }
  });
}

class RangeSource {
  constructor(url, signal) {
    this.url = url;
    this.signal = signal;
  }

  getKey() {
    return this.url;
  }

  async getBytes(offset, length, signal, etag) {
    if (length > MAX_BYTES) {
      throw new Error("too_large");
    }
    const headers = { Range: `bytes=${offset}-${offset + length - 1}` };
    if (etag) {
      headers["If-Match"] = etag;
    }
    const response = await fetch(this.url, {
      headers,
      signal: signal ? AbortSignal.any([signal, this.signal]) : this.signal,
      credentials: "same-origin",
      redirect: "error",
    });
    if (
      response.status !== 206 ||
      !response.headers.get("content-range")?.startsWith(`bytes ${offset}-`)
    ) {
      await response.body?.cancel();
      throw new Error("range_required");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        size += value.byteLength;
        if (size > length) {
          throw new Error("range_required");
        }
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const data = new Uint8Array(size);
    let cursor = 0;
    for (const chunk of chunks) {
      data.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    return {
      data: data.buffer,
      etag: response.headers.get("etag") || undefined,
    };
  }
}

export function createViewer(container, options) {
  maplibregl.setWorkerUrl(options.workerURL || defaultWorkerURL);
  const {
    url,
    type,
    allowedOrigins = [],
    maxBytes = MAX_BYTES,
    onStatus = () => {},
    onCoordinates = () => {},
  } = options;
  const controller = new AbortController();
  const validateURL = (value) =>
    checkedURL(value, location.href, allowedOrigins);
  let map;
  let popup;
  let observer;
  let data;
  let destroyed = false;
  const archives = new Map();
  function archiveFor(value) {
    const href = validateURL(value);
    if (!archives.has(href)) {
      archives.set(href, new PMTiles(new RangeSource(href, controller.signal)));
    }
    return archives.get(href);
  }
  // Each map gets its own protocol instance so closing a card cannot cancel another card.
  const localProtocol = new Protocol();
  const protocolName = `gisvn${crypto.randomUUID().replaceAll("-", "")}`;
  function registerSources(style) {
    for (const source of Object.values(style.sources)) {
      if (source.url?.startsWith("pmtiles://")) {
        const archive = archiveFor(source.url.slice(10));
        localProtocol.add(archive);
      }
    }
  }
  maplibregl.addProtocol(protocolName, async (request, abortController) => {
    const result = await localProtocol.tilev4(
      {
        ...request,
        url: request.url.replace(`${protocolName}://`, "pmtiles://"),
      },
      abortController,
    );
    if (request.type === "json" && result.data.tiles) {
      result.data.tiles = result.data.tiles.map((tile) =>
        tile.replace("pmtiles://", `${protocolName}://`),
      );
    }
    return result;
  });

  const ready = (async () => {
    validateURL(url);
    let bounds;
    let style = {
      version: 8,
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#eef6fa" },
        },
      ],
    };
    if (type === "style.json") {
      const bytes = await fetchBytes(url, {
        signal: controller.signal,
        maxBytes,
        validateURL,
      });
      style = prepareStyle(
        JSON.parse(new TextDecoder().decode(bytes)),
        url,
        validateURL,
      );
    } else if (type === "pmtiles") {
      const archive = archiveFor(url);
      const [header, metadata] = await Promise.all([
        archive.getHeader(),
        archive.getMetadata(),
      ]);
      const raster = [2, 3, 4, 5].includes(header.tileType);
      if (!raster && header.tileType !== 1) {
        throw new Error("unsupported_tiles");
      }
      style.sources.gisvn = {
        type: raster ? "raster" : "vector",
        url: `pmtiles://${url}`,
      };
      if (raster) {
        style.layers.push({
          id: "gisvn-raster",
          type: "raster",
          source: "gisvn",
        });
      } else {
        const ids = [
          ...new Set(
            [
              ...(metadata.vector_layers || []).map((v) => v.id),
              ...(metadata.tilestats?.layers || []).map((v) => v.layer),
            ].filter((v) => typeof v === "string"),
          ),
        ];
        if (!ids.length || ids.length > 100) {
          throw new Error("missing_layers");
        }
        ids.forEach((id, index) =>
          style.layers.push(...layers("gisvn", id, index)),
        );
      }
      bounds = [
        [header.minLon, header.minLat],
        [header.maxLon, header.maxLat],
      ];
    } else {
      const bytes = await fetchBytes(url, {
        signal: controller.signal,
        maxBytes,
        validateURL,
      });
      ({ data, bounds } = parseData(bytes, type, maxBytes));
      style.sources.gisvn = { type: "geojson", data };
      style.layers.push(...layers("gisvn"));
    }
    controller.signal.throwIfAborted();
    registerSources(style);
    for (const source of Object.values(style.sources)) {
      if (source.url?.startsWith("pmtiles://")) {
        source.url = source.url.replace("pmtiles://", `${protocolName}://`);
      }
    }
    map = new maplibregl.Map({
      container,
      style,
      center: style.center || [106, 16],
      zoom: style.zoom ?? 4,
      transformRequest(resource) {
        if (resource.startsWith(`${protocolName}://`)) {
          validateURL(
            resource
              .slice(protocolName.length + 3)
              .replace(/\/\d+\/\d+\/\d+$/, ""),
          );
          return { url: resource };
        }
        return { url: validateURL(resource), credentials: "same-origin" };
      },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.FullscreenControl({ container }),
      "top-right",
    );
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }));
    observer = new ResizeObserver(() => map?.resize());
    observer.observe(container);
    await waitForLoad(map, controller.signal);
    if (bounds?.flat().every(Number.isFinite)) {
      map.fitBounds(bounds, { padding: 36, maxZoom: 14, duration: 0 });
    }
    map.on(
      "error",
      (event) => !destroyed && onStatus("error", event.error?.message),
    );
    map.on("mousemove", (event) =>
      onCoordinates(
        `${event.lngLat.lng.toFixed(6)}, ${event.lngLat.lat.toFixed(6)}`,
      ),
    );
    map.on("click", (event) => {
      onCoordinates(
        `${event.lngLat.lng.toFixed(6)}, ${event.lngLat.lat.toFixed(6)}`,
      );
      const feature = map
        .queryRenderedFeatures(event.point)
        .find((value) => value.layer.type !== "background");
      popup?.remove();
      if (feature) {
        popup = new maplibregl.Popup({ maxWidth: "360px" })
          .setLngLat(event.lngLat)
          .setDOMContent(popupContent(feature.properties))
          .addTo(map);
      }
    });
    onStatus("ready", data?.features.length);
  })();
  return {
    ready,
    getGeoJSON: () => data,
    destroy() {
      destroyed = true;
      controller.abort();
      observer?.disconnect();
      popup?.remove();
      map?.remove();
      map = undefined;
      maplibregl.removeProtocol(protocolName);
      archives.clear();
    },
  };
}
