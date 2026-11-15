(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    store = window.ZHAOHUI_JOURNEY,
    data = window.ZHAOHUI,
    matcher = window.ZHAOHUI_MATCHER;
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
  function toast(message) {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    toastTimer = setTimeout(() => ($("#toast").hidden = true), 2600);
  }
  function modal(title, html) {
    $("#modal-label").textContent = title;
    $("#modal-body").innerHTML = html;
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
    $("#staff-count").textContent =
      s.ending === "left" ? "本站员工：0" : "本站员工：1";
    $("#search-objective").hidden = !s.goal || !!s.ending;
    $("#objective-name").textContent = s.goal;
    $("#ask-property").hidden = true;
    document.querySelectorAll(".nav").forEach((b) => {
      const active =
        b.dataset.nav ===
        (document.body.classList.contains("notebook-mode") ? "mine" : "home");
      b.classList.toggle("active", active);
    });
    const n = $("#my-count");
    if (n) n.textContent = String(s.clues.length + s.notes.length);
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
        forms: [x.type],
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
    if (s.ending || !has("anomaly")) return;
    const stage = s.flags.includes("verified")
        ? "truth"
        : s.flags.includes("staff")
          ? "staff"
          : "first",
      id = "whisper-" + stage;
    if (has(id)) return;
    const words =
      stage === "truth"
        ? ["我没有找到你的东西。", "我只是想离开。", "你自己选。"]
        : stage === "staff"
          ? ["你能看到旧档了。", "我还在等。"]
          : ["我是小鹿。", "我改不了正文。", "旧附件还在。"];
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
          : "异常查询建议 / " + (stage === "staff" ? "员工站之后" : "最初"),
      source: "找回网 · 实际显示的查询建议",
      body: words,
      summary: words[0],
    });
    updateChrome();
  }
  function card(item) {
    return `<button class="item" data-item="${esc(item.id)}"><span class="item-image"><span class="portal-item-symbol" aria-hidden="true">${item.type === "钱包" ? "▣" : item.type === "钥匙" ? "⚿" : "▤"}</span></span><span class="item-body"><span class="item-title"><strong>${esc(item.name)}</strong><span class="badge">待认领</span></span><span class="item-description">${esc(item.description)}</span><span class="item-meta"><span>${esc(item.place)}</span><span>${esc(item.date)}</span></span></span></button>`;
  }
  function renderResults(query = "") {
    const s = store.read(),
      q = matcher.fold(query);
    const items = [...s.registrations, ...data.items].filter(
      (x) => !q || matcher.fold(x.id + x.name + x.type + x.place).includes(q),
    );
    const clues = s.clues.filter(
      (x) => q && matcher.fold(x.title + x.id + x.summary).includes(q),
    );
    $("#results-title").textContent = query ? "查询结果" : "最近拾获";
    $("#result-meta").hidden = !query;
    $("#result-meta").textContent =
      `关键词：${query} · 仅检索公开记录和已收集材料`;
    let html = `<div class="items">${items.map(card).join("")}</div>`;
    if (query && !s.ending && !/^(你好|谢谢|天气|系统)$/.test(query))
      html += `<button class="item anomaly" data-anomaly><span class="item-image"><span class="portal-item-symbol">?</span></span><span class="item-body"><span class="item-title"><strong>未分类登记 / 0001</strong><span class="badge">信息不全</span></span><span class="item-description">帮帮我。</span><span class="item-meta">原始附件仍保留 · 可查修订记录</span></span></button>`;
    if (clues.length)
      html += `<div class="collected-search"><h3>我的已收集材料</h3>${clues.map((c) => `<button class="record-action" data-file="${esc(c.id)}">${esc(c.title)}</button>`).join("")}</div>`;
    if (!items.length && !clues.length && (s.ending || !query))
      html =
        '<div class="empty"><h3>暂无匹配记录</h3><p>可以更换物品名称，或在“我的”回看已取得材料。</p></div>';
    if (s.ending === "claimed")
      html =
        `<article class="record"><h3>${esc(s.name)} / 客服 0001</h3><p>状态：待认领。岗位已经移交。</p></article>` +
        html;
    $("#results").innerHTML = html;
    renderApplication();
  }
  function search(query) {
    query = String(query).trim().slice(0, 80);
    if (!query) {
      $("#search").focus();
      return;
    }
    document.body.classList.remove("notebook-mode");
    clearMatch();
    $("#search").value = query;
    $("#suggestions").hidden = true;
    store.update((s) => {
      s.lastQuery = query;
      if (!s.goal && !/^(你好|谢谢|天气|系统)$/.test(query)) s.goal = query;
    });
    renderResults(query);
    updateChrome();
    whisper();
    matchInput(query, { submitted: true });
  }
  function home() {
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
    panel.hidden = !s.flags.includes("staff") || !!s.ending;
    panel.innerHTML = `<h2>特殊人员认领申请</h2><p>员工站附件关联到客服 0001 的人员认领。这不是你失物的领取单。${s.flags.includes("verified") ? "你已经完成归档关系核验。" : "资料尚未全部核对，可以继续调查后再决定。"}</p><a href="archive-room.html">回归档室核对材料 &gt;&gt;</a><form id="claim-form" class="claim-form"><label>认领对象<input value="小鹿 / 客服 0001" readonly></label><label>认领人姓名<input name="name" required maxlength="30" autocomplete="off"></label><label class="claim-terms">认领人承担该对象在系统中遗留的全部责任、义务与岗位职责。提交前将再次核对。</label><button class="record-action" type="submit">核对并准备签署</button><button class="text-link" type="button" id="leave">放弃本次认领</button></form>`;
  }
  function renderMine() {
    document.body.classList.add("notebook-mode");
    $("#suggestions").hidden = true;
    clearMatch();
    const s = store.read();
    $("#results-title").textContent = "我的 · 已收集线索";
    $("#result-meta").hidden = true;
    const entries = s.clues.filter(
      (c) =>
        mineFilter === "all" ||
        (mineFilter === "starred" && c.starred) ||
        c.kind === mineFilter,
    );
    $("#results").innerHTML =
      `<section class="notebook"><div class="notebook-top"><p>这里保存已经取得的材料。个人备注仅代表推测，不会自动解锁剧情。</p><button class="text-link" id="notebook-return">返回查阅 &gt;&gt;</button></div><div class="notebook-tabs">${[
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
        )}</div><div class="compare-toolbar"><span id="compare-count">已选 ${selected.length} / 2 份材料</span><button id="compare-files" ${selected.length !== 2 ? "disabled" : ""}>并排对照</button><button id="new-note">写一条笔记</button></div>${mineFilter !== "note" ? entries.map((c) => `<article class="notebook-card"><div class="notebook-card-head"><span>${label[c.kind]}</span><button data-star="${esc(c.id)}" aria-pressed="${c.starred}">${c.starred ? "★ 已标重点" : "☆ 标记重点"}</button></div><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><small>来源：${esc(c.source)}</small>${c.note ? `<blockquote>我的备注：${esc(c.note)}</blockquote>` : ""}<div class="notebook-card-actions"><button data-file="${esc(c.id)}">查看副本 / 备注</button>${c.url ? `<a href="${esc(c.url)}">来源页面 &gt;&gt;</a>` : ""}<label><input type="checkbox" data-compare="${esc(c.id)}" ${selected.includes(c.id) ? "checked" : ""}> 选入对照</label></div></article>`).join("") : ""}${["all", "note", "starred"].includes(mineFilter) && mineFilter !== "starred" ? s.notes.map((n) => `<article class="notebook-card personal-note"><span>个人推测</span><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p></article>`).join("") : ""}${!(mineFilter === "note" ? s.notes.length : entries.length + (mineFilter === "all" ? s.notes.length : 0)) ? '<div class="empty"><h3>这个分类还没有材料</h3><p>打开异常登记、附件或员工站文件，取得的材料会出现在这里。</p></div>' : ""}</section>`;
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
      `<h2>两份已取得材料</h2><div class="comparison-columns">${files.map((c) => `<section><h3>${esc(c.title)}</h3>${fileBody(c)}</section>`).join("")}</div>${keys.length ? `<table class="comparison-table"><thead><tr><th>字段</th>${files.map((c) => `<th>${esc(c.title)}</th>`).join("")}</tr></thead><tbody>${keys.map((k) => `<tr><th>${esc(k)}</th>${files.map((c) => `<td>${esc(c.fields.find((x) => x[0] === k)?.[1] || "未记录")}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}<p>对照不会替你作出判断。可以把推测写进每份材料的备注。</p>`,
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
    if (b.dataset.search) {
      e.preventDefault();
      search(b.dataset.search);
    }
    if (b.dataset.nav) {
      e.preventDefault();
      if (b.dataset.nav === "mine") renderMine();
      else if (["home", "all"].includes(b.dataset.nav)) home();
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
        `<h2>未分类登记 / 0001</h2>${fileBody(data.files.anomaly)}<a class="record-action" href="trace.html">打开登记修订记录 &gt;&gt;</a><p>原始附件仍保留，可以从来源继续核对。</p>`,
      );
      updateChrome();
    }
    if (b.dataset.item) {
      const item = [...store.read().registrations, ...data.items].find(
        (x) => x.id === b.dataset.item,
      );
      if (item)
        modal(
          "失物详情",
          `<h2>${esc(item.name)}</h2><p>${esc(item.description)}</p><p>拾获地点：${esc(item.place)}</p><p>请先核对特征，示例登记不一定属于你。</p>`,
        );
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
        ? "核对图纸上保留的编号，并把同一人的两份记录放在一起看。"
        : has("trace")
          ? "附件中的姓名、班次、编号和日期并不在同一份材料里。可以先收入“我的”再对照。"
          : "先核对物品结果中那条缺少名称的登记，来源和正文可能不在同一页。";
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
  $("#show-all").addEventListener("click", home);
  $("#ending").addEventListener("cancel", (e) => {
    e.preventDefault();
    $("#ending").close();
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== store.key) return;
    document.body.classList.contains("notebook-mode") ? renderMine() : home();
  });
  $("#modal").addEventListener("close", () => {
    pendingChoice = null;
  });
  home();
  syncAssist();
  if (store.read().lastQuery) search(store.read().lastQuery);
  if (location.hash === "#mine") renderMine();
  if (!store.read().introduced) $("#intro").showModal();
  if (
    location.hash === "#application" &&
    store.read().flags.includes("staff")
  ) {
    $("#application-panel").scrollIntoView?.({ block: "start" });
    whisper();
  }
})();
