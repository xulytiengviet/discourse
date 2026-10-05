import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { service } from "@ember/service";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import getURL from "discourse/lib/get-url";
import loadScript, { loadCSS } from "discourse/lib/load-script";
import DButton from "discourse/ui-kit/d-button";
import { i18n } from "discourse-i18n";

let libraries;
function loadLibraries() {
  libraries ||= Promise.all([
    loadScript("/plugins/discourse-gisvn-geo/gisvn-geo-runtime.js"),
    loadCSS("/plugins/discourse-gisvn-geo/maplibre-gl.css"),
  ]).catch((error) => {
    libraries = undefined;
    throw error;
  });
  return libraries;
}

export default class GisvnGeoCard extends Component {
  @service siteSettings;

  @tracked coordinates = "";
  @tracked error = "";
  @tracked loading = false;
  @tracked opened = false;
  @tracked ready = false;

  #element;
  #generation = 0;
  #viewer;

  willDestroy() {
    super.willDestroy(...arguments);
    this.#generation++;
    this.#viewer?.destroy();
  }

  get canExport() {
    return this.ready && !["pmtiles", "style.json"].includes(this.args.type);
  }

  @action
  close() {
    this.#generation++;
    this.#viewer?.destroy();
    this.#viewer = undefined;
    this.opened = false;
    this.ready = false;
    this.loading = false;
    this.coordinates = "";
  }

  @action
  exportGeoJSON() {
    const data = this.#viewer?.getGeoJSON();
    if (!data) {
      return;
    }
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: "application/geo+json" }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = "gisvn-export.geojson";
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  @action
  async open() {
    const generation = ++this.#generation;
    this.opened = true;
    this.loading = true;
    this.error = "";
    try {
      await loadLibraries();
      if (this.isDestroying || generation !== this.#generation) {
        return;
      }
      this.#element.hidden = false;
      this.#viewer = window.GISVNGeo.createViewer(this.#element, {
        url: this.args.url,
        type: this.args.type,
        workerURL: getURL("/plugins/discourse-gisvn-geo/maplibre-worker.js"),
        allowedOrigins: this.siteSettings.gisvn_geo_allowed_origins
          .split("|")
          .map((v) => v.trim())
          .filter(Boolean),
        maxBytes: this.siteSettings.gisvn_geo_max_file_mb * 1024 * 1024,
        onCoordinates: (value) => {
          if (!this.isDestroying && generation === this.#generation) {
            this.coordinates = value;
          }
        },
        onStatus: (state, detail) => {
          if (
            !this.isDestroying &&
            generation === this.#generation &&
            state === "error"
          ) {
            this.error = `${i18n("gisvn_geo.failed")} ${detail || ""}`;
          }
        },
      });
      await this.#viewer.ready;
      if (!this.isDestroying && generation === this.#generation) {
        this.ready = true;
      }
    } catch (error) {
      if (!this.isDestroying && generation === this.#generation) {
        this.#viewer?.destroy();
        this.#viewer = undefined;
        this.opened = false;
        this.error = `${i18n("gisvn_geo.failed")} ${error.message}`;
      }
    } finally {
      if (!this.isDestroying && generation === this.#generation) {
        this.loading = false;
      }
    }
  }

  @action
  setElement(element) {
    this.#element = element;
  }

  <template>
    <section class="gisvn-geo" aria-label={{i18n "gisvn_geo.title"}}>
      <header class="gisvn-geo__header">
        <strong>{{@filename}}</strong>
        <span class="gisvn-geo__badge">{{@type}}</span>
      </header>
      <div class="gisvn-geo__actions">
        {{#if this.opened}}
          <DButton @action={{this.close}} @label="gisvn_geo.close" />
        {{else}}
          <DButton
            class="btn-primary"
            @action={{this.open}}
            @isLoading={{this.loading}}
            @label="gisvn_geo.open"
          />
        {{/if}}
        <a
          class="btn"
          download
          href={{@url}}
          rel="noopener noreferrer"
          target="_blank"
        >{{i18n "gisvn_geo.original"}}</a>
        {{#if this.canExport}}
          <DButton @action={{this.exportGeoJSON}} @label="gisvn_geo.export" />
        {{/if}}
      </div>
      <p class="gisvn-geo__status" role="status">
        {{#if this.loading}}{{i18n "gisvn_geo.loading"}}{{/if}}
        {{#if this.ready}}{{i18n "gisvn_geo.hint"}}{{/if}}
        {{#if this.error}}{{this.error}}{{/if}}
      </p>
      <div
        class="gisvn-geo__map"
        hidden={{unless this.opened true}}
        {{didInsert this.setElement}}
      ></div>
      {{#if this.ready}}
        <output class="gisvn-geo__coordinates">{{i18n "gisvn_geo.coordinates"}}
          {{this.coordinates}}</output>
      {{/if}}
    </section>
  </template>
}
