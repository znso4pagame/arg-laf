(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    root.DANNY = factory();
    root.DANNY.boot(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const fold = (v) =>
    String(v ?? "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[\s-]/g, "");
  function fingerprint(value) {
    let hash = 2166136261;
    for (const c of value) {
      hash ^= c.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  // 虚构凭证谜题，不是身份认证；仅保留剧情校验值，不保存输入口令。
  const checkCredentials = (a, p) =>
    fingerprint(a.trim().toLowerCase() + ":" + p.trim()) === "844aa959";
  const checkDifferences = (values) =>
    values.length === 2 &&
    values.includes("state") &&
    values.includes("department");
  const checkPair = (a, b) =>
    new Set([a, b]).size === 2 &&
    [a, b].every((x) => ["municipalA", "municipalB"].includes(x));
  const checkChain = (a, b, c) =>
    fold(a) === "q17" && fold(b) === "q17" && fold(c) === "岗位职责";
  function boot(w) {
    const d = w.document,
      $ = (s) => d.querySelector(s),
      store = w.ZHAOHUI_JOURNEY,
      data = w.ZHAOHUI,
      files = data.files,
      index = w.ZHAOHUI_SEARCH;
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
    const flag = (id) => store.read().flags.includes(id),
      has = (id) => store.read().clues.some((c) => c.id === id);
    const staff = () => {
      try {
        return (
          w.sessionStorage.getItem("harrow-session") === "danny-private-v3" &&
          (w.sessionStorage.getItem("harrow-run-token") || "initial") ===
            store.read().runToken &&
          flag("staff")
        );
      } catch {
        return false;
      }
    };
    let active = "journal",
      pair = store.read().danny.pair.slice(),
      transitionTimer = null,
      composing = false,
      lastReadKey = "",
      returnAfterLogin = null,
      observedProgress = "",
      toolDrafts = {},
      observedRun = store.read().runToken;
    const status = (text) => ($("#site-status").textContent = text);
    const canRead = (key) => {
      const f = files[key];
      return (
        !!f?.tab &&
        (f.access === "guest" ||
          (staff() &&
            ((f.access === "staff" &&
              (key !== "conversation" || flag("timeline"))) ||
              (f.access === "archive" &&
                flag("cabinet") &&
                (key !== "clause" || flag("compared"))))))
      );
    };
    const restarting = () =>
      store.read().runToken !== "initial" && !store.read().introduced;
    function adoptRun() {
      const state = store.read();
      if (state.runToken === observedRun) return false;
      observedRun = state.runToken;
      try {
        w.sessionStorage.removeItem("harrow-session");
        w.sessionStorage.removeItem("harrow-run-token");
      } catch {}
      toolDrafts = {};
      pair = state.danny.pair.slice();
      returnAfterLogin = null;
      $("#site-search").value = state.danny.query;
      w.clearTimeout(transitionTimer);
      $("#archive-transition").hidden = true;
      if ($("#restart-dialog").open) $("#restart-dialog").close();
      return true;
    }
    function startGate() {
      adoptRun();
      chrome();
      $("#site-main").classList.remove("split-reading");
      $("#site-main").innerHTML =
        '<h2>本轮调查尚未开始</h2><p>注销已完成。请先回找回网的开场引导，开始新一轮调查。</p><a class="restart-entry" href="index.html#home">从开场重新开始 &gt;&gt;</a>';
    }
    const available = () =>
      Object.entries(files)
        .filter(([key]) => canRead(key) && key !== "door-back")
        .map(([key, f]) => ({ ...f, key }));
    function progressSignature() {
      return staff()
        ? ["cabinet", "compared", "timeline", "verified"].map(flag).join("|")
        : "guest";
    }
    function refreshReadMarkers() {
      d.querySelectorAll(".entry-list [data-read]").forEach((b) => {
        const seen = has(files[b.dataset.read].id),
          row = b.closest("article");
        row.classList.toggle("is-read", seen);
        row.querySelector(".read-marker").hidden = !seen;
      });
    }
    function chrome({ reading = false } = {}) {
      const logged = staff();
      observedProgress = progressSignature();
      let guide = $("#journey-guide");
      if (!guide) {
        guide = d.createElement("section");
        guide.id = "journey-guide";
        guide.className = "journey-guide";
        guide.setAttribute("aria-label", "当前调查目标");
        $(".site-grid").before(guide);
      }
      w.ZHAOHUI_GUIDE.render(guide, store.read(), {
        page: "danny",
        staffSession: logged,
        reading,
      });
      $("#permission-label").textContent = logged
        ? "员工模式 / Danny"
        : "游客浏览";
      $("#logout").hidden = !logged;
      $("#account-nav").textContent = logged ? "账户" : "访客入口";
      $("#archive-nav").hidden = !logged || !flag("cabinet");
      $("#search-scope").textContent = logged
        ? "范围：公开内容与已开放的工作材料"
        : "范围：公开内容";
      d.body.classList.toggle("employee-mode", logged);
      d.body.classList.toggle(
        "archive-mode",
        active === "archive" && logged && flag("cabinet"),
      );
      d.querySelectorAll("[data-tab]").forEach((a) => {
        if (a.dataset.tab === active) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    }
    const body = (f) =>
      `${f.fields?.length ? `<dl class="record-fields">${f.fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}${f.image ? `<div class="image-viewer"><div class="image-tools"><span>扫描附件</span><button type="button" data-zoom="-1" aria-label="缩小图片">－</button><span class="zoom-level">100%</span><button type="button" data-zoom="1" aria-label="放大图片">＋</button><a href="${esc(f.image)}" target="_blank" rel="noopener">原图 ↗</a></div><div class="image-viewport"><a class="image-link" href="${esc(f.image)}" target="_blank" rel="noopener"><img src="${esc(f.image)}" alt="${esc(f.title)}"></a></div></div>` : ""}<div class="entry-prose">${(f.body || []).map((line) => `<p>${esc(line)}</p>`).join("")}</div>`;
    function listing(entries) {
      return entries.length
        ? `<div class="entry-list">${entries.map((f) => `<article class="${has(f.id) ? "is-read" : ""}"><span class="entry-date">${esc(f.date || "旧存档")} · ${esc(f.author || "Danny")} · ${esc(f.kind === "image" ? "相片" : "文字")}<span class="read-marker" ${has(f.id) ? "" : "hidden"}>已读</span></span><h3><button data-read="${esc(f.key)}">${esc(f.title)}</button></h3><p>${esc(f.summary)}</p></article>`).join("")}</div>`
        : '<p class="quiet-empty">没有找到可查阅的记录。</p>';
    }
    function reader() {
      return '<article id="reading-pane" class="reading-pane" tabindex="-1" hidden></article>';
    }
    function read(key, { remember = true, focus = true } = {}) {
      if (restarting()) {
        startGate();
        return;
      }
      if (!canRead(key)) {
        status("此材料尚不在当前可查阅范围。");
        return;
      }
      const f = files[key];
      lastReadKey = key;
      if (!$("#reading-pane"))
        $("#site-main").insertAdjacentHTML("beforeend", reader());
      const pane = $("#reading-pane");
      pane.hidden = false;
      $("#site-main").classList.toggle(
        "split-reading",
        ["journal", "photos", "guestbook", "search"].includes(active),
      );
      pane.innerHTML = `<div class="reading-head"><span>${esc(f.source)}</span><button id="close-reading">收起</button></div><h2>${esc(f.title)}</h2>${body(f)}${["door-front", "door-back"].includes(key) ? `<button data-read="${key === "door-front" ? "door-back" : "door-front"}" class="flip-photo">${key === "door-front" ? "翻到背面" : "翻回正面"}</button>` : ""}${key === "intake" ? '<p><a href="index.html#application">原登记系统 / 人员申请附件</a></p>' : ""}<p class="save-note">本份材料已保存在“我的”。</p>`;
      store.collect({ ...f, url: "danny.html#" + f.tab + "--" + f.id });
      const row = d
        .querySelector('.entry-list [data-read="' + key + '"]')
        ?.closest("article");
      if (row) {
        row.classList.add("is-read");
        row.querySelector(".read-marker").hidden = false;
      }
      if (remember) {
        const target = "#" + active + "--" + f.id;
        if (w.location.hash !== target) w.history.pushState(null, "", target);
      }
      if (key === "intake") store.collect(files.anomaly);
      w.ZHAOHUI_GUIDE.render($("#journey-guide"), store.read(), {
        page: "danny",
        staffSession: staff(),
        reading: true,
      });
      status("已保存：" + f.title);
      if (focus) {
        pane.focus({ preventScroll: true });
        pane.scrollIntoView?.({ block: "nearest" });
      }
    }
    function account() {
      return `<h2>个人站账户</h2>${staff() ? '<p>已建立员工会话。公开随记仍可照常浏览，馆务镜像保存在工作匣。</p><a href="#work" data-tab="work">打开工作匣</a>' : `<p>游客可以阅读公开随记、相册和旧留言。工作匣沿用馆务员工账户。</p><form id="login-form"><label>员工账号<input name="account" required maxlength="60" autocomplete="off" spellcheck="false"></label><label>口令<input name="password" type="password" required maxlength="60" autocomplete="off"></label><button>建立员工会话</button></form><p id="login-status" role="status"></p><details class="personal-reminder"><summary>本人留存的口令备忘</summary><p>四行雨的开头，接第一次正式开门的那天。字母小写，日期只留月日四位，连着写。</p><p class="fine">照片背面别丢了。工牌上的数字已经不用。</p></details>`}<label class="check"><input id="reduced-effects" type="checkbox" ${store.read().settings.reduced ? "checked" : ""}> 减少页面突变效果</label><p class="fine">虚构账号谜题，请勿输入现实账号或口令。员工会话仅保留在当前浏览器标签页。</p>`;
    }
    function timelineTool() {
      const saved = store.read().danny;
      return `<section class="timeline-tool"><div class="tool-heading"><span>LOG REPAIR / 2019.11.03</span><h3>校订值勤流水</h3></div><p>会话包未能自动合并。请按当班实际发生的先后重新编排，取消不属于这一天的记录。时间需以馆钟统一。</p><ol id="timeline-events">${saved.timeline.map((id, i) => `<li draggable="true" data-event="${id}"><span class="event-grip" aria-hidden="true">⠿</span><label><input type="checkbox" data-include="${id}" ${saved.included.includes(id) ? "checked" : ""}><span>${w.DANNY_TIMELINE.events.find((e) => e.id === id).label}</span></label><span class="event-controls"><button type="button" data-move="${id}" data-direction="-1" aria-label="上移记录" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-move="${id}" data-direction="1" aria-label="下移记录" ${i === saved.timeline.length - 1 ? "disabled" : ""}>↓</button></span></li>`).join("")}</ol><button type="button" id="check-timeline">${flag("timeline") ? "重新核对排列" : "校订并合并会话包"}</button><p id="timeline-status" role="status">${flag("timeline") ? "会话包已恢复，正文保存在工作匣中。" : ""}</p>${flag("timeline") ? '<button data-read="conversation">打开修复的查询会话</button>' : ""}</section>`;
    }
    function moveEvent(id, beforeId, delta) {
      store.update((state) => {
        const order = state.danny.timeline,
          from = order.indexOf(id);
        if (from < 0) return;
        const to = beforeId ? order.indexOf(beforeId) : from + delta;
        if (to < 0 || to >= order.length || to === from) return;
        order.splice(from, 1);
        order.splice(to, 0, id);
      });
      route("work");
      const button = d.querySelector('[data-move="' + id + '"]');
      button?.focus({ preventScroll: true });
    }
    function cabinetForm() {
      return `<section class="cabinet-box"><h3>馆务镜像 / 旧柜检索</h3><p>部分纸本材料尚未编入目录。按旧柜标签调取。</p><form id="cabinet-form"><label>旧柜编号<input name="code" required maxlength="16" autocomplete="off"></label><button>调取</button></form><p id="cabinet-status" role="status"></p>${flag("cabinet") ? '<a href="#archive" data-tab="archive">打开已调取的旧柜</a>' : ""}</section>`;
    }
    function archive() {
      return `<h2>旧柜 / 结构项目</h2><p class="fine">扫描批次 5003 · 封套与附页保持原始顺序</p>${listing(available().filter((f) => f.tab === "archive"))}<section class="comparison-tool"><h3>附件并置</h3><p>选取属于同一事件的原件与移交副本，记录发生变化的字段。</p><div class="compare-selectors">${["left", "right"].map((side, i) => `<label>${i ? "右侧材料" : "左侧材料"}<select id="compare-${side}"><option value="">选择材料</option>${["municipalA", "municipalB", "renovation", "inventory"].map((key) => `<option value="${key}" ${pair[i] === key ? "selected" : ""}>${esc(files[key].title)}</option>`).join("")}</select></label>`).join("")}</div><div class="comparison-columns"><article id="compare-doc-left"></article><article id="compare-doc-right"></article></div><form id="difference-form"><fieldset><legend>发生变化的字段（可多选）</legend>${[
        ["name", "姓名"],
        ["project", "项目编号"],
        ["date", "日期"],
        ["state", "结案状态"],
        ["department", "处理部门"],
        ["location", "地点"],
      ]
        .map(
          ([v, t]) =>
            `<label class="check"><input type="checkbox" name="difference" value="${v}"> ${t}</label>`,
        )
        .join(
          "",
        )}</fieldset><button>保存字段核对</button></form><p id="difference-status" role="status"></p>${flag("compared") ? '<button data-read="clause">查阅移交附则</button>' : ""}</section><section class="chain-box"><h3>附页关系登记</h3><p>签收凭据和后续登记之间有一处相同的人员标识。按原字段填写，不必写整句推测。</p><form id="chain-form"><label>签收凭据中的签收人<input name="signer" required maxlength="80" autocomplete="off"></label><label>后续登记中的物品名称<input name="subject" required maxlength="80" autocomplete="off"></label><label>特殊认领移交的事项<input name="inheritance" required maxlength="80" autocomplete="off"></label><button>核对关联</button></form><p id="chain-status" role="status"></p><div id="truth-result" ${flag("verified") ? "" : "hidden"}>${flag("verified") ? body(files.truth) + '<a href="index.html#application">返回找回网 / 待决定的申请</a>' : ""}</div></section>${reader()}`;
    }
    function toolElement(code) {
      const selectors = {
        catalog: ".entry-list",
        account: "#login-form",
        timeline: ".timeline-tool",
        cabinet: ".cabinet-box",
        compare: ".comparison-tool",
        relation: ".chain-box",
        reader: "#reading-pane",
      };
      return selectors[code] ? $(selectors[code]) : null;
    }
    function focusTool(code) {
      const target = toolElement(code) || $("#site-main");
      if (target) {
        if (!target.matches("input,button,a,select,textarea"))
          target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        target.scrollIntoView?.({ block: "start" });
      }
    }
    function captureDrafts() {
      if (!staff()) return;
      for (const [id, names] of Object.entries({
        "cabinet-form": ["code"],
        "chain-form": ["signer", "subject", "inheritance"],
      })) {
        const form = $("#" + id);
        if (form)
          toolDrafts[id] = Object.fromEntries(
            names.map((name) => [name, form.elements[name].value]),
          );
      }
    }
    function restoreDrafts() {
      for (const [id, values] of Object.entries(toolDrafts)) {
        const form = $("#" + id);
        if (form)
          for (const [name, value] of Object.entries(values))
            form.elements[name].value = value;
      }
    }
    function navigate(target) {
      if (restarting()) {
        startGate();
        return;
      }
      const [section, entry] = target.split("--");
      if (section === active) {
        if (entry?.startsWith("tool-") && toolElement(entry.slice(5))) {
          focusTool(entry.slice(5));
          return;
        }
        const key = Object.keys(files).find((key) => files[key].id === entry);
        if (key && canRead(key) && $(".entry-list")) {
          read(key, { remember: false });
          return;
        }
        if (!entry && $(".entry-list")) {
          if ($("#reading-pane")) $("#reading-pane").hidden = true;
          $("#site-main").classList.remove("split-reading");
          focusTool("catalog");
          return;
        }
      }
      route(target);
    }
    function route(target, { focusEntry = true } = {}) {
      adoptRun();
      if (restarting()) {
        toolDrafts = {};
        returnAfterLogin = null;
        startGate();
        return;
      }
      if (!has("trace")) {
        store.collect(files.trace);
        store.mark("trace");
      }
      captureDrafts();
      const [tab, entryId] = String(target).split("--");
      active = [
        "journal",
        "photos",
        "guestbook",
        "work",
        "archive",
        "account",
        "search",
      ].includes(tab)
        ? tab
        : "journal";
      chrome();
      $("#site-main").classList.remove("split-reading");
      let html = "";
      if (active === "account") html = account();
      else if (active === "work")
        html = staff()
          ? '<h2>工作匣</h2><p class="fine">馆务镜像 / 私人草稿与值勤材料混存</p>' +
            listing(available().filter((f) => f.tab === "work")) +
            timelineTool() +
            cabinetForm() +
            reader()
          : '<h2>工作匣</h2><p>这部分没有开放给游客。</p><a href="#account" data-tab="account">账户入口</a>';
      else if (active === "archive") {
        html =
          staff() && flag("cabinet")
            ? archive()
            : '<h2>旧柜未调取</h2><p>请先在工作匣建立旧柜索引。</p><a href="#work" data-tab="work">返回工作匣</a>';
      } else if (active === "search") {
        const results = index.matches($("#site-search").value, available());
        html =
          '<h2>站内查找</h2><p class="fine">仅列出当前权限可阅读的记录。</p>' +
          listing(results) +
          reader();
      } else
        html =
          `<h2>${{ journal: "随记", photos: "相册", guestbook: "留言簿" }[active]}</h2><p class="fine">${{ journal: "有些日子只写了两句。", photos: "相纸、票据和旧物，按扫描顺序放着。", guestbook: "旧站迁移留下的留言。新留言已关闭。" }[active]}</p>` +
          listing(available().filter((f) => f.tab === active)) +
          reader();
      $("#site-main").innerHTML = html;
      restoreDrafts();
      if (active === "archive" && staff() && flag("cabinet")) {
        renderPair();
        transition();
      }
      if (
        entryId &&
        /^tool-(timeline|cabinet|compare|relation)$/.test(entryId)
      ) {
        if (!staff()) returnAfterLogin = active + "--" + entryId;
        if (focusEntry) focusTool(entryId.slice(5));
      } else if (entryId) {
        const key = Object.keys(files).find((key) => files[key].id === entryId);
        if (key && !canRead(key) && !staff() && files[key].access !== "guest")
          returnAfterLogin = active + "--" + entryId;
        if (key) read(key, { remember: false, focus: focusEntry });
      }
    }
    function go(tab) {
      if (w.location.hash === "#" + tab) return;
      const [section, entry] = tab.split("--");
      const localTool =
        section === active &&
        entry?.startsWith("tool-") &&
        toolElement(entry.slice(5));
      w.history.pushState(null, "", "#" + tab);
      if (!localTool) navigate(tab);
    }
    function renderPair() {
      for (let i = 0; i < 2; i++) {
        const side = i ? "right" : "left",
          key = pair[i],
          node = $("#compare-doc-" + side);
        if (!node) continue;
        if (key && canRead(key)) {
          node.innerHTML =
            "<h4>" + esc(files[key].title) + "</h4>" + body(files[key]);
          store.collect(files[key]);
        } else node.replaceChildren();
      }
    }
    function transition() {
      if (flag("scare-seen")) return;
      store.mark("scare-seen");
      let reduced = store.read().settings.reduced;
      try {
        reduced =
          reduced || w.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {}
      if (!reduced) {
        $("#archive-transition").hidden = false;
        transitionTimer = w.setTimeout(
          () => ($("#archive-transition").hidden = true),
          850,
        );
      }
    }
    d.addEventListener("click", (e) => {
      const b = e.target.closest("button,a");
      if (!b) return;
      if (b.id === "restart-game") $("#restart-dialog").showModal();
      if (b.id === "cancel-restart" || b.id === "keep-playing")
        $("#restart-dialog").close();
      if (b.id === "confirm-restart") {
        store.reset();
        try {
          w.sessionStorage.removeItem("harrow-session");
          w.sessionStorage.removeItem("harrow-run-token");
        } catch {}
        toolDrafts = {};
        pair = ["", ""];
        returnAfterLogin = null;
        w.clearTimeout(transitionTimer);
        $("#archive-transition").hidden = true;
        $("#restart-dialog").close();
        startGate();
        return;
      }
      const local =
        b.tagName === "A" &&
        /^danny\.html#([a-z0-9-]+)$/.exec(b.getAttribute("href") || "");
      if (local && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        go(local[1]);
        focusTool(b.dataset.guideFocus);
      }
      if (b.dataset.tab) {
        e.preventDefault();
        go(b.dataset.tab);
      }
      if (b.dataset.read) read(b.dataset.read);
      if (b.dataset.zoom) {
        const viewer = b.closest(".image-viewer"),
          img = viewer.querySelector("img");
        const scale = Math.max(
          1,
          Math.min(
            3,
            (Number(viewer.dataset.scale) || 1) + Number(b.dataset.zoom) * 0.5,
          ),
        );
        viewer.dataset.scale = scale;
        img.style.width = scale * 100 + "%";
        img.style.maxWidth = "none";
        viewer.querySelector(".zoom-level").textContent = scale * 100 + "%";
      }
      if (b.dataset.move && staff())
        moveEvent(b.dataset.move, null, Number(b.dataset.direction));
      if (b.id === "check-timeline" && staff()) {
        const saved = store.read().danny;
        if (!w.DANNY_TIMELINE.check(saved.timeline, saved.included)) {
          $("#timeline-status").textContent =
            "当前排列不能合并。请核对记录所属日期，以及两种钟表之间的偏差。";
          return;
        }
        store.mark("timeline");
        route("work");
        status("值勤流水校订完成，查询会话已恢复。");
      }
      if (b.id === "close-reading") {
        $("#reading-pane").hidden = true;
        $("#site-main").classList.remove("split-reading");
        w.history.replaceState(null, "", "#" + active);
        const origin =
          d.querySelector('.entry-list [data-read="' + lastReadKey + '"]') ||
          $("#site-main");
        origin.focus({ preventScroll: true });
        origin.scrollIntoView?.({ block: "nearest" });
      }
      if (b.id === "logout") {
        try {
          w.sessionStorage.removeItem("harrow-session");
          w.sessionStorage.removeItem("harrow-run-token");
        } catch {}
        pair = ["", ""];
        toolDrafts = {};
        w.clearTimeout(transitionTimer);
        $("#archive-transition").hidden = true;
        route("journal");
        w.history.replaceState(null, "", "#journal");
        status("已退出员工模式。");
      }
    });
    let dragged = null;
    d.addEventListener("dragstart", (e) => {
      const row = e.target.closest("[data-event]");
      if (!row || !staff()) return;
      dragged = row.dataset.event;
      e.dataTransfer?.setData("text/plain", dragged);
    });
    d.addEventListener("dragover", (e) => {
      if (dragged && e.target.closest("[data-event]")) e.preventDefault();
    });
    d.addEventListener("drop", (e) => {
      const row = e.target.closest("[data-event]");
      if (!row || !dragged || !staff()) return;
      e.preventDefault();
      moveEvent(dragged, row.dataset.event, 0);
      dragged = null;
    });
    d.addEventListener("dragend", () => (dragged = null));
    d.addEventListener("change", (e) => {
      if (e.target.dataset.include && staff()) {
        store.update((s) => {
          const ids = s.danny.included,
            id = e.target.dataset.include;
          s.danny.included = e.target.checked
            ? [...new Set([...ids, id])]
            : ids.filter((x) => x !== id);
        });
      }
      if (e.target.id === "reduced-effects") {
        store.update((s) => (s.settings.reduced = e.target.checked));
        if (e.target.checked) $("#archive-transition").hidden = true;
      }
      if (e.target.id === "compare-left" || e.target.id === "compare-right") {
        pair[e.target.id === "compare-left" ? 0 : 1] = e.target.value;
        store.update((s) => (s.danny.pair = pair.slice()));
        renderPair();
      }
    });
    d.addEventListener("submit", (e) => {
      const f = e.target;
      if (f.id === "site-search-form") {
        e.preventDefault();
        if (!composing) {
          store.update((s) => (s.danny.query = $("#site-search").value.trim()));
          go("search");
          status("站内查找：" + $("#site-search").value.trim());
        }
      }
      if (f.id === "login-form") {
        e.preventDefault();
        if (
          !checkCredentials(f.elements.account.value, f.elements.password.value)
        ) {
          $("#login-status").textContent =
            "凭证不匹配。旧记录可能已经失效，可以回看公开材料。";
          return;
        }
        try {
          w.sessionStorage.setItem("harrow-session", "danny-private-v3");
          w.sessionStorage.setItem("harrow-run-token", store.read().runToken);
          if (
            w.sessionStorage.getItem("harrow-session") !== "danny-private-v3" ||
            w.sessionStorage.getItem("harrow-run-token") !==
              store.read().runToken
          )
            throw Error("session");
        } catch {
          try {
            w.sessionStorage.removeItem("harrow-session");
            w.sessionStorage.removeItem("harrow-run-token");
          } catch {}
          $("#login-status").textContent =
            "无法建立本机会话，请允许会话存储后重试。";
          return;
        }
        f.elements.password.value = "";
        store.mark("staff");
        store.collect({ ...files.staff, url: "danny.html#work" });
        let destination = returnAfterLogin || "work";
        returnAfterLogin = null;
        if (destination.startsWith("archive") && !flag("cabinet"))
          destination = "work";
        go(destination);
        status("员工会话已建立，已回到可查阅的位置。");
      }
      if (f.id === "cabinet-form") {
        e.preventDefault();
        if (!staff()) return;
        if (f.elements.code.value.trim() !== "5003") {
          $("#cabinet-status").textContent =
            "未找到这一批旧档。请核对图纸年代、适用范围和柜号制度。";
          return;
        }
        store.mark("cabinet");
        route("work");
        status("旧柜索引已调取，可在本站旧柜中查阅。");
      }
      if (f.id === "difference-form") {
        e.preventDefault();
        if (!staff() || !flag("cabinet")) return;
        const values = [...f.querySelectorAll("input:checked")].map(
          (x) => x.value,
        );
        if (!checkPair(...pair)) {
          $("#difference-status").textContent =
            "所选两份材料不是同一事件的原件与移交副本。请先核对姓名、项目和材料用途。";
          return;
        }
        if (!checkDifferences(values)) {
          $("#difference-status").textContent =
            "字段标记与所选材料不一致。相同字段无需标记。";
          return;
        }
        store.mark("compared");
        route("archive");
        status("字段核对已保存，附则现可查阅。");
      }
      if (f.id === "chain-form") {
        e.preventDefault();
        if (!staff() || !flag("cabinet")) return;
        if (
          !flag("compared") ||
          !flag("timeline") ||
          !["signed", "relist", "clause", "conversation"].every(has)
        ) {
          $("#chain-status").textContent =
            "原始材料尚未核对完整。请读凭据、后续登记、移交附则，以及校订后恢复的会话。";
          return;
        }
        if (
          !checkChain(
            f.elements.signer.value,
            f.elements.subject.value,
            f.elements.inheritance.value,
          )
        ) {
          $("#chain-status").textContent = "关联尚未成立，请以原件字段为准。";
          return;
        }
        store.mark("verified");
        store.collect(files.truth);
        route("archive");
        status("关联记录已存入“我的”。");
      }
    });
    $("#site-search").addEventListener(
      "compositionstart",
      () => (composing = true),
    );
    $("#site-search").addEventListener(
      "compositionend",
      () => (composing = false),
    );
    w.addEventListener("pageshow", (e) => {
      if (e.persisted) {
        if (!staff()) toolDrafts = {};
        route(w.location.hash.slice(1) || "journal", { focusEntry: false });
      }
    });
    w.addEventListener("hashchange", () => {
      navigate(w.location.hash.slice(1));
    });
    w.addEventListener("storage", (e) => {
      if (e.key === store.key) {
        const newRun = adoptRun();
        if (!flag("staff")) {
          toolDrafts = {};
          try {
            w.sessionStorage.removeItem("harrow-session");
            w.sessionStorage.removeItem("harrow-run-token");
          } catch {}
        }
        if (newRun || progressSignature() !== observedProgress)
          route(w.location.hash.slice(1) || active, { focusEntry: false });
        else {
          chrome({
            reading: !!$("#reading-pane") && !$("#reading-pane").hidden,
          });
          refreshReadMarkers();
        }
      }
    });
    $("#site-search").value = store.read().danny.query;
    if (!restarting()) {
      store.collect(files.trace);
      store.mark("trace");
    }
    route(w.location.hash.slice(1) || "journal");
  }
  return {
    fingerprint,
    checkCredentials,
    checkDifferences,
    checkPair,
    checkChain,
    boot,
  };
});
