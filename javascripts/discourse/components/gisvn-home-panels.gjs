import { themePrefix } from "virtual:theme";
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { fn } from "@ember/helper";
import { service } from "@ember/service";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import getURL from "discourse/lib/get-url";
import DButton from "discourse/ui-kit/d-button";
import { i18n } from "discourse-i18n";
import { titleBySlug } from "../lib/gisvn-classic-taxonomy";

const t = (key) => i18n(themePrefix(`gisvn.${key}`));
const topicURL = (topic) => getURL(`/t/${topic.slug || "topic"}/${topic.id}`);

export default class GisvnHomePanels extends Component {
  @service router;
  @service site;

  @tracked announcements = [];
  @tracked failed = false;
  @tracked loading = true;
  @tracked stats = null;
  @tracked tab = "latest";
  @tracked topics = [];
  @tracked users = [];

  #controller = new AbortController();
  #request = 0;

  willDestroy() {
    super.willDestroy(...arguments);
    this.#controller.abort();
  }

  get labels() {
    return Object.fromEntries(
      [
        "announcements",
        "topx",
        "latest",
        "hot",
        "views",
        "participants",
        "loading",
        "failed",
        "topics",
        "posts",
        "members",
        "statistics",
        "openCategory",
        "noTopics",
        "by",
      ].map((key) => [key, t(key)]),
    );
  }

  get shouldRender() {
    const url = (this.router.currentURL || "").split("?")[0];
    return url === "/" || url === "/categories";
  }

  get groups() {
    const categories = Array.from(this.site.categories || []);
    const sorted = (items) =>
      items.sort((a, b) => (a.position || 0) - (b.position || 0));
    const format = (category) => ({
      id: category.id,
      name: titleBySlug[category.slug] || category.name,
      url: getURL(`/c/${category.slug || "category"}/${category.id}`),
      topics: category.topic_count ?? 0,
      posts: category.post_count ?? 0,
      latest: this.topics.find((topic) => topic.category_id === category.id),
      children: sorted(
        categories.filter((item) => item.parent_category_id === category.id),
      ).map((child) => ({
        id: child.id,
        name: titleBySlug[child.slug] || child.name,
        url: getURL(`/c/${child.slug || "category"}/${child.id}`),
      })),
    });
    return sorted(
      categories.filter((category) => !category.parent_category_id),
    ).map((category) => ({
      id: category.id,
      name: titleBySlug[category.slug] || category.name,
      url: getURL(`/c/${category.slug || "category"}/${category.id}`),
      forums: sorted(
        categories.filter((child) => child.parent_category_id === category.id),
      ).map(format),
      own: format(category),
    }));
  }

  @action
  async load() {
    if (!this.shouldRender) {
      this.loading = false;
      return;
    }
    await this.selectTab("latest");
    try {
      const response = await fetch(getURL("/about.json"), {
        credentials: "same-origin",
        signal: this.#controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        if (!this.isDestroying) {
          this.stats = data.about?.stats || null;
        }
      }
    } catch {
      return;
    }
  }

