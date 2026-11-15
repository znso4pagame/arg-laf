const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../..");
const makeStore = require("../journey-store.js");
const ops = require("../danny.js");
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
  const a = boot(t, "danny", local, session, "#account");
  a.set("[name=account]", "Danny.LATE");
  a.set("[name=password]", "west1103");
  a.submit("#login-form");
  assert.match(a.$("#permission-label").textContent, /员工/);
  return a;
}
function cabinet(t, local, session) {
  const a = login(t, local, session);
  a.set("[name=code]", "5003");
  a.submit("#cabinet-form");
  a.click("[data-tab=archive]");
  return a;
}
function choose(a, side, value) {
  a.set("#compare-" + side, value);
  a.$("#compare-" + side).dispatchEvent(
    new a.w.Event("change", { bubbles: true }),
  );
}
function compare(a) {
  choose(a, "left", "municipalA");
  choose(a, "right", "municipalB");
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
test("完整调查在 Danny 同一网页中从游客升级员工，读档对照后回主站决定", (t) => {
  const local = memory(),
    session = memory(),
    main = boot(t, "index", local, session);
  main.submit("#intro-form");
  assert.equal(main.$("[data-anomaly]"), null);
  main.search("胶卷");
  main.click('[data-item="0810"]');
  assert.equal(
    main.$(".source-details a").getAttribute("href"),
    "danny.html#journal",
  );
  assert.equal(main.$(".source-details").open, false);
  const site = boot(t, "danny", local, session);
  assert.match(site.$("#permission-label").textContent, /游客/);
  site.click("[data-read=rain]");
  const words = [...site.d.querySelectorAll(".entry-prose p")]
    .slice(0, 4)
    .map((x) => x.textContent[0])
    .join("")
    .toLowerCase();
  site.click("[data-tab=photos]");
  site.click("[data-read=door-front]");
  assert.equal(site.$("[data-read=door-back]").textContent, "翻到背面");
  site.click("[data-read=door-back]");
  assert.ok(site.state().clues.some((x) => x.id === "door-back"));
  const back = new JSDOM(
    fs.readFileSync(path.join(root, "assets/door-back.svg"), "utf8"),
    { contentType: "image/svg+xml" },
  );
  const date = back.window.document
    .querySelector("#first-night-date")
    .textContent.replace(/\D/g, "");
  back.window.close();
  site.click("[data-tab=guestbook]");
  site.click("[data-read=roster]");
  const shift = data.files.roster.fields
    .find(([key]) => key.startsWith("正式生效"))[1]
    .split(" · ")[0]
    .toLowerCase();
  site.click("[data-tab=account]");
  site.set("[name=account]", "danny." + shift);
  site.set("[name=password]", words + date);
  site.submit("#login-form");
  assert.equal(site.w.location.pathname, "/html/danny.html");
  assert.match(site.$("#site-main").textContent, /工作匣/);
  assert.ok(!JSON.stringify([...local.map]).includes("west1103"));
  for (const key of ["night", "plan", "intake", "draft"])
    site.click("[data-read=" + key + "]");
  assert.ok(site.state().clues.some((x) => x.id === "anomaly"));
  const plan = new JSDOM(
    fs.readFileSync(path.join(root, "assets/hall-plan.svg"), "utf8"),
    { contentType: "image/svg+xml" },
  );
  site.set(
    "[name=code]",
    plan.window.document.querySelector("#project-number").textContent.trim(),
  );
  plan.window.close();
  site.submit("#cabinet-form");
  site.click("[data-tab=archive]");
  compare(site);
  for (const key of ["signed", "relist", "clause"])
    site.click("[data-read=" + key + "]");
  chain(site);
  assert.equal(site.$("#truth-result").hidden, false);
  assert.ok(site.state().flags.includes("verified"));
  const final = boot(t, "index", local, session, "#application");
  assert.equal(final.$("#application-panel").hidden, false);
  final.set("#claim-form [name=name]", "归来者");
  final.submit("#claim-form");
  assert.equal(final.state().ending, "");
  final.click("#confirm-choice");
  assert.equal(final.state().ending, "claimed");
  final.click("#return-home");
  final.click("[data-nav=mine]");
  assert.match(final.$("#results").textContent, /归档关系核验结果/);
});
test("主页多种物品、同义词、地点、编号与描述可检索；入口不再跟随任意查询", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  for (const q of [
    "皮夹",
    "门匙",
    "雨伞",
    "胶卷",
    "证件套",
    "展览票",
    "0812",
    "白色",
    "旧馆站",
  ]) {
    a.search(q);
    assert.ok(a.d.querySelectorAll("[data-item]").length, q);
    assert.equal(a.$("[data-anomaly]"), null);
  }
  a.search("完全不相关的字符串");
  assert.equal(a.d.querySelectorAll("[data-item]").length, 0);
  assert.match(a.$("#results").textContent, /暂无匹配/);
  a.search("钱包");
  a.click('[data-item="0816"]');
  assert.equal(a.$(".source-details a"), null);
  a.click('.related-queries [data-search="旧馆站"]');
  assert.equal(a.$("#modal").open, false);
  assert.ok(a.$('[data-item="0807"]'));
  assert.ok(a.$('[data-item="0810"]'));
});
test("相机、证件套与票根各自保留同源入口，普通登记可保存至我的", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  for (const id of ["0810", "0808", "0807"]) {
    a.search(id);
    a.click('[data-item="' + id + '"]');
    assert.equal(
      a.$(".source-details a").getAttribute("href"),
      "danny.html#journal",
    );
    a.click('[data-save-record="' + id + '"]');
    a.click("#close-modal");
  }
  a.click("[data-nav=mine]");
  assert.equal(a.d.querySelectorAll(".notebook-card").length, 3);
  assert.ok(!a.state().clues.some((x) => x.id === "anomaly"));
});
test("游客可乱序阅读多个主题，但搜索与直访都不泄漏员工材料", (t) => {
  const local = memory(),
    session = memory(),
    a = boot(t, "danny", local, session, "#work");
  assert.ok(!a.$("[data-read=night]"));
  assert.match(a.$("#site-main").textContent, /没有开放/);
  a.set("#site-search", "Q-17");
  a.submit("#site-search-form");
  assert.equal(a.d.querySelectorAll("[data-read]").length, 0);
  a.click("[data-tab=journal]");
  assert.ok(a.d.querySelectorAll("[data-read]").length >= 5);
  a.click("[data-read=tea]");
  assert.match(a.$("#reading-pane").textContent, /维修单号/);
  assert.ok(!a.state().clues.some((x) => x.id === "night"));
  const b = boot(t, "danny", local, session, "#archive");
  assert.match(b.$("#site-main").textContent, /未调取/);
  assert.ok(!b.$("#difference-form"));
});
test("旧口令、旧班次和照片上传日期均不通过；正确凭证不需要虚假的收集数量门槛", (t) => {
  const a = boot(t, "danny", memory(), memory(), "#account");
  for (const [account, password] of [
    ["danny.night", "110317"],
    ["bluecoat", "west1103"],
    ["danny.night", "west1103"],
    ["danny.late", "west1109"],
    ["danny.late", "west1029"],
  ]) {
    a.set("[name=account]", account);
    a.set("[name=password]", password);
    a.submit("#login-form");
    assert.match(a.$("#login-status").textContent, /不匹配/);
    assert.equal(a.session.getItem("harrow-session"), null);
  }
  a.set("[name=account]", "DANNY.LATE");
  a.set("[name=password]", "west1103");
  a.submit("#login-form");
  assert.match(a.$("#permission-label").textContent, /员工/);
});
test("登录后同页搜索私有材料，刷新保留员工权限；退出后搜索恢复游客范围", (t) => {
  const local = memory(),
    session = memory(),
    a = login(t, local, session);
  a.set("#site-search", "西北角");
  a.submit("#site-search-form");
  assert.ok(a.d.querySelectorAll("[data-read]").length >= 3);
  a.click("[data-read=night]");
  const b = boot(t, "danny", local, session, "#work");
  assert.ok(b.$("[data-read=night]"));
  b.click("#logout");
  b.set("#site-search", "西北角");
  b.submit("#site-search-form");
  assert.equal(b.d.querySelectorAll("[data-read]").length, 0);
  assert.ok(b.state().clues.some((x) => x.id === "night"));
  assert.equal(
    boot(t, "danny", local, session, "#work").$("[data-read=night]"),
    null,
  );
});
test("旧会话不会绕过新版登录；旧线索与笔记保留", (t) => {
  const local = memory(),
    session = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.collect(data.files.badge);
  store.addNote("旧笔记", "保留");
  session.setItem("harrow-session", "danny");
  const a = boot(t, "danny", local, session, "#work");
  assert.equal(a.$("[data-read=night]"), null);
  assert.equal(a.state().notes[0].title, "旧笔记");
});
test("登录失败和访问工作匣不提前开放主站认领；实际读到查询快照后才出现", (t) => {
  const local = memory(),
    session = memory(),
    site = login(t, local, session);
  let main = boot(t, "index", local, session);
  assert.equal(main.$("#application-panel").hidden, true);
  site.click("[data-read=intake]");
  main = boot(t, "index", local, session);
  assert.equal(main.$("#application-panel").hidden, false);
});
test("干扰图纸编号不调取旧柜；选择错误材料或额外字段不开放附则", (t) => {
  const local = memory(),
    session = memory(),
    a = login(t, local, session);
  a.set("[name=code]", "5013");
  a.submit("#cabinet-form");
  assert.ok(!a.state().flags.includes("cabinet"));
  a.set("[name=code]", "5003");
  a.submit("#cabinet-form");
  a.click("[data-tab=archive]");
  choose(a, "left", "municipalA");
  choose(a, "right", "renovation");
  a.$("[value=state]").checked = true;
  a.$("[value=department]").checked = true;
  a.submit("#difference-form");
  assert.ok(!a.state().flags.includes("compared"));
  choose(a, "right", "municipalB");
  a.$("[value=name]").checked = true;
  a.submit("#difference-form");
  assert.ok(!a.state().flags.includes("compared"));
  a.$("[value=name]").checked = false;
  a.submit("#difference-form");
  assert.ok(a.$("[data-read=clause]"));
});
test("提前猜中终局关联也必须查阅原件，已核对状态可以刷新恢复", (t) => {
  const local = memory(),
    session = memory(),
    a = cabinet(t, local, session);
  chain(a);
  assert.ok(!a.state().flags.includes("verified"));
  compare(a);
  chain(a);
  assert.ok(!a.state().flags.includes("verified"));
  a.click("[data-read=clause]");
  const b = boot(t, "danny", local, session, "#archive");
  assert.ok(b.$("[data-read=clause]"));
  for (const key of ["signed", "relist"]) b.click("[data-read=" + key + "]");
  b.set("[name=signer]", "q17");
  b.set("[name=subject]", "Ｑ－１７");
  b.set("[name=inheritance]", "岗位职责");
  b.submit("#chain-form");
  assert.ok(b.state().flags.includes("verified"));
});
test("突变只在第一次调取后进入旧柜时出现，减少效果会即时生效", (t) => {
  const local = memory(),
    session = memory(),
    a = cabinet(t, local, session);
  assert.equal(a.$("#archive-transition").hidden, false);
  a.tick();
  assert.equal(a.$("#archive-transition").hidden, true);
  assert.equal(
    boot(t, "danny", local, session, "#archive").$("#archive-transition")
      .hidden,
    true,
  );
  const l = memory(),
    s = memory();
  makeStore(l).update((x) => (x.settings.reduced = true));
  assert.equal(cabinet(t, l, s).$("#archive-transition").hidden, true);
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
  assert.equal(a.$("[data-anomaly]"), null);
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
  const site = login(t, local, session);
  site.click("[data-read=intake]");
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
  assert.ok(ops.checkCredentials(" DANNY.LATE ", "west1103"));
  assert.equal(ops.checkCredentials("danny.night", "110318"), false);
  assert.equal(ops.checkDifferences(["state", "department", "name"]), false);
  assert.equal(ops.checkChain("Danny", "Q-17", "岗位职责"), false);
});
test("打包产物包含每个页面与全部本地依赖，源码无需构建即可加载", (t) => {
  const { buildSite } = require("../build-pages.cjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "arg-pages-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const manifest = buildSite(out);
  assert.ok(manifest["js/danny.js"]);
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

test("本机登记也可按描述检索和保存，来源不会伪装成公开窗口", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  a.click("[data-nav=register]");
  a.set("#register-form [name=name]", "绿色水杯");
  a.set("#register-form [name=place]", "林间小路");
  a.set("#register-form [name=description]", "杯盖有银色猫咪");
  a.submit("#register-form");
  a.search("猫咪");
  a.click("[data-item]");
  assert.match(a.$(".source-details").textContent, /本机演示/);
  a.click("[data-save-record]");
  a.click("#close-modal");
  a.click("[data-nav=mine]");
  assert.match(a.$("#results").textContent, /绿色水杯/);
  assert.match(a.state().clues[0].source, /本机/);
});
