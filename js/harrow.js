(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    root.HARROW = factory();
    root.HARROW.boot(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function fingerprint(value) {
    let hash = 2166136261;
    for (const c of value) {
      hash ^= c.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  const checkCredentials = (account, password) =>
    fingerprint(account.trim().toLowerCase() + ":" + password.trim()) ===
    "1da50c46";
  const checkDifferences = (values) =>
    values.length === 2 &&
    values.includes("state") &&
    values.includes("department");
  const checkChain = (a, b, c) =>
    a === "Q-17" && b === "Q-17" && c === "岗位职责";
  function boot(w) {
    const d = w.document,
      $ = (s) => d.querySelector(s),
      store = w.ZHAOHUI_JOURNEY,
      files = w.ZHAOHUI.files,
      page = d.body.dataset.page;
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
    const has = (id) => store.read().clues.some((c) => c.id === id),
      flag = (id) => store.read().flags.includes(id);
    const render = (f) =>
      `<h2 id="file-title">${esc(f.title)}</h2>${f.fields ? `<dl>${f.fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}${f.image ? `<a href="${esc(f.image)}" target="_blank" rel="noopener"><img class="evidence-image" src="${esc(f.image)}" alt="${esc(f.title)}"></a>` : ""}${(f.body || []).map((t) => `<p>${esc(t)}</p>`).join("")}`;
    function open(key) {
      const f = files[key];
      if (!f) return;
      store.collect(f);
      $("#file-content").innerHTML =
        render(f) +
        '<p class="fine">已收进“我的”，可以回找回网做备注或并排对照。</p>';
      if (!$("#file-dialog").open) $("#file-dialog").showModal();
    }
    let session = false;
    try {
      session = w.sessionStorage.getItem("harrow-session") === "danny";
    } catch {}
    const allowed =
      page === "trace"
        ? ["receipt"]
        : page === "desk" && session
          ? ["night", "draft", "plan"]
          : page === "archive" && session && flag("cabinet")
            ? ["signed", "relist", "clause"]
            : [];
    d.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.id === "close-file") $("#file-dialog").close();
      if (b.dataset.open && allowed.includes(b.dataset.open)) {
        if (b.dataset.open === "clause" && !flag("compared")) return;
        open(b.dataset.open);
      }
      if (page === "trace" && b.dataset.collect === "badge") {
        store.collect(files.badge);
        $("#page-status").textContent = "工牌图已收进“我的”。";
      }
      if (b.id === "logout") {
        try {
          w.sessionStorage.removeItem("harrow-session");
        } catch {}
        session = false;
        allowed.splice(0);
        $("#desk-content").hidden = true;
        $("#desk-locked").hidden = false;
      }
    });
    if (page === "trace") {
      store.mark("trace");
      store.collect(files.trace);
      $("#trace-record").innerHTML = render(files.trace);
    }
    if (page === "login") {
      store.collect(files.staff);
      $("#reduced-effects").checked = store.read().settings.reduced;
      $("#reduced-effects").addEventListener("change", (e) =>
        store.update((s) => (s.settings.reduced = e.target.checked)),
      );
      $("#login-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const f = e.target;
        if (
          !checkCredentials(f.elements.account.value, f.elements.password.value)
        ) {
          $("#login-status").textContent =
            "账号或口令不匹配。请核对工牌、首班回执和旧版规则。";
          $("#desk-link").hidden = true;
          return;
        }
        try {
          w.sessionStorage.setItem("harrow-session", "danny");
        } catch {
          $("#login-status").textContent =
            "无法建立本机会话，请允许当前页面使用会话存储后再登录。";
          return;
        }
        store.mark("staff");
        f.elements.password.value = "";
        $("#login-status").textContent = "旧版凭证验证通过。";
        $("#desk-link").hidden = false;
      });
    }
    if (page === "desk") {
      $("#desk-content").hidden = !session;
      $("#desk-locked").hidden = session;
      if (session) {
        $("#archive-link").hidden = !flag("cabinet");
        $("#cabinet-form").addEventListener("submit", (e) => {
          e.preventDefault();
          if (e.target.elements.code.value.trim() !== "5003") {
            $("#cabinet-status").textContent =
              "没有调取到这个档案柜。请回看夜班日志和楼层图。";
            return;
          }
          store.mark("cabinet");
          $("#cabinet-status").textContent = "已调取原始项目档案。";
          $("#archive-link").hidden = false;
        });
      }
    }
    if (page === "archive") {
      const access = session && flag("cabinet");
      $("#archive-content").hidden = !access;
      $("#archive-locked").hidden = access;
      if (!access) return;
      store.collect(files.municipalA);
      store.collect(files.municipalB);
      $("#document-a").innerHTML = render(files.municipalA).replace(
        'id="file-title"',
        "",
      );
      $("#document-b").innerHTML = render(files.municipalB).replace(
        'id="file-title"',
        "",
      );
      function unlock() {
        if (flag("compared")) {
          $("#clause-button").disabled = false;
          $("#clause-button").textContent = "特殊认领附则 / 可查阅";
        }
        if (flag("verified")) {
          $("#truth-result").hidden = false;
          $("#truth-result").innerHTML = render(files.truth).replace(
            'id="file-title"',
            "",
          );
        }
      }
      unlock();
      let reduced = store.read().settings.reduced;
      try {
        reduced =
          reduced || w.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {}
      if (!flag("scare-seen")) {
        store.mark("scare-seen");
        if (!reduced) {
          $("#archive-transition").hidden = false;
          w.setTimeout(() => ($("#archive-transition").hidden = true), 900);
        }
      }
      $("#difference-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const values = [...e.target.querySelectorAll("input:checked")].map(
          (x) => x.value,
        );
        if (!checkDifferences(values)) {
          $("#difference-status").textContent =
            "所选字段与两份记录不一致。姓名与编号也需要逐项核对。";
          return;
        }
        store.mark("compared");
        $("#difference-status").textContent = "差异已标记，关联附则可查阅。";
        unlock();
      });
      $("#chain-form").addEventListener("submit", (e) => {
        e.preventDefault();
        if (!flag("compared") || !["signed", "relist", "clause"].every(has)) {
          $("#chain-status").textContent =
            "还有原始凭据未查阅，请先完成差异核对，并打开两张凭据和认领附则。";
          return;
        }
        const f = e.target;
        if (
          !checkChain(
            f.elements.signer.value,
            f.elements.subject.value,
            f.elements.inheritance.value,
          )
        ) {
          $("#chain-status").textContent =
            "关联尚未成立。请核对签收人、物品名称与继受事项所在的原始字段。";
          return;
        }
        store.mark("verified");
        store.collect(files.truth);
        $("#chain-status").textContent = "关系核验完成，结果已收进“我的”。";
        unlock();
      });
    }
  }
  return { fingerprint, checkCredentials, checkDifferences, checkChain, boot };
});
