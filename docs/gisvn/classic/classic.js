const dataset = window.GISVN_CLASSIC_DATA;
const byId = (id) => document.getElementById(id);
let current = "original_20160306";
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function link(title, url) {
  const element = node("a", title);
  element.href = url || "#archive-info";
  if (url?.startsWith("https://")) {
    element.target = "_blank";
    element.rel = "noopener noreferrer";
  }
  return element;
}
function openForum(forum) {
  byId("dialog-title").textContent = forum.title;
  const content = byId("dialog-body");
  content.replaceChildren(
    node(
      "p",
      "Đã khôi phục tên chuyên mục và thông tin có trong trang chủ. Nguồn chưa chứa nội dung đầy đủ các bài viết trong chuyên mục này.",
    ),
  );
  if (forum.topics != null)
    content.append(
      node(
        "p",
        `Chủ đề: ${forum.topics.toLocaleString("en-US")} · Bài gửi: ${forum.posts.toLocaleString("en-US")}`,
      ),
    );
  if (forum.last_title || forum.last_topic?.title)
    content.append(
      node(
        "p",
        `Bài cuối được ghi nhận: ${forum.last_title || forum.last_topic.title} — ${forum.last_author || ""}`,
      ),
    );
  const url = forum.url || forum.archived_reference;
  if (url) content.append(link("Mở chuyên mục trong bản lưu Wayback", url));
  for (const child of forum.children || []) {
    const paragraph = node("p");
    paragraph.append(link(child.title, child.url));
    content.append(paragraph);
  }
  byId("forum-dialog").showModal();
}
function render() {
  const source = dataset[current];
  const filter = byId("search").value.trim().toLocaleLowerCase("vi");
  byId("forums").replaceChildren();
  let visible = 0;
  for (const group of source.groups) {
    const forums = group.forums.filter((f) =>
      `${group.title} ${f.title} ${(f.children || []).map((v) => v.title).join(" ")}`
        .toLocaleLowerCase("vi")
        .includes(filter),
    );
    if (!forums.length) continue;
    const section = node("section", null, "category");
    const heading = node("h2", group.title);
    const button = node("button", "▴");
    button.setAttribute("aria-label", `Thu gọn ${group.title}`);
    button.setAttribute("aria-expanded", "true");
    const body = node("div");
    button.onclick = () => {
      body.hidden = !body.hidden;
      button.textContent = body.hidden ? "▾" : "▴";
      button.setAttribute("aria-expanded", String(!body.hidden));
    };
    heading.append(button);
    for (const forum of forums) {
      visible++;
      const row = node("article", null, "forum-row");
      const info = node("div", null, "forum-info");
      const icon = node("img", null, "forum-icon");
      icon.src = "assets/vbbdesign__tinhtev2__forum_old-48.png";
      icon.alt = "";
      const copy = node("div");
      const title = link(forum.title, `?forum=${forum.id}&snapshot=${current}`);
      title.className = "forum-title";
      title.onclick = (event) => {
        event.preventDefault();
        history.replaceState(
          null,
          "",
          `?forum=${forum.id}&snapshot=${current}`,
        );
        openForum(forum);
      };
      copy.append(title);
      if (forum.topics != null)
        copy.append(
          node(
            "div",
            `Chủ đề: ${forum.topics.toLocaleString("en-US")},  Bài gửi: ${forum.posts.toLocaleString("en-US")}`,
            "forum-counts",
          ),
        );
      if (forum.children?.length) {
        const sub = node("div", "Diễn đàn con:", "subforums");
        for (const child of forum.children)
          sub.append(link(child.title, child.url));
        copy.append(sub);
      }
      info.append(icon, copy);
      const last = node("div", null, "lastpost");
      if (forum.last_topic?.url)
        last.append(link(forum.last_topic.title, forum.last_topic.url));
      else if (forum.last_title) last.append(node("strong", forum.last_title));
      if (forum.last_author)
        last.append(node("p", `gửi bởi ${forum.last_author}`));
      if (forum.last_date) last.append(node("p", forum.last_date));
      row.append(info, last);
      body.append(row);
    }
    section.append(heading, body);
    byId("forums").append(section);
  }
  byId("result").hidden = !filter;
  byId("result").textContent = `${visible} chuyên mục phù hợp.`;
  byId("announcements").replaceChildren();
  source.announcements.forEach((a) =>
    byId("announcements").append(
      link(typeof a === "string" ? a : a.title, a.url),
    ),
  );
  byId("member-list").replaceChildren();
  source.members.forEach((m) => {
    const item = node("li");
    if (typeof m === "string") item.append(node("span", m));
    else {
      item.append(node("time", m.time), link(m.name, m.url));
    }
    byId("member-list").append(item);
  });
  byId("topic-list").replaceChildren();
  source.latest_topics.forEach((t) => {
    const item = node("li");
    item.append(link(typeof t === "string" ? t : t.title, t.url));
    if (t.author) item.append(node("small", t.author));
    byId("topic-list").append(item);
  });
  byId("stats").replaceChildren();
  for (const [key, label] of [
    ["topics", "Chủ đề"],
    ["posts", "Bài gửi"],
    ["members", "Thành viên"],
  ])
    byId("stats").append(
      node("span", `${label}: ${source.stats[key].toLocaleString("en-US")}`),
    );
}
byId("snapshot").onchange = (event) => {
  current = event.target.value;
  history.replaceState(null, "", `?snapshot=${current}`);
  render();
};
byId("search").oninput = render;
byId("search-form").onsubmit = (event) => {
  event.preventDefault();
  byId("forums").scrollIntoView();
};
byId("dialog-close").onclick = () => byId("forum-dialog").close();
document.querySelectorAll("[data-collapse]").forEach((button) => {
  button.onclick = () => {
    const el = byId(button.dataset.collapse);
    el.hidden = !el.hidden;
    button.setAttribute("aria-expanded", String(!el.hidden));
  };
});
const query = new URLSearchParams(location.search);
if (["original_20160306", "gisforum"].includes(query.get("snapshot")))
  current = query.get("snapshot");
byId("snapshot").value = current;
render();
if (query.has("forum")) {
  const found = dataset[current].groups
    .flatMap((g) => g.forums)
    .find((f) => String(f.id) === query.get("forum"));
  if (found) openForum(found);
}
