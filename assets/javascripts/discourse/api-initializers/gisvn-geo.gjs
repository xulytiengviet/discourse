import { apiInitializer } from "discourse/lib/api";
import GisvnGeoCard from "../components/gisvn-geo-card";

export default apiInitializer((api) => {
  const settings = api.container.lookup("service:site-settings");
  if (!settings.gisvn_geo_enabled) {
    return;
  }
  api.decorateCookedElement(
    (element, helper) => {
      if (!helper?.renderGlimmer) {
        return;
      }
      const nodes = [];
      const seen = new Set();
      for (const anchor of element.querySelectorAll("a[href]")) {
        if (nodes.length >= settings.gisvn_geo_max_cards_per_post) {
          break;
        }
        if (
          anchor.closest(".gisvn-geo, aside.quote") ||
          anchor.dataset.gisvnGeoPreviewAttached
        ) {
          continue;
        }
        let url;
        try {
          url = new URL(anchor.href, window.location.href);
        } catch {
          continue;
        }
        if (!["https:", "http:"].includes(url.protocol) || seen.has(url.href)) {
          continue;
        }
        const filename = (
          anchor.dataset.origFilename ||
          anchor.textContent ||
          ""
        ).trim();
        const match = `${url.pathname}\n${filename}`.match(
          /\.(geojson|kml|kmz|gpx|pmtiles|style\.json)(?:$|\n)/i,
        );
        if (!match) {
          continue;
        }
        seen.add(url.href);
        const host = document.createElement("div");
        host.className = "gisvn-geo-host";
        const parent = anchor.closest("p") || anchor;
        parent.insertAdjacentElement("afterend", host);
        anchor.dataset.gisvnGeoPreviewAttached = "plugin";
        nodes.push({ anchor, host });
        helper.renderGlimmer(host, GisvnGeoCard, {
          url: url.href,
          type: match[1].toLowerCase(),
          filename: filename || url.pathname.split("/").pop(),
        });
      }
      return () => {
        for (const { anchor, host } of nodes) {
          delete anchor.dataset.gisvnGeoPreviewAttached;
          host.remove();
        }
      };
    },
    { onlyStream: true },
  );
});
