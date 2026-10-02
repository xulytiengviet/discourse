import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import getURL from "discourse/lib/get-url";

const ANNOUNCEMENT_LIMIT = 4;
const TOPIC_LIMIT = 8;

function topicUrl(topic) {
  return getURL(`/t/${topic.slug}/${topic.id}`);
}

function normalizeTopics(topics = []) {
  return topics.map((topic) => ({
    ...topic,
    url: topicUrl(topic),
  }));
}

export default class GisvnHomePanels extends Component {
  @service router;

  @tracked topics = [];
  @tracked stats = null;
  @tracked loading = true;
  @tracked failed = false;

  get shouldRender() {
    const url = this.router.currentURL || "";
    return url === "/" || url === "/categories";
  }

  get announcements() {
    const pinned = this.topics.filter((topic) => topic.pinned);
    return (pinned.length ? pinned : this.topics).slice(0, ANNOUNCEMENT_LIMIT);
  }

  get latestTopics() {
    return this.topics.slice(0, TOPIC_LIMIT);
  }

  get hotTopics() {
    return [...this.topics]
      .sort(
        (a, b) =>
          (b.posts_count || 0) - (a.posts_count || 0) ||
          (b.views || 0) - (a.views || 0)
      )
      .slice(0, TOPIC_LIMIT);
  }

  get mostViewedTopics() {
    return [...this.topics]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, TOPIC_LIMIT);
  }

  @action
  async load() {
    if (!this.shouldRender) {
      this.loading = false;
      return;
    }

    try {
      const [latestResponse, aboutResponse] = await Promise.all([
        fetch(getURL("/latest.json"), {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
        fetch(getURL("/about.json"), {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      ]);

      if (!latestResponse.ok || !aboutResponse.ok) {
        throw new Error("GISVN home data request failed");
      }

      const [latest, about] = await Promise.all([
        latestResponse.json(),
        aboutResponse.json(),
      ]);

      this.topics = normalizeTopics(latest?.topic_list?.topics || []);
      this.stats = about?.about?.stats || about?.stats || null;
    } catch {
      this.failed = true;
    } finally {
      this.loading = false;
    }
  }

  <template>
    {{#if this.shouldRender}}
      <section
        class="gisvn-home-panels"
        aria-label="Thông tin nhanh GISVN"
        {{didInsert this.load}}
      >
        {{#if this.loading}}
          <div class="gisvn-panel gisvn-panel--loading">
            Đang tải thông tin diễn đàn…
          </div>
        {{else if this.failed}}
          <div class="gisvn-panel gisvn-panel--loading">
            Không thể tải bảng thống kê. Các chức năng chính của diễn đàn vẫn hoạt động bình thường.
          </div>
        {{else}}
          <section class="gisvn-panel gisvn-announcements">
            <h2 class="gisvn-panel__title">Thông Báo Mới Nhất</h2>
            <ul>
              {{#each this.announcements as |topic|}}
                <li>
                  <a href={{topic.url}}>{{topic.title}}</a>
                </li>
              {{/each}}
            </ul>
          </section>

          <section class="gisvn-panel gisvn-topx">
            <h2 class="gisvn-panel__title">Thống Kê Topx</h2>

            <div class="gisvn-topx__grid">
              <aside class="gisvn-topx__stats" aria-label="Thống kê diễn đàn">
                <h3>Tình hình diễn đàn</h3>
                <dl>
                  <div>
                    <dt>Chủ đề</dt>
                    <dd>{{this.stats.topics_count}}</dd>
                  </div>
                  <div>
                    <dt>Bài viết</dt>
                    <dd>{{this.stats.posts_count}}</dd>
                  </div>
                  <div>
                    <dt>Thành viên</dt>
                    <dd>{{this.stats.users_count}}</dd>
                  </div>
                  <div>
                    <dt>Hoạt động 30 ngày</dt>
                    <dd>{{this.stats.active_users_30_days}}</dd>
                  </div>
                </dl>
              </aside>

              <div class="gisvn-topx__lists">
                <section>
                  <h3>Bài Mới Nhất</h3>
                  <ol>
                    {{#each this.latestTopics as |topic|}}
                      <li>
                        <a href={{topic.url}}>{{topic.title}}</a>
                        <span>{{topic.posts_count}} bài</span>
                      </li>
                    {{/each}}
                  </ol>
                </section>

                <section>
                  <h3>Chủ Đề "Hot"</h3>
                  <ol>
                    {{#each this.hotTopics as |topic|}}
                      <li>
                        <a href={{topic.url}}>{{topic.title}}</a>
                        <span>{{topic.posts_count}} bài</span>
                      </li>
                    {{/each}}
                  </ol>
                </section>

                <section>
                  <h3>Xem Nhiều Nhất</h3>
                  <ol>
                    {{#each this.mostViewedTopics as |topic|}}
                      <li>
                        <a href={{topic.url}}>{{topic.title}}</a>
                        <span>{{topic.views}} lượt xem</span>
                      </li>
                    {{/each}}
                  </ol>
                </section>
              </div>
            </div>
          </section>
        {{/if}}
      </section>
    {{/if}}
  </template>
}