  @action
  async selectTab(tab) {
    const request = ++this.#request;
    this.tab = tab;
    this.loading = true;
    this.failed = false;
    const path =
      tab === "hot"
        ? "/top.json?period=monthly"
        : tab === "views"
          ? "/latest.json?order=views&ascending=false"
          : "/latest.json";
    try {
      const response = await fetch(getURL(path), {
        credentials: "same-origin",
        signal: this.#controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (this.isDestroying || request !== this.#request) {
        return;
      }
      this.topics = (data.topic_list?.topics || [])
        .slice(0, 15)
        .map((topic) => ({ ...topic, url: topicURL(topic) }));
      this.users = (data.users || [])
        .slice(0, 15)
        .map((user) => ({
          ...user,
          url: getURL(`/u/${encodeURIComponent(user.username)}`),
        }));
      if (tab === "latest") {
        this.announcements = this.topics
          .filter((topic) => topic.pinned)
          .slice(0, 4);
      }
    } catch {
      if (!this.isDestroying && request === this.#request) {
        this.failed = true;
      }
    } finally {
      if (!this.isDestroying && request === this.#request) {
        this.loading = false;
      }
    }
  }

  <template>
    {{#if this.shouldRender}}
      <div class="gisvn-home-panels" {{didInsert this.load}}>
        {{#if this.announcements.length}}
          <section class="gisvn-panel gisvn-announcements">
            <h2 class="gisvn-panel__title">{{this.labels.announcements}}</h2>
            <ul>{{#each this.announcements as |topic|}}<li><a
                    href={{topic.url}}
                  >{{topic.title}}</a></li>{{/each}}</ul>
          </section>
        {{/if}}
        <section class="gisvn-panel gisvn-topx">
          <h2 class="gisvn-panel__title">{{this.labels.topx}}</h2>
          <div class="gisvn-topx__grid">
            <aside class="gisvn-topx__members">
              <h3>{{this.labels.participants}}</h3>
              <ol>{{#each this.users as |user|}}<li><a
                      href={{user.url}}
                    >{{user.username}}</a></li>{{/each}}</ol>
            </aside>
            <div class="gisvn-topx__topics">
              <div class="gisvn-topx__tabs">
                <DButton
                  @action={{fn this.selectTab "latest"}}
                  @translatedLabel={{this.labels.latest}}
                />
                <DButton
                  @action={{fn this.selectTab "hot"}}
                  @translatedLabel={{this.labels.hot}}
                />
                <DButton
                  @action={{fn this.selectTab "views"}}
                  @translatedLabel={{this.labels.views}}
                />
              </div>
              {{#if this.loading}}<p
                  role="status"
                >{{this.labels.loading}}</p>{{/if}}
              {{#if this.failed}}<p
                  role="status"
                >{{this.labels.failed}}</p>{{/if}}
              <ol>{{#each this.topics as |topic|}}<li><a
                      href={{topic.url}}
                    >{{topic.title}}</a><span
                    >{{topic.views}}</span></li>{{/each}}</ol>
            </div>
          </div>
        </section>
        {{#if this.groups.length}}
          <div class="gisvn-classic-catalog">
            {{#each this.groups as |group|}}
              <section class="gisvn-category">
                <h2><a href={{group.url}}>{{group.name}}</a></h2>
                {{#if group.forums.length}}
                  {{#each group.forums as |forum|}}
                    <article class="gisvn-forum-row">
                      <div class="gisvn-forum-row__info"><span
                          class="gisvn-forum-row__icon"
                          aria-hidden="true"
                        ></span><div>
                          <a
                            class="gisvn-forum-row__title"
                            href={{forum.url}}
                          >{{forum.name}}</a>
                          <div
                            class="gisvn-forum-row__counts"
                          >{{this.labels.topics}}:
                            {{forum.topics}}
                            ·
                            {{this.labels.posts}}:
                            {{forum.posts}}</div>
                          {{#each forum.children as |child|}}<a
                              class="gisvn-forum-row__child"
                              href={{child.url}}
                            >{{child.name}}</a>{{/each}}
                        </div></div>
                      <div class="gisvn-forum-row__last">
                        {{#if forum.latest}}<a
                            href={{forum.latest.url}}
                          >{{forum.latest.title}}</a>{{else}}<a
                            href={{forum.url}}
                          >{{this.labels.openCategory}}</a>{{/if}}
                      </div>
                    </article>
                  {{/each}}
                {{else}}
                  <article class="gisvn-forum-row gisvn-forum-row--single"><a
                      href={{group.url}}
                    >{{group.name}}</a><span>{{this.labels.topics}}:
                      {{group.own.topics}}
                      ·
                      {{this.labels.posts}}:
                      {{group.own.posts}}</span></article>
                {{/if}}
              </section>
            {{/each}}
          </div>
        {{/if}}
        {{#if this.stats}}
          <section class="gisvn-panel gisvn-community-stats"><h2
              class="gisvn-panel__title"
            >{{this.labels.statistics}}</h2><dl>
              <div><dt>{{this.labels.topics}}</dt><dd
                >{{this.stats.topics_count}}</dd></div>
              <div><dt>{{this.labels.posts}}</dt><dd
                >{{this.stats.posts_count}}</dd></div>
              <div><dt>{{this.labels.members}}</dt><dd
                >{{this.stats.users_count}}</dd></div>
            </dl></section>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
