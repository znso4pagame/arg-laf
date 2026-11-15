(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    store = window.ZHAOHUI_JOURNEY,
    data = window.ZHAOHUI,
    matcher = window.ZHAOHUI_MATCHER,
    searchIndex = window.ZHAOHUI_SEARCH;
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
  let mineFilter = "all",
    selected = [],
    mineQuery = "",
    deletedNotes = [],
    itemCategory = "all",
    currentNav = "home",
    pendingChoice = null,
    toastTimer;
  const has = (id) => store.read().clues.some((c) => c.id === id);
  const label = {
    page: "页面入口",
    record: "档案",
    image: "图片",
    message: "留言",
    note: "个人推测",
  };
  function toast(message, undo = false) {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    if (undo) {
      const button = document.createElement("button");
      button.id = "undo-note";
      button.textContent = "撤销";
      $("#toast").append(button);
    }
    $("#toast").hidden = false;
    toastTimer = setTimeout(
      () => ($("#toast").hidden = true),
      undo ? 15000 : 2600,
    );
  }
  function modal(title, html) {
    $("#modal-label").textContent = title;
    $("#modal-body").innerHTML = html;
    $("#modal").classList.toggle(
      "comparison-dialog",
      !!$("#modal-body .comparison-columns"),
    );
    if (!$("#modal").open) $("#modal").showModal();
  }
  function fileBody(file) {
    return `${file.fields?.length ? `<dl class="detail-list">${file.fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}${file.image ? `<a href="${esc(file.image)}" target="_blank" rel="noopener"><img class="evidence-image" src="${esc(file.image)}" alt="${esc(file.title)}"></a>` : ""}${(file.body || []).map((t) => `<p>${esc(t)}</p>`).join("")}`;
  }
  function openFile(id) {
    const file = store.read().clues.find((x) => x.id === id);
    if (!file) return;
    modal(
      file.source,
      `<h2>${esc(file.title)}</h2>${fileBody(file)}<p class="source-note">已取得材料的副本。这里的阅读不会重新触发剧情。</p>${file.url ? `<a class="record-action" href="${esc(file.url)}">回到来源页面 &gt;&gt;</a>` : ""}<label class="personal-label">我的备注<textarea id="clue-note" data-id="${esc(id)}" maxlength="2000" placeholder="写下自己的推测，不会被当成已验证事实">${esc(file.note)}</textarea></label><span id="note-save-status" role="status"></span>`,
    );
  }
  function updateChrome() {
    const s = store.read();
    let guide = $("#journey-guide");
    if (!guide) {
      guide = document.createElement("section");
      guide.id = "journey-guide";
      guide.className = "journey-guide";
      guide.setAttribute("aria-label", "当前调查目标");
      $(".content-grid").before(guide);
    }
    window.ZHAOHUI_GUIDE.render(guide, s, { page: "main" });
    $("#staff-count").textContent =
      s.ending === "left" ? "本站员工：0" : "本站员工：1";
    $("#search-objective").hidden = !s.goal || !!s.ending;
    $("#objective-name").textContent = s.goal;
    $("#ask-property").hidden = true;
    document.querySelectorAll(".nav").forEach((b) => {
      const active =
        b.dataset.nav ===
        (document.body.classList.contains("notebook-mode")
          ? "mine"
          : currentNav);
      b.classList.toggle("active", active);
    });
    const n = $("#my-count");
    if (n) n.textContent = String(s.clues.length + s.notes.length);
    const eyebrow = $(".section-heading .eyebrow");
    if (eyebrow)
      eyebrow.textContent = document.body.classList.contains("notebook-mode")
        ? "PERSONAL ARCHIVE / 已取得材料"
        : "PUBLIC RECORDS / 公开拾物登记";
    historyChrome();
  }
  function clearMatch() {
    $("#clue-match").hidden = true;
    $("#clue-match-results").replaceChildren();
  }
  function matchInput(query, { submitted = false } = {}) {
    clearMatch();
    const s = store.read();
    if (!s.settings.assist || s.ending || !matcher.fold(query)) return;
    const candidates = [
      ...data.items.map((x) => ({
        key: x.name,
        label: x.name,
        forms: [x.type, ...(x.keywords || [])],
        query: x.type,
      })),
      ...s.clues.map((x) => ({
        key: x.id,
        label: x.title,
        forms: [x.id],
        query: x.title,
      })),
    ];
    const results = matcher.rank(query, candidates);
    if (!results.length) {
      if (submitted) {
        $("#clue-match").hidden = false;
        $("#clue-match-results").innerHTML =
          '<p class="clue-match-status">暂无接近的已知材料，可以到“我的”核对收集到的原文。</p>';
      }
      return;
    }
    $("#clue-match").hidden = false;
    $("#clue-match-results").innerHTML =
      (results.length > 1
        ? '<p class="clue-match-status">有多个接近方向，可以补充文字区分。</p>'
        : "") +
      results
        .map(
          (r) =>
            `<div class="clue-match-row"><div class="clue-match-summary"><strong class="clue-match-stage">${r.stage}</strong><span class="clue-match-fragment">${esc(r.text)}</span><span class="clue-match-percent">${r.percent}%</span></div><progress max="100" value="${r.percent}" aria-label="线索匹配度"></progress><p>${r.level === 3 ? "完整匹配，可以查询。" : { order: "相邻字符的顺序可能颠倒。", extra: "可能多输入了一个字符。", spelling: "可能有一处写法不同。", missing: "可能少了一个字符。", fragment: "这是已知内容的一部分，可以继续补全。" }[r.kind] || "接近一个已知方向，可以继续核对。"}</p>${r.level === 3 ? `<button class="clue-match-use" data-search="${esc(candidates.find((c) => c.key === r.key).query)}">使用线索查询 &gt;&gt;</button>` : ""}</div>`,
        )
        .join("");
  }
  function whisper() {
    const s = store.read();
    if (
      s.ending ||
      !(has("anomaly") || has("clause") || s.flags.includes("verified"))
    )
      return;
    const q = matcher.fold($("#search").value);
    const stage = s.flags.includes("verified")
      ? "truth"
      : has("conversation")
        ? "cache"
        : s.flags.includes("staff")
          ? "staff"
          : "first";
    const context =
      stage === "truth"
        ? "truth"
        : /danny|上一个|草稿|他问/.test(q) && has("draft")
          ? "danny"
          : /小鹿|客服|你是谁/.test(q)
            ? "identity"
            : q === matcher.fold(s.goal) || /我的东西|我的失物/.test(q)
              ? "property"
              : "arrival";
    const id = "whisper-" + context + "-" + stage;
    if (
      stage === "truth" &&
      s.clues.some((c) => c.id.startsWith("whisper-truth"))
    )
      return;
    if (has(id)) return;
    const words =
      stage === "truth"
        ? ["我没有找到你的东西。", "我只是想离开。", "你自己选。"]
        : context === "identity"
          ? ["我是小鹿。", "B3 没有白天。", "我只能碰到这里。"]
          : context === "danny"
            ? stage === "cache"
              ? ["他问过同样的问题。", "后来就没有输入了。"]
              : ["他把记录留下了。", "我不知道他现在在哪。"]
            : context === "property"
              ? ["要先通过审核。", "我才能替你查。"]
              : stage === "first"
                ? ["我是小鹿。", "旧记录还在。"]
                : ["你看到旧档了。", "我还在等。"];
    $("#suggestions").hidden = false;
    $("#suggestions").innerHTML = words
      .map((t) => `<div class="suggestion-response">${esc(t)}</div>`)
      .join("");
    store.collect({
      id,
      kind: "message",
      title:
        stage === "truth"
          ? "查询建议里的最后几句话"
          : "异常查询建议 / " +
            (context === "arrival"
              ? "来访"
              : context === "property"
                ? "失物"
                : context === "identity"
                  ? "身份"
                  : "Danny"),
      source: "找回网 · 实际显示的查询建议",
      body: words,
      summary: words[0],
    });
    updateChrome();
  }
  const iconPaths = {
    钱包: "M5 8h23v19H5z M5 8V5h20v3 M20 15h8v7h-8z",
    钥匙: "M17 10a6 6 0 1 1-12 0a6 6 0 1 1 12 0 M15 14l13 13 M22 21l3-3 M25 24l3-3",
    雨伞: "M3 15a13 13 0 0 1 26 0 M3 15q4-4 8 0q5-4 10 0q4-4 8 0 M16 15v11q0 5 5 2",
    相机: "M4 10h24v17H4z M10 10l2-5h8l2 5 M21 18a5 5 0 1 1-10 0a5 5 0 1 1 10 0",
    旧书: "M3 6q7-3 13 1q6-4 13-1v21q-7-3-13 1q-6-4-13-1z M16 7v21",
    证件: "M6 4h20v24H6z M11 11a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M9 21q5-8 10 0 M22 10h1 M21 15h2 M21 20h2",
    耳机: "M5 22v-7a11 11 0 0 1 22 0v7 M5 15h5v12H5z M22 15h5v12h-5z",
    水杯: "M8 4h16v25H8z M8 8h16 M24 11h3v10h-3",
    文件: "M7 3h13l6 6v20H7z M20 3v7h6 M11 15h11 M11 20h11 M11 25h7",
  };
  function card(item) {
    const path = iconPaths[item.type] || iconPaths.文件;
    return `<button class="item" data-item="${esc(item.id)}"><span class="item-image"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="item-register-id">${esc(item.id)}</span></span><span class="item-body"><span class="item-title"><strong>${esc(item.name)}</strong><span class="badge">待认领</span></span><span class="item-description">${esc(item.description)}</span><span class="item-meta"><span>${esc(item.place)}</span><span>${esc(item.date)}</span></span></span></button>`;
  }
  function renderResults(query = "") {
    const s = store.read(),
      q = matcher.fold(query);
    const items = searchIndex
      .matches(query, [...s.registrations, ...data.items])
      .filter(
        (item) =>
          itemCategory === "all" ||
          (
            {
              personal: [
                "钱包",
                "钥匙",
                "耳机",
                "雨伞",
                "围巾",
                "相机",
                "水杯",
                "收音机",
                "纸袋",
              ],
              papers: ["证件", "票根", "文件", "明信片"],
              books: ["旧书"],
            }[itemCategory] || []
          ).includes(item.type),
      );
    const clues = s.clues.filter(
      (x) => q && matcher.fold(x.title + x.id + x.summary).includes(q),
    );
    $("#results-title").textContent = query ? "查询结果" : "最近拾获";
    $("#result-meta").hidden = !query;
    $("#result-meta").textContent =
      `关键词：${query} · ${items.length} 条公开登记 · ${clues.length} 份已收集材料`;
    let html = `<div class="items">${items.map(card).join("")}</div>`;
    const related = query ? searchIndex.related(items, query) : [];
    if (related.length)
      html += `<div class="related-queries"><span>相关查询</span>${related.map((q) => `<button data-search="${esc(q)}">${esc(q)}</button>`).join("")}</div>`;
    if (clues.length)
      html += `<div class="collected-search"><h3>我的已收集材料</h3>${clues.map((c) => `<button class="record-action" data-file="${esc(c.id)}">${esc(c.title)}</button>`).join("")}</div>`;
    if (!items.length && !clues.length)
      html =
        '<div class="empty"><h3>暂无匹配记录</h3><p>可以更换物品名称，或在“我的”回看已取得材料。</p></div>';
    if (s.ending === "claimed")
      html =
        `<article class="record"><h3>${esc(s.name)} / 客服 0001</h3><p>状态：待认领。岗位已经移交。</p></article>` +
        html;
    const filters = `<div class="item-filters" role="group" aria-label="物品类别">${[
      ["all", "全部登记"],
      ["personal", "随身物品"],
      ["papers", "证件票据"],
      ["books", "书籍资料"],
    ]
      .map(
        ([id, name]) =>
          `<button data-item-category="${id}" aria-pressed="${itemCategory === id}">${name}</button>`,
      )
      .join("")}</div>`;
    $("#results").innerHTML = filters + html;
    renderApplication();
  }
  function historyChrome() {
    const s = store.read(),
      history = s.searchHistory;
    $("#history-panel").hidden = !history.length;
    $("#history-list").innerHTML = history
      .slice()
      .reverse()
      .map((q) => `<button data-search="${esc(q)}">${esc(q)}</button>`)
      .join("");
    $("#query-navigation").hidden =
      document.body.classList.contains("notebook-mode") ||
      !$("#search").value ||
      history.length < 2;
    $("#query-back").disabled = s.searchCursor <= 0;
    $("#query-forward").disabled = s.searchCursor >= history.length - 1;
    $("#query-position").textContent = history.length
      ? `${s.searchCursor + 1} / ${history.length}`
      : "";
  }
  function search(query, { record = true } = {}) {
    query = String(query).trim().slice(0, 80);
    if (!query) {
      $("#search").focus();
      return;
    }
    document.body.classList.remove("notebook-mode");
    itemCategory = "all";
    currentNav = "all";
    clearMatch();
    $("#search").value = query;
    $("#suggestions").hidden = true;
    store.update((s) => {
      s.lastQuery = query;
      if (record && s.searchHistory[s.searchCursor] !== query) {
        s.searchHistory = s.searchHistory.slice(0, s.searchCursor + 1);
        s.searchHistory.push(query);
        s.searchHistory = s.searchHistory.slice(-12);
        s.searchCursor = s.searchHistory.length - 1;
      }
      if (!s.goal && !/^(你好|谢谢|天气|系统)$/.test(query)) s.goal = query;
    });
    renderResults(query);
    updateChrome();
    whisper();
    matchInput(query, { submitted: true });
  }
  function home({ remember = true, section = "home" } = {}) {
    itemCategory = "all";
    currentNav = section;
    if (remember) store.update((s) => (s.lastQuery = ""));
    document.body.classList.remove("notebook-mode");
    $("#search").value = "";
    $("#suggestions").hidden = true;
    clearMatch();
    renderResults();
    updateChrome();
  }
  function renderApplication() {
    const s = store.read();
    let panel = $("#application-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "application-panel";
      $(".content-grid").after(panel);
    }
    panel.hidden =
      !s.flags.includes("staff") ||
      !(has("anomaly") || has("clause") || s.flags.includes("verified")) ||
      !!s.ending;
    panel.innerHTML = `<h2>特殊人员认领申请</h2><p>员工站附件关联到客服 0001 的人员认领。这不是你失物的领取单。${s.flags.includes("verified") ? "你已经完成归档关系核验。" : "资料尚未全部核对，可以继续调查后再决定。"}</p><a href="danny.html#archive">回归档室核对材料 &gt;&gt;</a><form id="claim-form" class="claim-form"><label>认领对象<input value="小鹿 / 客服 0001" readonly></label><label>认领人姓名<input name="name" required maxlength="30" autocomplete="off"></label><label class="claim-terms">认领人承担该对象在系统中遗留的全部责任、义务与岗位职责。提交前将再次核对。</label><button class="record-action" type="submit">核对并准备签署</button><button class="text-link" type="button" id="leave">放弃本次认领</button></form>`;
  }
  function renderMine() {
    document.body.classList.add("notebook-mode");
    $("#suggestions").hidden = true;
    clearMatch();
    const s = store.read();
    $("#results-title").textContent = "我的 · 已收集线索";
    $("#result-meta").hidden = true;
    const entries = searchIndex
      .matches(mineQuery, s.clues)
      .filter(
        (c) =>
          mineFilter === "all" ||
          (mineFilter === "starred" && c.starred) ||
          c.kind === mineFilter,
      );
    const notes = searchIndex.matches(mineQuery, s.notes);
    $("#results").innerHTML =
      `<section class="notebook"><div class="notebook-top"><p>这里保存已经取得的材料。个人备注仅代表推测，不会自动解锁剧情。</p><button class="text-link" id="notebook-return">返回查阅 &gt;&gt;</button></div><form id="notebook-search-form" class="notebook-search"><label class="sr-only" for="notebook-search">搜索收藏与备注</label><input id="notebook-search" value="${esc(mineQuery)}" placeholder="搜索标题、正文、字段和自己的备注" maxlength="80"><button>查找材料</button>${mineQuery ? '<button type="button" id="clear-notebook-search">清除筛选</button>' : ""}</form><div class="notebook-tabs">${[
        ["all", "全部"],
        ["page", "页面"],
        ["record", "档案"],
        ["image", "图片"],
        ["message", "留言"],
        ["note", "我的笔记"],
        ["starred", "重点"],
      ]
        .map(
          ([id, name]) =>
            `<button data-filter="${id}" aria-pressed="${mineFilter === id}">${name}</button>`,
        )
        .join(
          "",
        )}</div><div class="compare-toolbar"><span id="compare-count">已选 ${selected.length} / 2 份材料</span><button id="compare-files" ${selected.length !== 2 ? "disabled" : ""}>并排对照</button><button id="new-note">写一条笔记</button><button id="export-notebook">导出线索与笔记</button></div>${mineFilter !== "note" ? entries.map((c) => `<article class="notebook-card"><div class="notebook-card-head"><span>${label[c.kind]}</span><button data-star="${esc(c.id)}" aria-pressed="${c.starred}">${c.starred ? "★ 已标重点" : "☆ 标记重点"}</button></div><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><small>来源：${esc(c.source)}</small>${c.note ? `<blockquote>我的备注：${esc(c.note)}</blockquote>` : ""}<div class="notebook-card-actions"><button data-file="${esc(c.id)}">查看副本 / 备注</button>${c.url ? `<a href="${esc(c.url)}">来源页面 &gt;&gt;</a>` : ""}<label><input type="checkbox" data-compare="${esc(c.id)}" ${selected.includes(c.id) ? "checked" : ""}> 选入对照</label></div></article>`).join("") : ""}${["all", "note", "starred"].includes(mineFilter) && mineFilter !== "starred" ? notes.map((n) => `<article class="notebook-card personal-note"><span>个人推测</span><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><div class="notebook-card-actions"><button data-edit-note="${esc(n.id)}">修改笔记</button><button data-delete-note="${esc(n.id)}">移除笔记</button></div></article>`).join("") : ""}${!(mineFilter === "note" ? notes.length : entries.length + (mineFilter === "all" ? notes.length : 0)) ? '<div class="empty"><h3>这个分类还没有材料</h3><p>保存公开登记或阅读站内附件，取得的材料会出现在这里。</p></div>' : ""}</section>`;
    updateChrome();
  }
  function compare() {
    const files = selected
      .map((id) => store.read().clues.find((c) => c.id === id))
      .filter(Boolean);
    if (files.length !== 2) return;
    const keys = [...new Set(files.flatMap((c) => c.fields.map((x) => x[0])))];
    modal(
      "我的 · 材料对照",
      `<h2>两份已取得材料</h2><div class="comparison-columns">${files.map((c) => `<section><h3>${esc(c.title)}</h3>${fileBody(c)}</section>`).join("")}</div>${keys.length ? `<div class="comparison-table-scroll" tabindex="0" role="region" aria-label="材料字段对照"><table class="comparison-table"><thead><tr><th>字段</th>${files.map((c) => `<th>${esc(c.title)}</th>`).join("")}</tr></thead><tbody>${keys.map((k) => `<tr><th>${esc(k)}</th>${files.map((c) => `<td>${esc(c.fields.find((x) => x[0] === k)?.[1] || "未记录")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}<p>对照不会替你作出判断。可以把推测写进每份材料的备注。</p>`,
    );
  }
  function review(ending, name = "") {
    pendingChoice = { ending, name };
    modal(
      "最后确认",
      `<h2>${ending === "claimed" ? "确认签署这份人员认领？" : "确认放弃本次认领？"}</h2><p>${ending === "claimed" ? `认领人：${esc(name)}。对象为小鹿 / 客服 0001，按完整附则继受责任与岗位。` : "确认后本次特殊申请结束。关闭这个窗口则保留待决定状态。"}</p><button class="record-action" id="confirm-choice">确认${ending === "claimed" ? "签署" : "放弃"}</button><button class="text-link" id="cancel-choice">返回继续查阅</button>`,
    );
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button,a");
    if (!b) return;
    const localTarget =
      b.tagName === "A" &&
      /^index\.html#(mine|application|search)$/.exec(
        b.getAttribute("href") || "",
      );
    if (localTarget && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      const hash = "#" + localTarget[1];
      if (location.hash !== hash) history.pushState(null, "", hash);
      navigateToHash(hash);
    }
    if (b.dataset.search) {
      e.preventDefault();
      if ($("#modal").open) $("#modal").close();
      search(b.dataset.search);
    }
    if (b.id === "query-back" || b.id === "query-forward") {
      const s = store.read(),
        cursor = s.searchCursor + (b.id === "query-back" ? -1 : 1);
      if (cursor >= 0 && cursor < s.searchHistory.length) {
        store.update((x) => (x.searchCursor = cursor));
        search(s.searchHistory[cursor], { record: false });
      }
    }
    if (b.id === "clear-notebook-search") {
      mineQuery = "";
      renderMine();
    }
    if (b.dataset.editNote) {
      const n = store.read().notes.find((n) => n.id === b.dataset.editNote);
      if (n)
        modal(
          "我的 · 修改笔记",
          `<h2>修改个人推测</h2><form id="edit-note-form" data-id="${esc(n.id)}" class="register-form"><label>标题<input name="title" required maxlength="80" value="${esc(n.title)}"></label><label>内容<textarea name="body" required maxlength="3000">${esc(n.body)}</textarea></label><button class="record-action">保存修改</button></form>`,
        );
    }
    if (b.dataset.deleteNote) {
      const n = store.read().notes.find((n) => n.id === b.dataset.deleteNote);
      if (n) {
        deletedNotes.push(n);
        store.update((s) => (s.notes = s.notes.filter((x) => x.id !== n.id)));
        renderMine();
        toast("笔记已移除。", true);
      }
    }
    if (b.id === "undo-note") {
      const n = deletedNotes.pop();
      if (n) {
        store.update((s) => {
          if (s.notes.length < 50 && !s.notes.some((x) => x.id === n.id))
            s.notes.push(n);
        });
        renderMine();
        toast("笔记已恢复。", !!deletedNotes.length);
      }
    }
    if (b.id === "export-notebook") {
      const s = store.read(),
        snapshot = {
          format: "zhaohui-notebook",
          version: 1,
          clues: s.clues,
          notes: s.notes,
        };
      modal(
        "导出线索与笔记",
        `<h2>材料与个人笔记副本</h2><p>可复制保存为文本。这里只导出已取得的材料与备注。</p><textarea id="notebook-export" readonly aria-label="导出的线索与笔记">${esc(JSON.stringify(snapshot, null, 2))}</textarea><button id="select-export" class="record-action">全选导出内容</button>`,
      );
    }
    if (b.id === "select-export") {
      $("#notebook-export").focus();
      $("#notebook-export").select();
      toast("已全选，可以复制保存。");
    }
    if (b.dataset.itemCategory) {
      itemCategory = b.dataset.itemCategory;
      renderResults($("#search").value);
      updateChrome();
    }
    if (b.dataset.nav) {
      e.preventDefault();
      if (b.dataset.nav === "mine") renderMine();
      else if (["home", "all"].includes(b.dataset.nav))
        home({ section: b.dataset.nav });
      else if (b.dataset.nav === "guide")
        modal(
          "认领须知",
          "<h2>认领前请核对归属</h2><p>物品认领与特殊人员认领分别登记。先看对象，再读附则。本站不收取认领费用。</p>",
        );
      else if (b.dataset.nav === "register")
        modal(
          "拾物登记",
          '<h2>登记拾获物品</h2><form id="register-form" class="register-form"><label>物品名称<input name="name" required maxlength="60"></label><label>拾获地点<input name="place" required maxlength="80"></label><label>描述<textarea name="description" required maxlength="300"></textarea></label><p>本机演示登记，不会发送到服务器。</p><button class="record-action">保存本机登记</button></form>',
        );
    }
    if (b.hasAttribute("data-anomaly")) {
      store.collect(data.files.anomaly);
      modal(
        "未分类登记",
        `<h2>未分类登记 / 0001</h2>${fileBody(data.files.anomaly)}<a class="record-action" href="danny.html#journal">打开登记修订记录 &gt;&gt;</a><p>原始附件仍保留，可以从来源继续核对。</p>`,
      );
      updateChrome();
    }
    if (b.dataset.item) {
      const item = [...store.read().registrations, ...data.items].find(
        (x) => x.id === b.dataset.item,
      );
      if (item) {
        const source = item.archive
          ? '<p>转录批次 HH / 0417。原始网页保留了归还照片与登记人随记。</p><a href="danny.html#journal" data-source="' +
            esc(item.id) +
            '">网页存档</a>'
          : item.id.startsWith("local-")
            ? "<p>来源：本机演示登记，未发送到公开平台。</p>"
            : "<p>转录来源：城市拾物登记窗口。暂未收到更多附件。</p>";
        modal(
          "失物详情",
          `<h2>${esc(item.name)}</h2><p>${esc(item.description)}</p><dl class="detail-list"><dt>登记编号</dt><dd>${esc(item.id)}</dd><dt>拾获地点</dt><dd>${esc(item.place)}</dd><dt>登记日期</dt><dd>${esc(item.date)}</dd></dl><p>请先核对特征，示例登记不一定属于你。</p><details class="source-details"><summary>登记来源与转录说明</summary>${source}</details><div class="related-queries"><span>同类 / 同地点</span>${searchIndex
            .related([item], item.name)
            .map((q) => `<button data-search="${esc(q)}">${esc(q)}</button>`)
            .join(
              "",
            )}</div><button data-save-record="${esc(item.id)}" class="text-link">保存这份登记</button>`,
        );
      }
    }
    if (b.dataset.source || b.dataset.saveRecord) {
      const id = b.dataset.source || b.dataset.saveRecord;
      const item = [...store.read().registrations, ...data.items].find(
        (x) => x.id === id,
      );
      if (item) {
        store.collect({
          id: "public-" + id,
          title: item.name + " / " + id,
          kind: "record",
          source: item.id.startsWith("local-")
            ? "找回网 · 本机登记"
            : "找回网 · 公开登记",
          summary: item.description,
          fields: [
            ["编号", id],
            ["地点", item.place],
          ],
          body: [item.description],
          url: item.archive ? "danny.html#journal" : "index.html#search",
        });
        updateChrome();
        if (b.dataset.saveRecord) toast("登记已保存到“我的”。");
      }
    }
    if (b.dataset.file) openFile(b.dataset.file);
    if (b.dataset.filter) {
      mineFilter = b.dataset.filter;
      renderMine();
    }
    if (b.dataset.star) {
      store.star(b.dataset.star);
      renderMine();
    }
    if (b.id === "compare-files") compare();
    if (b.id === "new-note")
      modal(
        "我的 · 新建笔记",
        '<h2>记录自己的推测</h2><form id="personal-note-form" class="register-form"><label>标题<input name="title" required maxlength="80"></label><label>内容<textarea name="body" required maxlength="3000"></textarea></label><button class="record-action">保存笔记</button></form>',
      );
    if (b.id === "notebook-return") {
      document.body.classList.remove("notebook-mode");
      store.read().lastQuery ? search(store.read().lastQuery) : home();
    }
    if (b.id === "close-modal" || b.id === "cancel-choice") {
      $("#modal").close();
      pendingChoice = null;
    }
    if (b.id === "leave") review("left");
    if (b.id === "confirm-choice" && pendingChoice) {
      const choice = pendingChoice;
      pendingChoice = null;
      store.finish(choice.ending, choice.name);
      $("#modal").close();
      home();
      if (choice.ending === "claimed") {
        $("#ending-reveal").hidden = false;
        $("#ending-status").textContent = "认领完成 / 岗位移交";
        $("#ending-name").textContent = `客服 0001 / ${choice.name}`;
        $("#ending").showModal();
      }
    }
    if (b.id === "return-home") $("#ending").close();
    if (b.id === "match-toggle") {
      store.update((s) => (s.settings.assist = !s.settings.assist));
      syncAssist();
      matchInput($("#search").value);
    }
    if (b.id === "hint-toggle") {
      $("#hint-content").hidden = !$("#hint-content").hidden;
      b.setAttribute("aria-expanded", String(!$("#hint-content").hidden));
      $("#hint-body").textContent = has("plan")
        ? "注意材料的年代和适用范围。同地点的记录未必属于同一件事。"
        : has("trace")
          ? "个人站的公开随记、相册与留言可能相互解释。过期信息可以用生效日期排除。"
          : "除了名称，也可以试试描述里的地点和物品特征，登记通常保留了来源说明。";
    }
    if (b.id === "reset")
      modal(
        "清除本机记录",
        '<h2>重新开始新版调查？</h2><p>将清除新版线索、笔记和结局；旧版存档不受影响。</p><button id="confirm-reset" class="record-action">清除新版记录</button>',
      );
    if (b.id === "confirm-reset") {
      store.reset();
      try {
        sessionStorage.removeItem("harrow-session");
      } catch {}
      selected = [];
      mineQuery = "";
      deletedNotes = [];
      $("#modal").close();
      home();
      $("#intro").showModal();
    }
  });
  document.addEventListener("change", (e) => {
    const id = e.target.dataset.compare;
    if (!id) return;
    if (e.target.checked) {
      if (selected.length === 2) {
        e.target.checked = false;
        toast("一次请选择两份材料对照。");
        return;
      }
      selected.push(id);
    } else selected = selected.filter((x) => x !== id);
    $("#compare-count").textContent = `已选 ${selected.length} / 2 份材料`;
    $("#compare-files").disabled = selected.length !== 2;
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "clue-note") {
      store.annotate(e.target.dataset.id, e.target.value);
      $("#note-save-status").textContent = "备注已保存在本机。";
    }
  });
  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.id === "notebook-search-form") {
      e.preventDefault();
      mineQuery = $("#notebook-search").value.trim();
      renderMine();
    }
    if (form.id === "edit-note-form") {
      e.preventDefault();
      const f = new FormData(form),
        title = String(f.get("title")).trim(),
        body = String(f.get("body")).trim();
      if (!title || !body) return;
      store.update((s) => {
        const n = s.notes.find((n) => n.id === form.dataset.id);
        if (n) {
          n.title = title.slice(0, 80);
          n.body = body.slice(0, 3000);
        }
      });
      $("#modal").close();
      renderMine();
    }
    if (form.id === "search-form") {
      e.preventDefault();
      if (!composing) search($("#search").value);
    }
    if (form.id === "intro-form") {
      e.preventDefault();
      const goal = $("#intro-item").value.trim();
      if (!goal) return;
      store.update((s) => {
        s.goal = goal;
        s.introduced = true;
      });
      $("#intro").close();
      search(goal);
    }
    if (form.id === "personal-note-form") {
      e.preventDefault();
      const f = new FormData(form);
      if (!String(f.get("title")).trim() || !String(f.get("body")).trim())
        return;
      store.addNote(String(f.get("title")), String(f.get("body")));
      $("#modal").close();
      mineFilter = "all";
      renderMine();
    }
    if (form.id === "register-form") {
      e.preventDefault();
      const f = new FormData(form);
      store.update((s) =>
        s.registrations.push({
          id: "local-" + Date.now(),
          name: String(f.get("name")).trim(),
          place: String(f.get("place")).trim(),
          description: String(f.get("description")).trim(),
          type: "其他",
          date: "本机登记",
        }),
      );
      $("#modal").close();
      home();
    }
    if (form.id === "claim-form") {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if (name) review("claimed", name);
    }
  });
  function syncAssist() {
    const b = $("#match-toggle");
    if (b) {
      b.setAttribute("aria-pressed", String(store.read().settings.assist));
      b.textContent = store.read().settings.assist
        ? "关闭线索辅助"
        : "需要时开启线索辅助";
    }
  }
  let composing = false;
  $("#search").addEventListener("compositionstart", () => {
    composing = true;
    clearMatch();
  });
  $("#search").addEventListener("compositionend", () => {
    composing = false;
    matchInput($("#search").value);
  });
  $("#search").addEventListener("input", () => {
    if (!composing) matchInput($("#search").value);
  });
  $("#search").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearMatch();
      $("#suggestions").hidden = true;
    }
  });
  function dismissIntro() {
    store.update((s) => (s.introduced = true));
    $("#intro").close();
  }
  $("#close-intro").addEventListener("click", dismissIntro);
  $("#intro-skip").addEventListener("click", dismissIntro);
  $("#intro").addEventListener("cancel", (e) => {
    e.preventDefault();
    dismissIntro();
  });
  $(".brand").addEventListener("click", (e) => {
    e.preventDefault();
    home();
  });
  $("#show-all").addEventListener("click", () => home({ section: "all" }));
  $("#ending").addEventListener("cancel", (e) => {
    e.preventDefault();
    $("#ending").close();
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== store.key) return;
    if (document.body.classList.contains("notebook-mode")) renderMine();
    else {
      renderResults($("#search").value);
      updateChrome();
    }
  });
  $("#modal").addEventListener("close", () => {
    pendingChoice = null;
  });
  const savedQuery = store.read().lastQuery;
  home({ remember: false });
  syncAssist();
  if (savedQuery)
    search(savedQuery, { record: !store.read().searchHistory.length });
  function navigateToHash(hash) {
    if ($("#modal").open) $("#modal").close();
    if (hash === "#mine") {
      renderMine();
      $("#results-title").scrollIntoView?.({ block: "start" });
      return;
    }
    if (hash === "#application") {
      document.body.classList.remove("notebook-mode");
      renderResults($("#search").value);
      updateChrome();
      if (!$("#application-panel").hidden) {
        $("#application-panel").scrollIntoView?.({ block: "start" });
        whisper();
      }
      return;
    }
    if (hash === "#search" || !hash) {
      document.body.classList.remove("notebook-mode");
      const query = $("#search").value;
      if (query) search(query, { record: false });
      else home({ remember: false });
      if (hash) {
        $(".search-section").scrollIntoView?.({ block: "start" });
        $("#search").focus({ preventScroll: true });
      }
    }
  }
  window.addEventListener("hashchange", () => navigateToHash(location.hash));
  if (!store.read().introduced) $("#intro").showModal();
  if (["#mine", "#application", "#search"].includes(location.hash))
    navigateToHash(location.hash);
})();
