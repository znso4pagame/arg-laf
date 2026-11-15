const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../..");
const makeStore = require("../journey-store.js");
const ops = require("../harrow.js");
const data = require("../data.js");
function memory() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}
function boot(
  t,
  page = "index",
  local = memory(),
  session = memory(),
  hash = "",
) {
  const html = fs.readFileSync(path.join(root, "html", page + ".html"), "utf8");
  const dom = new JSDOM(html, {
      url: "https://arg.test/html/" + page + ".html" + hash,
      runScripts: "outside-only",
    }),
    w = dom.window,
    d = w.document,
    errors = [],
    timers = [];
  Object.defineProperty(w, "localStorage", { value: local });
  Object.defineProperty(w, "sessionStorage", { value: session });
  w.setTimeout = (fn) => {
    timers.push(fn);
    return timers.length;
  };
  w.clearTimeout = () => {};
  w.matchMedia = () => ({ matches: false });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  w.addEventListener("error", (e) => errors.push(e.error));
  for (const script of d.querySelectorAll("script[src]"))
    w.eval(
      fs.readFileSync(
        path.resolve(root, "html", script.getAttribute("src")),
        "utf8",
      ),
    );
  t.after(() => {
    assert.deepEqual(errors, []);
    w.close();
  });
  const $ = (s) => d.querySelector(s),
    click = (s) => {
      assert.ok($(s), "存在 " + s);
      $(s).click();
    },
    set = (s, v) => {
      $(s).value = v;
      $(s).dispatchEvent(new w.Event("input", { bubbles: true }));
    },
    submit = (s) =>
      $(s).dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
  return {
    w,
    d,
    $,
    click,
    set,
    submit,
    local,
    session,
    state: () => w.ZHAOHUI_JOURNEY.read(),
    tick: () => timers.splice(0).forEach((fn) => fn()),
    search: (q) => {
      set("#search", q);
      submit("#search-form");
    },
  };
}
function login(t, local, session) {
  const a = boot(t, "harrow-login", local, session);
  a.set("[name=account]", "Danny.NIGHT");
  a.set("[name=password]", "110317");
  a.submit("#login-form");
  assert.equal(a.$("#desk-link").hidden, false);
  return a;
}
function cabinet(t, local, session) {
  login(t, local, session);
  const a = boot(t, "harrow-desk", local, session);
  a.set("[name=code]", "5003");
  a.submit("#cabinet-form");
  return a;
}
function compare(a) {
  a.$("[value=state]").checked = true;
  a.$("[value=department]").checked = true;
  a.submit("#difference-form");
}
function chain(a) {
  a.set("[name=signer]", "Q-17");
  a.set("[name=subject]", "Q-17");
  a.set("[name=inheritance]", "岗位职责");
  a.submit("#chain-form");
}
test("整条新流程通过真实页面事件完成：附件、图文口令、柜号、差异、证据关联与终局", (t) => {
  const local = memory(),
    session = memory(),
    main = boot(t, "index", local, session);
  assert.ok(main.$("#intro").open);
  main.submit("#intro-form");
  main.click("[data-anomaly]");
  assert.equal(main.$("#modal-body a").getAttribute("href"), "trace.html");
  assert.ok(main.state().clues.some((x) => x.id === "anomaly"));
  const trace = boot(t, "trace", local, session);
  trace.click("[data-collect=badge]");
  trace.click("[data-open=receipt]");
  const badge = new JSDOM(
    fs.readFileSync(path.join(root, "assets/danny-badge.svg"), "utf8"),
    { contentType: "image/svg+xml" },
  );
  const account =
    badge.window.document
      .querySelector("#badge-name")
      .textContent.trim()
      .toLowerCase() +
    "." +
    badge.window.document
      .querySelector("#badge-shift")
      .textContent.trim()
      .toLowerCase();
  const date = data.files.receipt.fields.find((x) => x[0] === "首次值勤")[1];
  const password =
    date.slice(5).replace("-", "") +
    badge.window.document
      .querySelector("#badge-number")
      .textContent.trim()
      .slice(-2);
  badge.window.close();
  const auth = boot(t, "harrow-login", local, session);
  auth.set("[name=account]", account);
  auth.set("[name=password]", password);
  auth.submit("#login-form");
  assert.equal(auth.$("#desk-link").hidden, false);
  assert.equal(auth.$("[name=password]").value, "");
  const desk = boot(t, "harrow-desk", local, session);
  for (const key of ["night", "draft", "plan"])
    desk.click("[data-open=" + key + "]");
  const plan = new JSDOM(
    fs.readFileSync(path.join(root, "assets/hall-plan.svg"), "utf8"),
    { contentType: "image/svg+xml" },
  );
  desk.set(
    "[name=code]",
    plan.window.document.querySelector("#project-number").textContent.trim(),
  );
  plan.window.close();
  desk.submit("#cabinet-form");
  assert.equal(desk.$("#archive-link").hidden, false);
  const room = boot(t, "archive-room", local, session);
  assert.ok(room.$("#clause-button").disabled);
  room.submit("#difference-form");
  assert.ok(!room.state().flags.includes("compared"));
  compare(room);
  assert.equal(room.$("#clause-button").disabled, false);
  for (const key of ["signed", "relist", "clause"])
    room.click("[data-open=" + key + "]");
  chain(room);
  assert.ok(room.state().flags.includes("verified"));
  assert.equal(room.$("#truth-result").hidden, false);
  const back = boot(t, "index", local, session, "#application");
  assert.equal(back.$("#application-panel").hidden, false);
  assert.match(back.$("#suggestions").textContent, /没有找到/);
  back.set("#claim-form [name=name]", "测试玩家");
  back.submit("#claim-form");
  assert.equal(back.state().ending, "");
  back.click("#confirm-choice");
  assert.equal(back.state().ending, "claimed");
  assert.equal(back.state().name, "测试玩家");
  back.click("#return-home");
  back.click("[data-nav=mine]");
  assert.match(back.$("#results").textContent, /归档关系核验结果/);
  const reload = boot(t, "index", local, session);
  assert.equal(reload.state().ending, "claimed");
  assert.equal(reload.$("#application-panel").hidden, true);
  assert.match(reload.$("#results").textContent, /测试玩家/);
});
test("直接访问工作台和归档室不渲染受限材料", (t) => {
  const a = boot(t, "harrow-desk");
  assert.equal(a.$("#desk-content").hidden, true);
  a.click("[data-open=night]");
  assert.equal(a.$("#file-dialog").open, false);
  const b = boot(t, "archive-room");
  assert.equal(b.$("#archive-content").hidden, true);
  assert.equal(b.$("#document-a").textContent, "");
  b.click("[data-open=signed]");
  assert.equal(b.state().clues.length, 0);
});
test("口令错误不建立会话；登录退出后需要重新验证", (t) => {
  const local = memory(),
    session = memory(),
    a = boot(t, "harrow-login", local, session);
  a.set("[name=account]", "danny.night");
  a.set("[name=password]", "0417");
  a.submit("#login-form");
  assert.equal(session.getItem("harrow-session"), null);
  assert.ok(!a.state().flags.includes("staff"));
  login(t, local, session);
  assert.ok(!JSON.stringify([...local.map]).includes("110317"));
  const b = boot(t, "harrow-desk", local, session);
  b.click("#logout");
  b.click("[data-open=plan]");
  assert.equal(b.$("#file-dialog").open, false);
  assert.equal(
    boot(t, "harrow-desk", local, session).$("#desk-content").hidden,
    true,
  );
});
test("柜号错误不开放归档；仅猜中关联答案仍需原始材料", (t) => {
  const local = memory(),
    session = memory();
  login(t, local, session);
  const desk = boot(t, "harrow-desk", local, session);
  desk.set("[name=code]", "0417");
  desk.submit("#cabinet-form");
  assert.equal(desk.$("#archive-link").hidden, true);
  desk.set("[name=code]", "5003");
  desk.submit("#cabinet-form");
  const a = boot(t, "archive-room", local, session);
  chain(a);
  assert.ok(!a.state().flags.includes("verified"));
  compare(a);
  chain(a);
  assert.ok(!a.state().flags.includes("verified"));
  a.click("[data-open=clause]");
  assert.ok(a.state().clues.some((x) => x.id === "clause"));
});
test("多选错误字段不通过，正确核对和已读文件刷新后保留", (t) => {
  const local = memory(),
    session = memory();
  cabinet(t, local, session);
  const a = boot(t, "archive-room", local, session);
  a.$("[value=name]").checked = true;
  compare(a);
  assert.ok(!a.state().flags.includes("compared"));
  a.$("[value=name]").checked = false;
  compare(a);
  a.click("[data-open=signed]");
  const b = boot(t, "archive-room", local, session);
  assert.equal(b.$("#clause-button").disabled, false);
  assert.ok(b.state().clues.some((x) => x.id === "signed"));
});
test("突变只发生一次，可主动减少效果", (t) => {
  const local = memory(),
    session = memory();
  cabinet(t, local, session);
  const a = boot(t, "archive-room", local, session);
  assert.equal(a.$("#archive-transition").hidden, false);
  a.tick();
  assert.equal(a.$("#archive-transition").hidden, true);
  assert.equal(
    boot(t, "archive-room", local, session).$("#archive-transition").hidden,
    true,
  );
  const l = memory(),
    s = memory();
  makeStore(l).update((x) => (x.settings.reduced = true));
  cabinet(t, l, s);
  assert.equal(
    boot(t, "archive-room", l, s).$("#archive-transition").hidden,
    true,
  );
});
test("我的仅保存实际取得材料，可做备注、重点、笔记与两份对照", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.collect(data.files.badge);
  store.collect(data.files.receipt);
  store.collect(data.files.trace);
  const a = boot(t, "index", local, memory(), "#mine");
  assert.ok(a.d.body.classList.contains("notebook-mode"));
  assert.doesNotMatch(a.$("#results").textContent, /特殊认领附则/);
  a.click("[data-star=badge]");
  a.click("[data-file=badge]");
  a.set("#clue-note", "<script>推测</script>");
  a.click("#close-modal");
  a.click("[data-filter=starred]");
  assert.equal(a.d.querySelectorAll(".notebook-card").length, 1);
  a.click("[data-filter=all]");
  const boxes = [...a.d.querySelectorAll("[data-compare]")];
  for (const box of boxes) box.click();
  assert.equal(boxes[2].checked, false);
  a.click("#compare-files");
  assert.match(a.$("#modal-body").textContent, /两份已取得材料/);
  a.click("#close-modal");
  a.click("#new-note");
  a.set("[name=title]", "我自己的想法");
  a.set("[name=body]", "只是推测\n尚未证实");
  a.submit("#personal-note-form");
  assert.equal(a.state().notes.length, 1);
  assert.ok(!a.state().flags.includes("verified"));
  const b = boot(t, "index", local, memory(), "#mine");
  assert.match(b.$("#results").textContent, /我自己的想法/);
  b.click("[data-file=badge]");
  assert.equal(b.$("#clue-note").value, "<script>推测</script>");
  assert.equal(b.d.querySelectorAll("#modal-body script").length, 0);
});
test("线索辅助默认关闭，手动开启且不会匹配尚未取得的档案", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  a.set("#search", "钱包");
  assert.equal(a.$("#clue-match").hidden, true);
  a.click("#match-toggle");
  assert.equal(a.$("#clue-match").hidden, false);
  assert.match(a.$("#clue-match-results").textContent, /ABC/);
  a.set("#search", "特殊认领附则");
  assert.equal(a.$("#clue-match").hidden, true);
  a.search("钱包");
  a.click("[data-anomaly]");
  assert.ok(!a.state().clues.some((x) => x.id === "truth"));
});
test("输入法组词期间 Enter 不提交查询；提交后刷新保留查询", (t) => {
  const local = memory(),
    a = boot(t, "index", local);
  a.click("#intro-skip");
  a.$("#search").dispatchEvent(new a.w.Event("compositionstart"));
  a.set("#search", "钱包");
  a.submit("#search-form");
  assert.equal(a.state().lastQuery, "");
  a.$("#search").dispatchEvent(new a.w.Event("compositionend"));
  a.submit("#search-form");
  assert.equal(a.state().lastQuery, "钱包");
  assert.equal(boot(t, "index", local).$("#search").value, "钱包");
});
test("关闭终局确认不提交；放弃需确认，清档不触碰旧版存档", (t) => {
  const local = memory(),
    session = memory();
  local.setItem("zhaohui-story-v1", "old-save");
  login(t, local, session);
  const a = boot(t, "index", local, session);
  a.click("#intro-skip");
  a.click("#leave");
  a.click("#close-modal");
  assert.equal(a.state().ending, "");
  a.click("#leave");
  a.click("#confirm-choice");
  assert.equal(a.state().ending, "left");
  assert.match(a.$("#staff-count").textContent, /0/);
  a.click("#reset");
  a.click("#confirm-reset");
  assert.equal(a.state().ending, "");
  assert.equal(local.getItem("zhaohui-story-v1"), "old-save");
  assert.equal(session.getItem("harrow-session"), null);
  assert.ok(a.$("#intro").open);
});
test("存储写入被拒后继续使用内存；重复取得不覆盖个人备注", () => {
  const storage = memory(),
    store = makeStore(storage);
  store.collect(data.files.badge);
  store.annotate("badge", "推测");
  storage.setItem = () => {
    throw Error("quota");
  };
  store.star("badge");
  store.collect(data.files.badge);
  assert.equal(store.read().clues[0].note, "推测");
  assert.equal(store.read().clues[0].starred, true);
  store.reset();
  assert.equal(store.read().clues.length, 0);
});
test("终局存档不可重复覆盖，空姓名无法签署", () => {
  const store = makeStore(memory());
  store.mark("staff");
  store.finish("claimed", " ");
  assert.equal(store.read().ending, "");
  store.finish("left");
  store.finish("claimed", "张三");
  assert.equal(store.read().ending, "left");
});
test("口令、差异、证据算法拒绝相近错误答案", () => {
  assert.ok(ops.checkCredentials(" DANNY.NIGHT ", "110317"));
  assert.equal(ops.checkCredentials("danny.night", "110318"), false);
  assert.equal(ops.checkDifferences(["state", "department", "name"]), false);
  assert.equal(ops.checkChain("Danny", "Q-17", "岗位职责"), false);
});
test("打包产物包含每个页面与全部本地依赖，源码无需构建即可加载", (t) => {
  const { buildSite } = require("../build-pages.cjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "arg-pages-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const manifest = buildSite(out);
  assert.ok(manifest["js/harrow.js"]);
  for (const base of [root, out])
    for (const page of fs
      .readdirSync(path.join(base, "html"))
      .filter((x) => x.endsWith(".html"))) {
      const dom = new JSDOM(
        fs.readFileSync(path.join(base, "html", page), "utf8"),
      );
      for (const node of dom.window.document.querySelectorAll(
        "[src],a[href],link[href]",
      )) {
        const ref = node.getAttribute("src") || node.getAttribute("href");
        if (!ref || ref.startsWith("#") || /^(https?:|mailto:)/.test(ref))
          continue;
        assert.ok(
          fs.existsSync(path.resolve(base, "html", ref.split(/[?#]/)[0])),
          page + " -> " + ref,
        );
      }
      dom.window.close();
    }
  assert.ok(!fs.existsSync(path.join(out, "js/tests")));
  assert.ok(!fs.existsSync(path.join(out, "ARG storyline.docx")));
});
