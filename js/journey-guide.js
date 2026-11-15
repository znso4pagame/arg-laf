/* 调查目标只依赖已经取得的材料；给出查阅目的，不提供谜题答案。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ZHAOHUI_GUIDE = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function describe(state, { page = "main", staffSession = false } = {}) {
    const has = (id) => state.clues.some((c) => c.id === id),
      flag = (id) => state.flags.includes(id);
    const base = {
      index: 0,
      title: "核对那份旧登记通知",
      text: "通知保留的移交地点是“旧馆站”。先核对物品登记的描述、地点与来源，确认哪些旧材料与这次通知有关。",
      action: "查通知上的地点",
      query: "旧馆站",
      url: "index.html#search",
      tasks: [],
    };
    if (state.ending)
      return {
        ...base,
        index: 5,
        title: "本次查档已经结束",
        text:
          state.ending === "claimed"
            ? "认领已经签署，岗位移交已记入系统。已取得的材料仍可在“我的”回看。"
            : "你已经明确放弃本次认领。可以在“我的”复盘取得的材料。",
        action: "回看我的材料",
        url: "index.html#mine",
        query: "",
      };
    if (page === "danny" && flag("staff") && !staffSession)
      return {
        ...base,
        index: 2,
        title: "恢复员工身份后继续查阅",
        text: "当前为游客浏览。重新登录即可回到已取得的工作记录，调查进度与个人笔记仍然保留。",
        action: "回账户入口",
        url: "danny.html#account",
        query: "",
      };
    if (flag("verified"))
      return {
        ...base,
        index: 4,
        title: "回找回网作最后决定",
        text: "凭据、附则和会话已经核对。现在需要确认申请认领的对象，以及签署之后由谁承担岗位。",
        action: "查看待决定的申请",
        url: "index.html#application",
        query: "",
      };
    if (flag("staff")) {
      const recovered = flag("timeline") && has("conversation"),
        compared =
          flag("compared") && has("clause") && has("signed") && has("relist");
      return {
        ...base,
        index: 3,
        title:
          recovered && compared
            ? "把已核对的记录关联起来"
            : "还原 Danny 的最后一晚",
        text:
          recovered && compared
            ? "材料已经齐备。用原始字段核对签收人与后续登记的关系，再判断这次认领意味着什么。"
            : "工作匣有两条可以并行查的线：校订值勤流水，恢复缺失的会话；根据工作材料定位旧柜，核对旧案与认领凭据。两边的记录需要相互印证。",
        action:
          recovered && compared
            ? "回旧柜核对关联"
            : !recovered
              ? "继续工作匣查阅"
              : flag("cabinet")
                ? "继续旧柜查阅"
                : "回工作匣定位旧柜",
        url:
          recovered && flag("cabinet")
            ? "danny.html#archive"
            : "danny.html#work",
        query: "",
        tasks: [
          { title: "恢复并阅读最后一次会话", done: recovered },
          { title: "对照旧档，阅读凭据与附则", done: compared },
        ],
      };
    }
    if (has("trace"))
      return {
        ...base,
        index: 2,
        title: "确认 Danny 的访问身份",
        text: "登记来源指向这个个人站，工作匣保留了更完整的原始记录。先在公开随记、相册和旧留言中核对身份与凭证的来历，再尝试员工登录。过期信息也有保留。",
        action: "继续公开材料查阅",
        url: "danny.html#journal",
        query: "",
      };
    if (
      state.clues.some(
        (c) => c.id.startsWith("public-") && !c.id.startsWith("public-local-"),
      )
    )
      return {
        ...base,
        index: 1,
        title: "追查登记的移交来源",
        text: "已经保留了一份公开登记。接下来核对同一地点的其他记录，查看它们的来源说明，确认旧材料最初由谁留下。普通物品特征还不能代替原始凭据。",
        action: "查同一移交地点",
      };
    return base;
  }
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function render(node, state, options = { page: "main" }) {
    const goal = describe(state, options),
      labels = ["核对通知", "追查来源", "确认身份", "还原记录", "作出判断"];
    node.innerHTML = `<div class="journey-caption"><span>本次查档</span><span>${state.ending ? "已结束" : "当前目标"}</span></div><div class="journey-content"><div><h2>${esc(goal.title)}</h2><p>${esc(goal.text)}</p>${goal.tasks.length ? `<ul class="journey-tasks">${goal.tasks.map((t) => `<li><span class="task-mark" aria-hidden="true">${t.done ? "✓" : "○"}</span><span>${esc(t.title)}</span><small>${t.done ? "已核对" : "待核对"}</small></li>`).join("")}</ul>` : ""}</div><div class="journey-actions">${goal.query && options.page === "main" ? `<button type="button" data-search="${esc(goal.query)}">${esc(goal.action)} &gt;&gt;</button>` : `<a href="${esc(goal.url)}">${esc(goal.action)} &gt;&gt;</a>`}<a class="journey-secondary" href="index.html#mine">回看已收集材料</a></div></div><details class="journey-path"><summary>查阅脉络</summary><ol>${labels.map((label, i) => `<li ${i === goal.index ? 'aria-current="step"' : ""} class="${i < goal.index ? "visited" : ""}">${esc(label)}</li>`).join("")}</ol><p>随记、附件和留言可以交叉查阅；工作区里的两条记录也可以先后互换。只有最后明确确认签署或放弃，才会结束本次调查。</p></details>`;
  }
  return { describe, render };
});
