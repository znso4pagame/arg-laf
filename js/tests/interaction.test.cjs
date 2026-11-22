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
  navigationState = null,
  motionOptions = null,
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
  if (navigationState)
    w.history.replaceState(navigationState, "", w.location.href);
  Object.defineProperty(w, "localStorage", { value: local });
  Object.defineProperty(w, "sessionStorage", { value: session });
  w.setTimeout = (fn) => {
    timers.push(fn);
    return timers.length;
  };
  w.clearTimeout = () => {};
  const media = {
    matches: !!motionOptions?.systemReduced,
    listeners: [],
    addEventListener(type, fn) {
      if (type === "change") this.listeners.push(fn);
    },
    change(value) {
      this.matches = value;
      this.listeners.forEach((fn) => fn({ matches: value }));
    },
  };
  w.matchMedia = () => media;
  const effects = [];
  if (motionOptions?.animate) {
    w.HTMLElement.prototype.animate = function (frames, options) {
      if (motionOptions.fail) throw new Error("Animation unavailable");
      let resolve, reject;
      const finished = new Promise((a, b) => {
        resolve = a;
        reject = b;
      });
      const effect = {
        element: this,
        frames,
        options,
        finished,
        cancelled: false,
        complete: false,
        cancel() {
          this.cancelled = true;
          reject(new Error("cancelled"));
        },
        finish() {
          this.complete = true;
          resolve();
        },
      };
      effects.push(effect);
      return effect;
    };
  }
  if (motionOptions?.geometry) {
    const original = w.HTMLElement.prototype.getBoundingClientRect;
    w.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.matches("[data-event]"))
        return new w.DOMRect(
          0,
          [...this.parentElement.children].indexOf(this) * 50,
          300,
          44,
        );
      return original.call(this);
    };
  }
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
    effects,
    media,
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
function repair(a) {
  a.click("[data-tab=work]");
  for (const key of ["shift-ledger", "cache-index", "test-report"])
    a.click('[data-read="' + key + '"]');
  const include = a.$("[data-include=test]");
  if (include.checked) include.click();
  const target = ["keys", "wall", "reply", "draft", "door", "test"];
  target.forEach((id, index) => {
    while (a.state().danny.timeline.indexOf(id) > index)
      a.click('[data-move="' + id + '"][data-direction="-1"]');
  });
  a.click("#check-timeline");
  assert.ok(a.state().flags.includes("timeline"));
  a.click("[data-read=conversation]");
  if (a.state().flags.includes("cabinet")) a.click("[data-tab=archive]");
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
  repair(site);
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
  assert.equal(a.state().clues.filter((c) => c.id.startsWith("public-")).length, 3);
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
  repair(b);
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
  assert.match(a.state().clues.find((c) => c.title.includes("绿色水杯")).source, /本机/);
});

test("时间校订要排除旧日期并统一钟表，游客及未校订的员工搜不到会话正文", (t) => {
  const local = memory(),
    session = memory(),
    a = login(t, local, session);
  a.set("#site-search", "我只是想出去");
  a.submit("#site-search-form");
  assert.equal(a.$("[data-read=conversation]"), null);
  a.click("[data-tab=work]");
  a.click("#check-timeline");
  assert.ok(!a.state().flags.includes("timeline"));
  assert.match(a.$("#timeline-status").textContent, /钟表/);
  repair(a);
  a.set("#site-search", "我只是想出去");
  a.submit("#site-search-form");
  assert.ok(a.$("[data-read=conversation]"));
  a.click("#logout");
  a.set("#site-search", "我只是想出去");
  a.submit("#site-search-form");
  assert.equal(a.$("[data-read=conversation]"), null);
});
test("校订中的排列、排除项与双档案选择刷新后保留", (t) => {
  const local = memory(),
    session = memory(),
    a = login(t, local, session);
  a.click('[data-move=keys][data-direction="-1"]');
  a.$("[data-include=test]").click();
  const order = a.state().danny.timeline.join(",");
  const b = boot(t, "danny", local, session, "#work");
  assert.equal(
    [...b.d.querySelectorAll("[data-event]")]
      .map((x) => x.dataset.event)
      .join(","),
    order,
  );
  assert.equal(b.$("[data-include=test]").checked, false);
  b.set("[name=code]", "5003");
  b.submit("#cabinet-form");
  b.click("[data-tab=archive]");
  choose(b, "left", "municipalB");
  choose(b, "right", "municipalA");
  const c = boot(t, "danny", local, session, "#archive");
  assert.equal(c.$("#compare-left").value, "municipalB");
  assert.match(c.$("#compare-doc-right").textContent, /Elias Rook/);
});
test("阅读深链接恢复原文和已读状态，退出权限后深链接不泄漏私有正文", (t) => {
  const local = memory(),
    session = memory(),
    a = boot(t, "danny", local, session);
  a.click("[data-read=rain]");
  assert.match(a.w.location.hash, /journal--rain/);
  assert.ok(
    a
      .$(".entry-list [data-read=rain]")
      .closest("article")
      .classList.contains("is-read"),
  );
  const b = boot(t, "danny", local, session, a.w.location.hash);
  assert.equal(b.$("#reading-pane").hidden, false);
  assert.match(b.$("#reading-pane").textContent, /Windows stay/);
  b.click("#close-reading");
  assert.equal(b.$("#reading-pane").hidden, true);
  const employee = login(t, local, session);
  employee.click("[data-read=cache-index]");
  const deep = employee.w.location.hash;
  employee.click("#logout");
  const guest = boot(t, "danny", local, session, deep);
  assert.doesNotMatch(guest.$("#site-main").textContent, /比馆钟慢八分钟/);
  assert.equal(guest.$("#reading-pane"), null);
});
test("图片原位放大到上限并可缩回，不影响翻面", (t) => {
  const a = boot(t, "danny", memory(), memory(), "#photos");
  a.click("[data-read=door-front]");
  for (let i = 0; i < 8; i++) a.click('[data-zoom="1"]');
  assert.equal(a.$(".zoom-level").textContent, "300%");
  assert.equal(a.$(".image-link img").style.width, "300%");
  for (let i = 0; i < 8; i++) a.click('[data-zoom="-1"]');
  assert.equal(a.$(".zoom-level").textContent, "100%");
  a.click("[data-read=door-back]");
  assert.match(a.$("#reading-pane").textContent, /背面/);
  assert.equal(a.$(".zoom-level").textContent, "100%");
});
test("主站查询历史支持前后查阅、刷新恢复和分支替换", (t) => {
  const local = memory(),
    a = boot(t, "index", local);
  a.click("#intro-skip");
  for (const q of ["钱包", "旧馆站", "相机"]) a.search(q);
  assert.equal(a.$("#query-navigation").hidden, false);
  a.click("#query-back");
  assert.equal(a.$("#search").value, "旧馆站");
  a.click("#query-forward");
  assert.equal(a.$("#search").value, "相机");
  a.click("#query-back");
  a.search("雨伞");
  assert.deepEqual(Array.from(a.state().searchHistory), [
    "钱包",
    "旧馆站",
    "雨伞",
  ]);
  assert.equal(a.$("#query-forward").disabled, true);
  const b = boot(t, "index", local);
  assert.equal(b.$("#search").value, "雨伞");
  b.click("[data-nav=home]");
  assert.equal(boot(t, "index", local).$("#search").value, "");
});
test("物品分类有效且不会把分类按钮当成剧情入口", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  a.click("[data-item-category=books]");
  assert.ok(a.d.querySelectorAll("[data-item]").length >= 2);
  assert.equal(a.$('[data-item="0816"]'), null);
  a.search("钱包");
  assert.ok(a.$('[data-item="0816"]'));
  assert.equal(a.$("[data-anomaly]"), null);
  a.click("[data-nav=all]");
  assert.ok(a.$("[data-nav=all]").classList.contains("active"));
});
test("我的可搜索备注，修改与撤销移除笔记，导出不混入未取得材料和员工会话", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.collect(data.files.badge);
  store.annotate("badge", "白塑料卡套");
  store.addNote("旧推测", "可能属于馆务");
  const a = boot(t, "index", local, memory(), "#mine");
  a.set("#notebook-search", "白塑料");
  a.submit("#notebook-search-form");
  assert.equal(a.d.querySelectorAll(".notebook-card").length, 1);
  a.click("#clear-notebook-search");
  a.click("[data-edit-note]");
  a.set("#edit-note-form [name=title]", "修订后的推测");
  a.set("#edit-note-form [name=body]", "还要比对日期");
  a.submit("#edit-note-form");
  assert.match(a.$("#results").textContent, /修订后的推测/);
  a.click("[data-delete-note]");
  assert.equal(a.state().notes.length, 0);
  a.click("#undo-note");
  assert.equal(a.state().notes.length, 1);
  a.click("#export-notebook");
  const copy = JSON.parse(a.$("#notebook-export").value);
  assert.equal(copy.clues.length, 1);
  assert.equal(copy.clues[0].note, "白塑料卡套");
  assert.equal(copy.notes[0].title, "修订后的推测");
  assert.ok(!a.$("#notebook-export").value.includes("danny-private-v3"));
  assert.ok(!a.$("#notebook-export").value.includes("municipal-a"));
});
test("小鹿回应按已取得材料和语境出现，同一语境不重复，终局后保持沉默", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.collect(data.files.anomaly);
  store.collect(data.files.draft);
  const a = boot(t, "index", local);
  a.click("#intro-skip");
  a.search("小鹿");
  assert.match(a.$("#suggestions").textContent, /我是小鹿/);
  a.search("小鹿");
  assert.equal(a.$("#suggestions").hidden, true);
  a.search("Danny");
  assert.match(a.$("#suggestions").textContent, /记录/);
  store.mark("verified");
  a.search("岗位");
  assert.match(a.$("#suggestions").textContent, /你自己选/);
  a.search("我的东西");
  assert.equal(a.$("#suggestions").hidden, true);
  store.finish("left");
  a.search("小鹿");
  assert.equal(a.$("#suggestions").hidden, true);
});
test("多个检索条件必须同时满足，导出的个人备注也在已知范围检索", () => {
  const index = require("../search-index.js");
  const rows = index.matches("旧馆 相机", data.items);
  assert.ok(rows.length);
  assert.ok(rows.every((row) => row.type === "相机"));
  assert.ok(!rows.some((row) => row.type === "钱包"));
  assert.equal(
    index.matches("未公开口令", [{ title: "公开随记", body: ["下雨了"] }])
      .length,
    0,
  );
  const timeline = require("../timeline.js");
  assert.equal(
    timeline.check(
      ["keys", "wall", "reply", "draft", "door", "test"],
      ["keys", "wall", "reply", "draft", "door"],
    ),
    true,
  );
  assert.equal(
    timeline.check(
      ["keys", "reply", "wall", "draft", "door", "test"],
      ["keys", "wall", "reply", "draft", "door"],
    ),
    false,
  );
  assert.equal(
    timeline.check(
      ["keys", "wall", "reply", "draft", "door", "test"],
      ["keys", "wall", "reply", "draft", "door", "test"],
    ),
    false,
  );
});

test("查档来由、当前目标和来源衔接明确，开场不直接给出 Danny 入口", (t) => {
  const a = boot(t);
  assert.match(a.$("#intro-description").textContent, /旧馆站/);
  assert.match(a.$("#journey-guide").textContent, /核对那份旧登记/);
  assert.equal(a.$('#journey-guide a[href^="danny"]'), null);
  a.click("#intro-skip");
  a.click("#journey-guide [data-search]");
  assert.equal(a.$("#search").value, "旧馆站");
  assert.ok(a.$('[data-item="0810"]'));
  a.click('[data-item="0816"]');
  a.click('[data-save-record="0816"]');
  assert.match(a.$("#journey-guide").textContent, /追查登记的移交来源/);
  assert.equal(a.$('#journey-guide a[href^="danny"]'), null);
});
test("员工目标明确列出两条并行线，实际读完对应原文才标记完成", (t) => {
  const local = memory(),
    session = memory(),
    a = boot(t, "danny", local, session);
  assert.match(a.$("#journey-guide").textContent, /确认 Danny 的访问身份/);
  a.click("[data-tab=account]");
  a.set("[name=account]", "danny.late");
  a.set("[name=password]", "west1103");
  a.submit("#login-form");
  assert.equal(a.d.querySelectorAll(".journey-tasks li").length, 2);
  assert.ok(
    [...a.d.querySelectorAll(".journey-tasks small")].every(
      (x) => x.textContent === "待核对",
    ),
  );
  repair(a);
  assert.equal(a.$(".journey-tasks li small").textContent, "已核对");
  assert.match(a.$("#journey-guide a").getAttribute("href"), /#work/);
  const b = boot(t, "danny", local, memory(), "#work");
  assert.match(b.$("#journey-guide").textContent, /恢复员工身份/);
});
test("材料对照使用独立宽弹窗和表格滚动区，切换普通弹窗会恢复布局", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.collect(data.files.municipalA);
  store.collect(data.files.municipalB);
  const a = boot(t, "index", local, memory(), "#mine");
  for (const box of a.d.querySelectorAll("[data-compare]")) box.click();
  a.click("#compare-files");
  assert.ok(a.$("#modal").classList.contains("comparison-dialog"));
  assert.ok(a.$(".comparison-table-scroll table"));
  assert.equal(a.$(".comparison-table-scroll").getAttribute("tabindex"), "0");
  a.click("#close-modal");
  a.click("#new-note");
  assert.ok(!a.$("#modal").classList.contains("comparison-dialog"));
});
test("目标不通过查看提示解锁，不泄露未取得的凭证答案", () => {
  const guide = require("../journey-guide.js"),
    state = makeStore(memory()).read();
  const start = guide.describe(state);
  assert.equal(start.query, "旧馆站");
  assert.ok(!JSON.stringify(start).includes("west1103"));
  assert.equal(state.flags.length, 0);
  state.clues.push(data.files.trace);
  assert.equal(guide.describe(state).index, 2);
  state.flags.push("staff", "timeline");
  assert.equal(guide.describe(state).tasks[0].done, false);
  state.clues.push(data.files.conversation);
  assert.equal(guide.describe(state).tasks[0].done, true);
  state.flags.push("verified");
  assert.equal(guide.describe(state).url, "index.html#application");
  state.ending = "left";
  assert.equal(guide.describe(state).url, "index.html#mine");
});

test("调查材料可以不同顺序查阅，绕过查询快照仍能在完整核验后作最后选择", (t) => {
  const local = memory(),
    session = memory(),
    site = cabinet(t, local, session);
  compare(site);
  for (const key of ["signed", "relist", "clause"])
    site.click("[data-read=" + key + "]");
  repair(site);
  chain(site);
  assert.ok(site.state().flags.includes("verified"));
  assert.ok(!site.state().clues.some((x) => x.id === "anomaly"));
  const main = boot(t, "index", local, session, "#application");
  assert.equal(main.$("#application-panel").hidden, false);
  assert.match(main.$("#suggestions").textContent, /你自己选/);
  assert.equal(
    main.$("#journey-guide a").getAttribute("href"),
    "index.html#application",
  );
});

test("当前目标的站内跳转立即生效，材料副本可以直接回到最终申请", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.mark("verified");
  store.collect(data.files.truth);
  const a = boot(t, "index", local);
  a.click("#intro-skip");
  a.click('#journey-guide a[href="index.html#mine"]');
  assert.ok(a.d.body.classList.contains("notebook-mode"));
  a.click("[data-file=truth]");
  a.click('#modal-body a[href="index.html#application"]');
  assert.ok(!a.d.body.classList.contains("notebook-mode"));
  assert.equal(a.$("#modal").open, false);
  assert.equal(a.$("#application-panel").hidden, false);
  assert.equal(a.w.location.hash, "#application");
});

test("两条调查线可各自直接进入工具，同一栏目内跳转保留正在填写的柜号", (t) => {
  const a = login(t, memory(), memory());
  a.set("[name=code]", "5013");
  const original = a.$("#cabinet-form");
  a.click(".journey-tasks a[data-guide-focus=cabinet]");
  assert.equal(a.d.activeElement, a.$(".cabinet-box"));
  assert.equal(a.$("#cabinet-form"), original);
  assert.equal(a.$("[name=code]").value, "5013");
  a.click(".journey-tasks a[data-guide-focus=timeline]");
  assert.equal(a.d.activeElement, a.$(".timeline-tool"));
  assert.equal(a.$("[name=code]").value, "5013");
});
test("恢复会话但尚未阅读时，继续入口直接打开正文而非重新排序", (t) => {
  const local = memory(),
    session = memory();
  login(t, local, session);
  makeStore(local).mark("timeline");
  const a = boot(t, "danny", local, session, "#work");
  assert.equal(
    a.$(".journey-actions>a").getAttribute("href"),
    "danny.html#work--conversation",
  );
  a.click(".journey-actions>a");
  assert.match(a.$("#reading-pane").textContent, /修复的查询会话/);
  assert.equal(a.$(".journey-tasks small").textContent, "已核对");
  assert.equal(a.$(".journey-actions>a").dataset.guideFocus, "cabinet");
});
test("游客取得必要的公开材料后目标转向登录，无关登记不冒充来源进度", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.collect({
    id: "public-0813",
    title: "校园卡",
    fields: [["地点", "大学路 · 站台"]],
    url: "index.html#search",
  });
  const guide = require("../journey-guide.js");
  assert.equal(guide.describe(store.read()).index, 0);
  for (const key of ["trace", "roster", "it-note", "rain", "door-back"])
    store.collect(data.files[key]);
  const a = boot(t, "danny", local);
  assert.equal(
    a.$(".journey-actions>a").getAttribute("href"),
    "danny.html#account",
  );
  a.click(".journey-actions>a");
  assert.ok(a.$("#login-form"));
  assert.equal(a.d.activeElement, a.$("#login-form"));
  assert.ok(!a.state().flags.includes("staff"));
});
test("完成核验的玩家在游客会话下仍能回主站决定，不被要求重复登录", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.mark("verified");
  const a = boot(t, "danny", local, memory(), "#work");
  assert.equal(
    a.$(".journey-actions>a").getAttribute("href"),
    "index.html#application",
  );
  assert.match(a.$("#journey-guide").textContent, /作最后决定/);
  assert.equal(a.$("[data-read=night]"), null);
});
test("从私有材料深链接进入，游客登录后返回请求的原文", (t) => {
  const local = memory(),
    session = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.collect(data.files.plan);
  const a = boot(t, "danny", local, session, "#work--plan");
  assert.equal(a.$("#reading-pane"), null);
  a.click(".journey-actions>a");
  a.set("[name=account]", "danny.late");
  a.set("[name=password]", "west1103");
  a.submit("#login-form");
  assert.equal(a.w.location.hash, "#work--plan");
  assert.equal(a.$("#reading-pane").hidden, false);
  assert.match(a.$("#reading-pane").textContent, /3 号厅楼层图/);
});
test("目标说明阅读时自动收紧，手动展开与查阅脉络在换材料后保留", (t) => {
  const a = boot(t, "danny");
  a.click("[data-read=rain]");
  assert.ok(a.$("#journey-guide").classList.contains("is-compact"));
  a.click("[data-guide-toggle]");
  assert.ok(!a.$("#journey-guide").classList.contains("is-compact"));
  assert.equal(
    a.$("[data-guide-toggle]").getAttribute("aria-expanded"),
    "true",
  );
  a.$(".journey-path").open = true;
  a.click("[data-read=tea]");
  assert.ok(!a.$("#journey-guide").classList.contains("is-compact"));
  assert.equal(a.$(".journey-path").open, true);
});
test("其他窗口保存笔记不清空登录输入，口令不进入存档", (t) => {
  const local = memory(),
    a = boot(t, "danny", local, memory(), "#account");
  a.set("[name=account]", "danny.late");
  a.set("[name=password]", "正在输入的口令");
  const form = a.$("#login-form");
  makeStore(local).addNote("其他窗口", "新备注");
  a.w.dispatchEvent(
    new a.w.StorageEvent("storage", { key: a.w.ZHAOHUI_JOURNEY.key }),
  );
  assert.equal(a.$("#login-form"), form);
  assert.equal(a.$("[name=password]").value, "正在输入的口令");
  assert.ok(!JSON.stringify([...local.map]).includes("正在输入的口令"));
});
test("跨窗口进度刷新保留未提交姓名，清空输入和重新开始均清除草稿", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.mark("verified");
  const a = boot(t, "index", local);
  a.click("#intro-skip");
  a.set("#claim-form [name=name]", "尚未提交的名字");
  store.addNote("其他窗口", "新材料");
  a.w.dispatchEvent(new a.w.StorageEvent("storage", { key: store.key }));
  assert.equal(a.$("#claim-form [name=name]").value, "尚未提交的名字");
  assert.equal(a.state().name, "");
  a.set("#claim-form [name=name]", "");
  a.w.dispatchEvent(new a.w.StorageEvent("storage", { key: store.key }));
  assert.equal(a.$("#claim-form [name=name]").value, "");
  a.set("#claim-form [name=name]", "应当被清除");
  a.click("#reset");
  a.click("#confirm-reset");
  assert.equal(a.$("#claim-form [name=name]").value, "");
});

test("跨窗口重新开始仍会立即撤回当前私有阅读权限", (t) => {
  const local = memory(),
    session = memory(),
    a = login(t, local, session);
  a.click("[data-read=night]");
  assert.ok(a.$("#reading-pane"));
  makeStore(local).reset();
  a.w.dispatchEvent(
    new a.w.StorageEvent("storage", { key: a.w.ZHAOHUI_JOURNEY.key }),
  );
  assert.equal(a.$("#reading-pane"), null);
  assert.equal(a.$("[data-read=night]"), null);
  assert.equal(session.getItem("harrow-session"), null);
  assert.match(a.$("#site-main").textContent, /本轮调查尚未开始/);
});

test("从主站打开继续入口会定位到 Danny 的指定工具而不只是栏目顶部", (t) => {
  const local = memory(),
    session = memory();
  login(t, local, session);
  const main = boot(t, "index", local, session);
  const href = main
    .$(".journey-tasks a[data-guide-focus=cabinet]")
    .getAttribute("href");
  assert.equal(href, "danny.html#work--tool-cabinet");
  const site = boot(t, "danny", local, session, href.slice(href.indexOf("#")));
  assert.equal(site.d.activeElement, site.$(".cabinet-box"));
  assert.ok(!site.state().flags.includes("cabinet"));
});
test("材料深链接与工具深链接在登录恢复后都定位到请求的位置", (t) => {
  const local = memory(),
    session = memory();
  makeStore(local).mark("staff");
  const a = boot(t, "danny", local, session, "#work--tool-timeline");
  a.click(".journey-actions>a");
  a.set("[name=account]", "danny.late");
  a.set("[name=password]", "west1103");
  a.submit("#login-form");
  assert.equal(a.w.location.hash, "#work--tool-timeline");
  assert.equal(a.d.activeElement, a.$(".timeline-tool"));
  const b = boot(t, "danny", local, session, "#work--plan");
  assert.equal(b.d.activeElement, b.$("#reading-pane"));
});

function traverse(a, direction) {
  a.w.history[direction]();
  for (let i = 0; i < 4; i++) a.tick();
}
test("History API 后退与前进恢复各次查询和我的视图，不制造新查询", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  a.search("钱包");
  a.search("耳机");
  a.click("[data-nav=mine]");
  assert.equal(a.w.location.hash, "#mine");
  traverse(a, "back");
  assert.ok(!a.d.body.classList.contains("notebook-mode"));
  assert.equal(a.$("#search").value, "耳机");
  traverse(a, "back");
  assert.equal(a.$("#search").value, "钱包");
  assert.ok(a.$('[data-item="0816"]'));
  traverse(a, "forward");
  assert.equal(a.$("#search").value, "耳机");
  assert.deepEqual(Array.from(a.state().searchHistory), ["钱包", "耳机"]);
  traverse(a, "forward");
  assert.ok(a.d.body.classList.contains("notebook-mode"));
});
test("菜单进入我的可刷新恢复，返回查阅后刷新不会再次跳回我的", (t) => {
  const local = memory(),
    a = boot(t, "index", local);
  a.click("#intro-skip");
  a.search("相机");
  a.click("[data-nav=mine]");
  const b = boot(t, "index", local, memory(), a.w.location.hash);
  assert.ok(b.d.body.classList.contains("notebook-mode"));
  b.click("#notebook-return");
  assert.equal(b.w.location.hash, "#search");
  assert.equal(b.$("#search").value, "相机");
  const c = boot(t, "index", local, memory(), b.w.location.hash);
  assert.ok(!c.d.body.classList.contains("notebook-mode"));
  assert.ok(c.$('[data-item="0810"]'));
});
test("首页与失物大厅地址和选中导航一致，后退不会恢复过期查询", (t) => {
  const local = memory(),
    a = boot(t, "index", local);
  a.click("#intro-skip");
  a.search("钱包");
  a.click("[data-nav=all]");
  assert.equal(a.w.location.hash, "#all");
  a.click("[data-nav=home]");
  assert.equal(a.w.location.hash, "#home");
  traverse(a, "back");
  assert.ok(a.$("[data-nav=all]").classList.contains("active"));
  assert.equal(a.$("#search").value, "");
  traverse(a, "back");
  assert.equal(a.$("#search").value, "钱包");
  const b = boot(t, "index", local, memory(), "#home");
  assert.equal(b.$("#search").value, "");
  assert.equal(b.state().lastQuery, "");
});
test("Danny 同栏目工具前进后退只改变位置，不重建正在填写的柜号", (t) => {
  const a = login(t, memory(), memory());
  a.set("[name=code]", "未提交柜号");
  const form = a.$("#cabinet-form");
  a.click(".journey-tasks a[data-guide-focus=cabinet]");
  a.click(".journey-tasks a[data-guide-focus=timeline]");
  traverse(a, "back");
  assert.equal(a.d.activeElement, a.$(".cabinet-box"));
  assert.equal(a.$("#cabinet-form"), form);
  assert.equal(a.$("[name=code]").value, "未提交柜号");
  traverse(a, "forward");
  assert.equal(a.d.activeElement, a.$(".timeline-tool"));
  assert.equal(a.$("[name=code]").value, "未提交柜号");
});
test("材料前后查阅保留同栏目工具草稿，收起后回到目录", (t) => {
  const a = login(t, memory(), memory());
  a.set("[name=code]", "正在核对");
  const form = a.$("#cabinet-form");
  a.click("[data-read=night]");
  a.click("[data-read=draft]");
  traverse(a, "back");
  assert.match(a.$("#reading-pane h2").textContent, /夜班日志/);
  assert.equal(a.$("#cabinet-form"), form);
  assert.equal(a.$("[name=code]").value, "正在核对");
  traverse(a, "forward");
  assert.match(a.$("#reading-pane h2").textContent, /草稿/);
  a.click("#close-reading");
  assert.equal(a.w.location.hash, "#work");
  assert.equal(a.$("#reading-pane").hidden, true);
});
test("工作匣和旧柜间切换保留工具草稿，退出员工模式会清除它们", (t) => {
  const local = memory(),
    session = memory(),
    a = cabinet(t, local, session);
  a.set("[name=signer]", "待核对的代号");
  a.set("[name=subject]", "另一个代号");
  a.click("[data-tab=work]");
  a.set("[name=code]", "柜号草稿");
  a.click("[data-tab=archive]");
  assert.equal(a.$("[name=signer]").value, "待核对的代号");
  assert.equal(a.$("[name=subject]").value, "另一个代号");
  a.click("[data-tab=work]");
  assert.equal(a.$("[name=code]").value, "柜号草稿");
  a.click("#logout");
  a.click("[data-tab=account]");
  a.set("[name=account]", "danny.late");
  a.set("[name=password]", "west1103");
  a.submit("#login-form");
  assert.equal(a.$("[name=code]").value, "");
  a.click("[data-tab=archive]");
  assert.equal(a.$("[name=signer]").value, "");
});
test("其他窗口更新不擅自提交正在编辑的主站搜索词或丢失我的筛选草稿", (t) => {
  const local = memory(),
    a = boot(t, "index", local);
  a.click("#intro-skip");
  a.search("钱包");
  a.set("#search", "还未提交的耳机");
  makeStore(local).addNote("其他窗口", "更新");
  a.w.dispatchEvent(
    new a.w.StorageEvent("storage", { key: a.w.ZHAOHUI_JOURNEY.key }),
  );
  assert.equal(a.$("#search").value, "还未提交的耳机");
  assert.ok(a.$('[data-item="0816"]'));
  assert.equal(a.state().lastQuery, "钱包");
  a.click("[data-nav=mine]");
  a.set("#notebook-search", "未提交筛选");
  a.$("#notebook-search").focus();
  a.$("#notebook-search").setSelectionRange(2, 4);
  a.w.dispatchEvent(
    new a.w.StorageEvent("storage", { key: a.w.ZHAOHUI_JOURNEY.key }),
  );
  assert.equal(a.$("#notebook-search").value, "未提交筛选");
  assert.equal(a.d.activeElement, a.$("#notebook-search"));
  assert.equal(a.$("#notebook-search").selectionStart, 2);
  assert.equal(a.$("#notebook-search").selectionEnd, 4);
  a.click("#notebook-return");
  assert.equal(a.$("#search").value, "钱包");
});

test("主站注销可取消，确认后清除本轮全部记录并回到初始引导", (t) => {
  const local = memory(),
    session = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.mark("verified");
  store.collect(data.files.truth);
  store.addNote("要删除的笔记", "内容");
  store.update((s) => {
    s.goal = "旧失物";
    s.name = "旧名字";
    s.ending = "claimed";
    s.registrations.push({ id: "local-x", name: "本机物品", place: "某处" });
    s.settings.assist = true;
    s.introduced = true;
  });
  session.setItem("harrow-session", "danny-private-v3");
  local.setItem("unrelated-site", "keep");
  local.setItem("zhaohui-story-v1", "old-save");
  const a = boot(t, "index", local, session);
  a.click("[data-reset-game]");
  assert.ok(a.$("#modal").open);
  a.click("#cancel-choice");
  assert.equal(a.state().ending, "claimed");
  a.click("[data-reset-game]");
  a.click("#confirm-reset");
  const reset = a.state();
  assert.equal(reset.ending, "");
  assert.equal(reset.goal, "");
  assert.equal(reset.name, "");
  assert.equal(reset.clues.length, 0);
  assert.equal(reset.notes.length, 0);
  assert.equal(reset.registrations.length, 0);
  assert.equal(reset.flags.length, 0);
  assert.equal(reset.searchHistory.length, 0);
  assert.equal(reset.settings.assist, false);
  assert.equal(session.getItem("harrow-session"), null);
  assert.equal(local.getItem("unrelated-site"), "keep");
  assert.equal(local.getItem("zhaohui-story-v1"), "old-save");
  assert.ok(a.$("#intro").open);
  assert.equal(a.w.location.hash, "#home");
  assert.equal(a.$("#intro-item").value, "钱包");
  a.submit("#intro-form");
  assert.equal(a.state().goal, "钱包");
  assert.ok(a.state().introduced);
});
test("Danny 注销取消不丢进度，确认后退出会话并提供回到开场的原生链接", (t) => {
  const local = memory(),
    session = memory(),
    a = login(t, local, session);
  a.click("[data-read=night]");
  a.click("#restart-game");
  a.click("#keep-playing");
  assert.ok(a.state().flags.includes("staff"));
  a.click("#restart-game");
  a.d.addEventListener("click", (e) => {
    if (e.target.closest("#confirm-restart")) e.preventDefault();
  });
  a.click("#confirm-restart");
  assert.equal(a.$("#confirm-restart").getAttribute("href"), "index.html#home");
  assert.equal(a.state().clues.length, 0);
  assert.equal(a.state().flags.length, 0);
  assert.equal(session.getItem("harrow-session"), null);
  assert.equal(a.$("#restart-dialog").open, false);
  assert.match(a.$("#site-main").textContent, /本轮调查尚未开始/);
  const main = boot(t, "index", local, session, "#home");
  assert.ok(main.$("#intro").open);
  assert.equal(main.state().goal, "");
});
test("注销后后退到旧查询不会恢复旧目标或旧笔记", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  a.search("钱包");
  a.search("耳机");
  a.click("[data-nav=mine]");
  a.click("[data-reset-game]");
  a.click("#confirm-reset");
  const token = a.state().runToken;
  traverse(a, "back");
  assert.equal(a.w.location.hash, "#home");
  assert.equal(a.state().runToken, token);
  assert.equal(a.state().goal, "");
  assert.equal(a.state().clues.length, 0);
  assert.ok(a.$("#intro").open);
  assert.ok(!a.d.body.classList.contains("notebook-mode"));
});
test("注销后的旧材料深链接不会自动收集来源，开场完成后才恢复正常游客浏览", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.collect(data.files.plan);
  store.reset();
  const a = boot(t, "danny", local, memory(), "#work--plan");
  assert.equal(a.state().clues.length, 0);
  a.click("[data-tab=journal]");
  assert.equal(a.state().clues.length, 0);
  assert.equal(a.$("[data-read=rain]"), null);
  const main = boot(t, "index", local, memory(), "#home");
  main.submit("#intro-form");
  const b = boot(t, "danny", local, memory(), "#journal");
  assert.ok(b.$("[data-read=rain]"));
  assert.ok(b.state().clues.some((x) => x.id === "trace"));
});
function cachedPage(a) {
  const e = new a.w.Event("pageshow");
  Object.defineProperty(e, "persisted", { value: true });
  a.w.dispatchEvent(e);
}
test("缓存页面在注销后恢复时也回到开场状态，不复活私有正文", (t) => {
  const local = memory(),
    session = memory(),
    site = login(t, local, session);
  site.click("[data-read=night]");
  const main = boot(t, "index", local, session);
  main.click("#intro-skip");
  main.search("旧馆");
  makeStore(local).reset();
  session.removeItem("harrow-session");
  cachedPage(site);
  assert.equal(site.$("#reading-pane"), null);
  assert.match(site.$("#site-main").textContent, /本轮调查尚未开始/);
  cachedPage(main);
  assert.ok(main.$("#intro").open);
  assert.equal(main.$("#search").value, "");
  assert.equal(main.state().clues.length, 0);
});
test("其他窗口注销时，仍处于游客阅读的窗口也会清理旧正文和搜索内容", (t) => {
  const local = memory(),
    a = boot(t, "danny", local);
  a.click("[data-read=rain]");
  a.set("#site-search", "旧搜索");
  makeStore(local).reset();
  a.w.dispatchEvent(
    new a.w.StorageEvent("storage", { key: a.w.ZHAOHUI_JOURNEY.key }),
  );
  assert.equal(a.$("#reading-pane"), null);
  assert.equal(a.$("#site-search").value, "");
  assert.equal(a.state().clues.length, 0);
  assert.match(a.$("#site-main").textContent, /本轮调查尚未开始/);
});
test("刷新优先恢复本标签页的查询快照，不被另一个标签页的最后搜索覆盖", (t) => {
  const local = memory(),
    a = boot(t, "index", local);
  a.click("#intro-skip");
  a.search("钱包");
  const snapshot = JSON.parse(JSON.stringify(a.w.history.state));
  const other = boot(t, "index", local);
  other.search("耳机");
  const reloaded = boot(t, "index", local, memory(), "#search", snapshot);
  assert.equal(reloaded.$("#search").value, "钱包");
  assert.ok(reloaded.$('[data-item="0816"]'));
});
test("有重复关键词的历史记录按原次序恢复，不错误跳到第一次同名查询", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  for (const q of ["钱包", "耳机", "钱包", "相机"]) a.search(q);
  traverse(a, "back");
  assert.equal(a.$("#search").value, "钱包");
  assert.equal(a.state().searchCursor, 2);
  a.click("#query-back");
  assert.equal(a.$("#search").value, "耳机");
});
test("注销会清除打开的提示与临时通知，开场输入不会沿用上轮内容", (t) => {
  const a = boot(t);
  a.set("#intro-item", "旧物");
  a.submit("#intro-form");
  a.click("#hint-toggle");
  a.search("钱包");
  a.click('[data-item="0816"]');
  a.click('[data-save-record="0816"]');
  a.click("#close-modal");
  assert.equal(a.$("#toast").hidden, false);
  a.click("[data-reset-game]");
  a.click("#confirm-reset");
  assert.equal(a.$("#hint-content").hidden, true);
  assert.equal(a.$("#hint-body").textContent, "");
  assert.equal(a.$("#toast").hidden, true);
  assert.equal(a.$("#intro-item").value, "钱包");
});

test("旧标签页的员工会话不会因新一轮在别处登录而重新生效", (t) => {
  const local = memory(),
    oldSession = memory();
  login(t, local, oldSession);
  const store = makeStore(local);
  store.reset();
  const main = boot(t, "index", local, memory(), "#home");
  main.submit("#intro-form");
  const newSession = memory();
  login(t, local, newSession);
  assert.notEqual(
    oldSession.getItem("harrow-run-token"),
    newSession.getItem("harrow-run-token"),
  );
  const stale = boot(t, "danny", local, oldSession, "#work");
  assert.equal(stale.$("[data-read=night]"), null);
  assert.match(stale.$("#permission-label").textContent, /游客/);
});

test("另一窗口已经放弃时，旧签署确认不会显示虚假的岗位移交", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.collect(data.files.clause);
  store.update((s) => (s.introduced = true));
  const a = boot(t, "index", local),
    b = boot(t, "index", local);
  a.set("#claim-form [name=name]", "窗口甲");
  a.submit("#claim-form");
  b.click("#leave");
  b.click("#confirm-choice");
  a.click("#confirm-choice");
  assert.equal(a.state().ending, "left");
  assert.equal(a.$("#ending").open, false);
  assert.match(a.$("#staff-count").textContent, /0/);
  assert.equal(a.$("#application-panel").hidden, true);
});
test("两份签署确认按已经保存的姓名展示，迟到的确认不改写结局", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.collect(data.files.clause);
  store.update((s) => (s.introduced = true));
  const a = boot(t, "index", local),
    b = boot(t, "index", local);
  a.set("#claim-form [name=name]", "窗口甲");
  a.submit("#claim-form");
  b.set("#claim-form [name=name]", "窗口乙");
  b.submit("#claim-form");
  b.click("#confirm-choice");
  a.click("#confirm-choice");
  assert.equal(a.state().name, "窗口乙");
  assert.match(a.$("#ending-name").textContent, /窗口乙/);
  assert.doesNotMatch(a.$("#ending-name").textContent, /窗口甲/);
  assert.match(a.$("#toast").textContent, /已有结局/);
});
test("结束事件关闭其他窗口的旧确认，缓存恢复同一轮也同步实际终局", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.collect(data.files.clause);
  store.update((s) => (s.introduced = true));
  const a = boot(t, "index", local),
    b = boot(t, "index", local);
  a.click("#leave");
  b.set("#claim-form [name=name]", "旧确认");
  b.submit("#claim-form");
  store.finish("left");
  a.w.dispatchEvent(new a.w.StorageEvent("storage", { key: store.key }));
  assert.equal(a.$("#modal").open, false);
  assert.equal(a.$("#application-panel").hidden, true);
  cachedPage(b);
  assert.equal(b.$("#modal").open, false);
  assert.equal(b.$("#application-panel").hidden, true);
  assert.match(b.$("#staff-count").textContent, /0/);
  assert.equal(b.state().ending, "left");
});
test("注销后完成开场会解开其他游客窗口的重开提示，无须再次刷新或换栏目", (t) => {
  const local = memory(),
    store = makeStore(local);
  store.reset();
  const site = boot(t, "danny", local, memory(), "#journal");
  assert.match(site.$("#site-main").textContent, /尚未开始/);
  const main = boot(t, "index", local, memory(), "#home");
  main.submit("#intro-form");
  site.w.dispatchEvent(new site.w.StorageEvent("storage", { key: store.key }));
  assert.ok(site.$("[data-read=rain]"));
  assert.ok(site.state().clues.some((x) => x.id === "trace"));
  assert.match(site.$("#journey-guide").textContent, /确认 Danny 的访问身份/);
});
test("空格登记不会生成空白物品，错误字段保留在表单中并可继续修正", (t) => {
  const a = boot(t);
  a.click("#intro-skip");
  a.click("[data-nav=register]");
  a.set("#register-form [name=name]", "  ");
  a.set("#register-form [name=place]", "\u3000");
  a.set("#register-form [name=description]", "正常描述");
  a.submit("#register-form");
  assert.equal(a.state().registrations.length, 0);
  assert.ok(a.$("#modal").open);
  assert.equal(a.$("#register-error").hidden, false);
  assert.equal(a.d.activeElement, a.$("#register-form [name=name]"));
  a.set("#register-form [name=name]", "  手电  ");
  a.set("#register-form [name=place]", "门房");
  assert.equal(a.$("#register-error").hidden, true);
  a.submit("#register-form");
  assert.equal(a.state().registrations.length, 1);
  assert.equal(a.state().registrations[0].name, "手电");
  assert.equal(a.$("#modal").open, false);
});
test("另一窗口关闭线索辅助后，当前开关与提示立即同步且不提交搜索", (t) => {
  const local = memory(),
    a = boot(t, "index", local);
  a.click("#intro-skip");
  a.set("#search", "钱包");
  a.click("#match-toggle");
  assert.equal(a.$("#clue-match").hidden, false);
  makeStore(local).update((s) => (s.settings.assist = false));
  a.w.dispatchEvent(
    new a.w.StorageEvent("storage", { key: a.w.ZHAOHUI_JOURNEY.key }),
  );
  assert.equal(a.$("#match-toggle").getAttribute("aria-pressed"), "false");
  assert.equal(a.$("#clue-match").hidden, true);
  assert.equal(a.state().lastQuery, "");
});
test("旧轮次的确认不能结束新一轮，即使新一轮已经重新取得员工身份", () => {
  const store = makeStore(memory());
  store.mark("staff");
  const previous = store.read().runToken;
  store.reset();
  store.mark("staff");
  store.finish("claimed", "旧确认", previous);
  assert.equal(store.read().ending, "");
  store.finish("left", "", store.read().runToken);
  assert.equal(store.read().ending, "left");
});
test("注销后可完整重玩：开场、登录、两条调查线、核验与另一个结局", (t) => {
  const local = memory(),
    session = memory(),
    store = makeStore(local);
  store.mark("staff");
  store.finish("claimed", "上一轮");
  store.addNote("上一轮笔记", "不应留下");
  const main = boot(t, "index", local, session);
  main.click("[data-reset-game]");
  main.click("#confirm-reset");
  const token = main.state().runToken;
  assert.equal(main.state().clues.length, 0);
  assert.equal(main.state().notes.length, 0);
  main.submit("#intro-form");
  const site = cabinet(t, local, session);
  assert.equal(session.getItem("harrow-run-token"), token);
  compare(site);
  for (const key of ["signed", "relist", "clause"])
    site.click("[data-read=" + key + "]");
  repair(site);
  chain(site);
  assert.ok(site.state().flags.includes("verified"));
  const final = boot(t, "index", local, session, "#application");
  assert.equal(final.$("#application-panel").hidden, false);
  final.click("#leave");
  final.click("#confirm-choice");
  assert.equal(final.state().ending, "left");
  assert.equal(final.state().runToken, token);
  assert.equal(final.state().notes.length, 0);
  assert.match(final.$("#staff-count").textContent, /0/);
});

test("快速切换查询会取消旧动效，内容和输入在动画未完成时已经可用", (t) => {
  const a = boot(t, "index", memory(), memory(), "", null, { animate: true });
  a.click("#intro-skip");
  a.search("钱包");
  const previous = a.effects.findLast((x) =>
    x.element.matches('[data-item="0816"]'),
  );
  assert.ok(previous);
  assert.equal(previous.complete, false);
  a.search("耳机");
  assert.equal(previous.cancelled, true);
  assert.ok(a.$('[data-item="0814"]'));
  assert.equal(a.state().lastQuery, "耳机");
  assert.equal(a.$("#search").disabled, false);
  assert.ok(a.effects.findLast((x) => x.element.matches('[data-item="0814"]')));
});
test("材料展开与翻面不等待动效，连续操作会取消已移除内容的动画", (t) => {
  const a = boot(t, "danny", memory(), memory(), "", null, { animate: true });
  a.click("[data-read=rain]");
  const opening = a.effects.findLast((x) => x.element.id === "reading-pane");
  a.click("[data-read=tea]");
  assert.equal(opening.cancelled, true);
  assert.ok(a.state().clues.some((x) => x.id === "rain"));
  assert.ok(a.state().clues.some((x) => x.id === "tea"));
  a.click("[data-tab=photos]");
  a.click("[data-read=door-front]");
  a.click("[data-read=door-back]");
  const turning = a.effects.findLast((x) =>
    x.element.classList.contains("image-viewport"),
  );
  assert.ok(
    turning.frames.some((frame) => frame.transform?.includes("rotateY")),
  );
  assert.equal(turning.complete, false);
  assert.ok(a.state().clues.some((x) => x.id === "door-back"));
  assert.match(a.$("#reading-pane h2").textContent, /背面/);
});
test("手动和系统减少动态效果都会取消进行中的动画，操作逻辑继续即时生效", (t) => {
  const local = memory(),
    a = boot(t, "index", local, memory(), "", null, { animate: true });
  a.click("#intro-skip");
  a.search("钱包");
  a.click("#motion-toggle");
  assert.equal(a.w.document.documentElement.dataset.motion, "reduced");
  assert.equal(a.$("#motion-toggle").getAttribute("aria-pressed"), "true");
  assert.ok(a.effects.every((x) => x.cancelled));
  const count = a.effects.length;
  a.search("雨伞");
  assert.equal(a.effects.length, count);
  assert.ok(a.$('[data-item="0812"]'));
  a.click("#motion-toggle");
  a.search("相机");
  assert.ok(a.effects.length > count);
  a.media.change(true);
  assert.equal(a.w.document.documentElement.dataset.motion, "reduced");
  assert.ok(a.effects.every((x) => x.cancelled));
  const paused = a.effects.length;
  a.search("钥匙");
  assert.equal(a.effects.length, paused);
  a.media.change(false);
  assert.equal(a.w.document.documentElement.dataset.motion, "full");
});
test("动画 API 缺失或报错均不阻断调查，保存内容不依赖动画完成回调", (t) => {
  const a = boot(t, "danny", memory(), memory(), "#photos", null, {
    animate: true,
    fail: true,
  });
  a.click("[data-read=door-front]");
  a.click("[data-read=door-back]");
  assert.equal(a.effects.length, 0);
  assert.ok(a.state().clues.some((x) => x.id === "door-back"));
  assert.match(a.$("#reading-pane h2").textContent, /背面/);
  const b = boot(t);
  b.click("#intro-skip");
  b.search("钱包");
  assert.ok(b.$('[data-item="0816"]'));
});
test("记录重排立即改变顺序并保留键盘焦点，动画只描绘位置变化", (t) => {
  const local = memory(),
    session = memory();
  login(t, local, session);
  const a = boot(t, "danny", local, session, "#work", null, {
    animate: true,
    geometry: true,
  });
  const before = a.state().danny.timeline.indexOf("keys");
  a.click('[data-move=keys][data-direction="-1"]');
  assert.equal(a.state().danny.timeline.indexOf("keys"), before - 1);
  assert.equal(a.d.activeElement.dataset.move, "keys");
  assert.ok(
    a.effects.some(
      (x) =>
        x.element.hasAttribute("data-event") &&
        x.frames.some((frame) => frame.transform?.includes("50px")),
    ),
  );
  assert.ok(!a.state().flags.includes("timeline"));
});
test("对照时仅更新换过的纸张，另一份材料的阅读位置不会被动画重置", (t) => {
  const a = cabinet(t, memory(), memory());
  choose(a, "left", "municipalA");
  const content = a.$("#compare-doc-left").firstElementChild;
  a.$("#compare-doc-left").scrollTop = 80;
  choose(a, "right", "municipalB");
  assert.equal(a.$("#compare-doc-left").firstElementChild, content);
  assert.equal(a.$("#compare-doc-left").scrollTop, 80);
});
test("其他窗口的普通更新不会重播列表入场，页面离开会清理仍在运行的动画", (t) => {
  const local = memory(),
    a = boot(t, "index", local, memory(), "", null, { animate: true });
  a.click("#intro-skip");
  a.search("钱包");
  const count = a.effects.length;
  makeStore(local).addNote("旁页", "更新");
  a.w.dispatchEvent(
    new a.w.StorageEvent("storage", { key: a.w.ZHAOHUI_JOURNEY.key }),
  );
  assert.equal(a.effects.length, count);
  a.search("耳机");
  a.w.dispatchEvent(new a.w.Event("pagehide"));
  assert.ok(a.effects.every((x) => x.cancelled));
});
test("已经结束的动画会正常清理，后续取消不会再次操作它", async (t) => {
  const a = boot(t, "danny", memory(), memory(), "", null, { animate: true });
  a.click("[data-read=rain]");
  const effect = a.effects.findLast((x) => x.element.id === "reading-pane");
  effect.finish();
  await Promise.resolve();
  a.w.ZHAOHUI_MOTION.cancelAll();
  assert.equal(effect.cancelled, false);
  assert.equal(effect.complete, true);
});

test("扫描缩放可连续中断，键盘恢复与边界控件立即生效", (t) => {
  const a = boot(t, "danny", memory(), memory(), "#photos", null, { animate: true });
  a.click("[data-read=door-front]");
  assert.equal(a.$('[data-zoom="-1"]').disabled, true);
  const viewport = a.$(".image-viewport"), img = viewport.querySelector("img");
  const key = (value, options = {}) => viewport.dispatchEvent(new a.w.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options }));
  viewport.focus();
  key("+");
  const first = a.effects.findLast((x) => x.element === img);
  assert.equal(img.style.width, "150%");
  assert.match(first.frames[0].transform, /scale/);
  key("+");
  assert.equal(first.cancelled, true);
  assert.equal(img.style.width, "200%");
  key("+", { ctrlKey: true });
  assert.equal(img.style.width, "200%");
  key("+"); key("+"); key("+");
  assert.equal(img.style.width, "300%");
  assert.equal(a.$('[data-zoom="1"]').disabled, true);
  key("0");
  assert.equal(img.style.width, "100%");
  assert.equal(a.$('[data-zoom-fit]').disabled, true);
  key("-");
  assert.equal(img.style.width, "100%");
  a.click('[data-zoom="1"]');
  a.$('[data-zoom-fit]').focus();
  a.click('[data-zoom-fit]');
  assert.equal(a.d.activeElement, viewport);
});
test("缩放以当前阅读中心保持位置，减少动态时也立即更新尺寸", (t) => {
  const a = boot(t, "danny", memory(), memory(), "#photos", null, { animate: true, systemReduced: true });
  a.click("[data-read=door-front]");
  const viewport = a.$(".image-viewport"), img = viewport.querySelector("img");
  Object.defineProperties(viewport, {
    clientWidth: { value: 200 }, clientHeight: { value: 200 },
    scrollWidth: { get: () => 200 * (Number(a.$('.image-viewer').dataset.scale) || 1) },
    scrollHeight: { get: () => 200 * (Number(a.$('.image-viewer').dataset.scale) || 1) },
  });
  viewport.getBoundingClientRect = () => new a.w.DOMRect(0, 0, 200, 200);
  img.getBoundingClientRect = () => {
    const size = 200 * (Number(a.$('.image-viewer').dataset.scale) || 1);
    return new a.w.DOMRect(-viewport.scrollLeft, -viewport.scrollTop, size, size);
  };
  a.click('[data-zoom="1"]');
  assert.equal(viewport.scrollLeft, 50);
  assert.equal(viewport.scrollTop, 50);
  a.click('[data-zoom-fit]');
  assert.equal(viewport.scrollLeft, 0);
  assert.equal(viewport.scrollTop, 0);
  assert.equal(a.effects.length, 0);
});
test("收起照片背面取消阅读动画并回到正面目录，关闭弹窗同样清理", (t) => {
  const a = boot(t, "danny", memory(), memory(), "#photos", null, { animate: true });
  a.click('[data-read=door-front]');
  a.click('[data-read=door-back]');
  a.click('[data-zoom="1"]');
  const effects = a.effects.filter((x) => a.$('#reading-pane').contains(x.element));
  a.click('#close-reading');
  assert.equal(a.$('#reading-pane').hidden, true);
  assert.ok(effects.every((x) => x.cancelled));
  assert.equal(a.d.activeElement.dataset.read, 'door-front');
  assert.equal(a.w.location.hash, '#photos');
  const b = boot(t, 'index', memory(), memory(), '', null, { animate: true });
  b.click('#intro-skip');
  b.click('#reset');
  const paper = b.effects.findLast((x) => x.element.id === 'modal-body');
  b.click('#cancel-choice');
  assert.equal(paper.cancelled, true);
  assert.equal(b.$('#modal').open, false);
});
test("收藏筛选、重点和搜索重绘后仍保留键盘操作位置", (t) => {
  const local = memory();
  makeStore(local).collect(data.files.badge);
  const a = boot(t, 'index', local, memory(), '', null, { animate: true });
  a.click('#intro-skip');
  a.click('[data-nav=mine]');
  a.click('[data-filter=image]');
  assert.equal(a.d.activeElement.dataset.filter, 'image');
  a.click('[data-filter=all]');
  a.click('[data-star=badge]');
  assert.equal(a.d.activeElement.dataset.star, 'badge');
  a.click('[data-filter=starred]');
  a.click('[data-star=badge]');
  assert.equal(a.$('[data-star=badge]'), null);
  assert.equal(a.d.activeElement.dataset.filter, 'starred');
  a.set('#notebook-search', '工牌');
  a.submit('#notebook-search-form');
  assert.equal(a.d.activeElement.id, 'notebook-search');
  a.click('#clear-notebook-search');
  assert.equal(a.d.activeElement.id, 'notebook-search');
});

test("普通自动补全只列数据建议，点击建议仅填入搜索框而不提交", (t) => {
  const a = boot(t, "search", memory(), memory(), "?q=");
  a.set("#search", "钱包");
  assert.ok(a.$("#suggestions [data-suggestion]"));
  assert.equal(a.$("#suggestions .suggestion-response"), null);
  const before = a.state().searchHistory.length;
  const first = a.$("#suggestions [data-suggestion]").dataset.suggestion;
  a.click("#suggestions [data-suggestion]");
  assert.equal(a.$("#search").value, first);
  assert.equal(a.state().searchHistory.length, before);
  assert.equal(a.$("#suggestions").hidden, true);
  assert.equal(a.$("#suggestions").textContent, "");
  assert.equal(a.$("#xiaolu-message").hidden, true);
});
test("独立结果页可直接打开与刷新，顶部搜索框保留查询并可再次提交", (t) => {
  const a = boot(
    t,
    "search",
    memory(),
    memory(),
    "?q=" + encodeURIComponent("棕色皮质钱包"),
  );
  assert.equal(a.$("#search").value, "棕色皮质钱包");
  assert.ok(a.$('[data-item="0816"]'));
  assert.match(a.$("#result-meta").textContent, /关键词：棕色皮质钱包/);
  a.set("#search", "钱包");
  a.submit("#search-form");
  assert.equal(a.$("#search").value, "钱包");
  assert.equal(new URLSearchParams(a.w.location.search).get("q"), "钱包");
  assert.ok(a.$('[data-item="0816"]'));
  const b = boot(t, "search", memory(), memory(), "?q=%E9%92%B1%E5%8C%85");
  assert.equal(b.$("#search").value, "钱包");
});
test("结果页小鹿回复独立于自动补全，未触发时保持隐藏", (t) => {
  const local = memory();
  const a = boot(t, "search", local, memory(), "?q=" + encodeURIComponent("小鹿"));
  assert.equal(a.$("#xiaolu-message").hidden, false);
  assert.match(a.$("#xiaolu-message").textContent, /小鹿/);
  assert.equal(a.$("#suggestions").hidden, true);
  assert.equal(a.$("#suggestions").textContent, "");
  const b = boot(
    t,
    "search",
    local,
    memory(),
    "?q=" + encodeURIComponent("完全不相关的字符串"),
  );
  assert.equal(b.$("#xiaolu-message").hidden, true);
});
test("结果页无匹配显示旧式 404 与重新搜索和返回入口", (t) => {
  const a = boot(
    t,
    "search",
    memory(),
    memory(),
    "?q=" + encodeURIComponent("完全不相关的字符串"),
  );
  assert.match(a.$("#results").textContent, /404 - NOT FOUND/);
  assert.match(a.$("#results").textContent, /抱歉，未找到与您搜索内容相匹配的记录。/);
  assert.ok(a.$('#results .not-found-actions a[href="search.html"]'));
  assert.ok(a.$('#results .not-found-actions a[href="index.html"]'));
});
test("首页 Hint 收纳本次查档与检索帮助，且只显示一份", (t) => {
  const a = boot(t, "index", memory(), memory(), "#home");
  assert.equal(a.$("#hint-panel").hidden, true);
  assert.equal(a.d.querySelectorAll("#journey-guide").length, 1);
  assert.equal(a.d.querySelectorAll("#field-guide").length, 1);
  assert.ok(a.$("#hint-guide-slot #journey-guide"));
  assert.ok(a.$("#hint-panel #field-guide"));
  assert.equal(a.$("#hint-panel-toggle").getAttribute("aria-expanded"), "false");
  a.click("#hint-panel-toggle");
  assert.equal(a.$("#hint-panel").hidden, false);
  assert.equal(a.$("#hint-panel-toggle").getAttribute("aria-expanded"), "true");
  a.click("#hint-panel-close");
  assert.equal(a.$("#hint-panel").hidden, true);
  assert.equal(a.$("#hint-panel-toggle").getAttribute("aria-expanded"), "false");
});
test("平台公告紧接首页导航横幅且全程只有一份", (t) => {
  const a = boot(t, "index", memory(), memory(), "#home");
  assert.equal(a.d.querySelectorAll(".notice").length, 1);
  assert.equal(a.$(".notice").parentElement.previousElementSibling, a.$("header.header"));
  assert.match(a.$(".notice").textContent, /平台公告/);
  assert.match(
    a.$(".notice").textContent,
    /查询提示：物品名称、地点和登记编号均可检索/,
  );
  const b = boot(t, "search", memory(), memory(), "?q=钱包");
  assert.equal(b.d.querySelectorAll(".notice").length, 0);
});
test("首页提交搜索仍本地渲染，自动补全与小鹿回复互不覆盖", (t) => {
  const a = boot(t, "index", memory(), memory(), "#home");
  a.set("#search", "钱包");
  assert.ok(a.$("#suggestions [data-suggestion]"));
  assert.equal(a.$("#suggestions .suggestion-response"), null);
  a.submit("#search-form");
  assert.ok(a.$('[data-item="0816"]'));
  assert.match(a.$("#suggestions").textContent, /小鹿/);
  assert.equal(a.$("#suggestions [data-suggestion]"), null);
});
test("小鹿从第一次普通失物查询就出现，每次一句并可点击原句续读", (t) => {
  const a = boot(t);
  a.click('#intro-skip');
  a.search('相机');
  assert.match(a.$('#suggestions').textContent, /我是小鹿/);
  assert.equal(a.d.querySelectorAll('.suggestion-response').length, 1);
  assert.ok(a.$('#results .related-queries [data-search="旧馆站"]'));
  assert.ok(a.$('[data-item="0810"]'));
  let messages = a.state().clues.filter((c) => c.id.startsWith('xiaolu-'));
  assert.equal(messages.length, 1);
  assert.deepEqual(Array.from(messages[0].body), ['我是小鹿，先替你查。']);
  a.click('#suggestions .suggestion-response');
  assert.match(a.$('#suggestions').textContent, /别只对名称/);
  a.click('#suggestions .suggestion-response');
  assert.match(a.$('#suggestions').textContent, /你捡过什么/);
  a.click('#suggestions .suggestion-response');
  assert.match(a.$('#suggestions').textContent, /我也丢过/);
  assert.equal(a.state().clues.filter((c) => c.id.startsWith('xiaolu-')).length, 4);
  assert.ok(!a.state().flags.includes('staff'));
  assert.equal(a.$('#application-panel').hidden, true);
});
test("小鹿前段可乱序交谈，多入口都能触发但不泄露员工谜底", (t) => {
  for (const query of ['钱包', '钥匙', '证件', '雨伞', '门票', '胶卷']) {
    const a = boot(t);
    a.click('#intro-skip');
    a.search(query);
    assert.match(a.$('#suggestions').textContent, /我是小鹿/);
  }
  const a = boot(t);
  a.click('#intro-skip');
  a.search('你在哪');
  assert.match(a.$('#suggestions').textContent, /B3/);
  a.search('你是谁');
  assert.match(a.$('#suggestions').textContent, /我叫小鹿/);
  a.search('小鹿');
  assert.match(a.$('#suggestions').textContent, /只有我/);
  a.search('你是谁');
  assert.match(a.$('#suggestions').textContent, /建议里/);
  a.search('客服');
  assert.equal(a.$('#suggestions').hidden, true);
  a.search('我要关了');
  assert.match(a.$('#suggestions').textContent, /别关/);
  a.search('帮帮我');
  assert.match(a.$('#suggestions').textContent, /看到我/);
  assert.doesNotMatch(a.state().clues.map((c) => c.body.join('')).join(''), /west1103|danny\.late|5003|你就是下一个|岗位职责/);
  for (const query of ['系统', '算法', '天气']) {
    a.search(query);
    assert.equal(a.$('#suggestions').hidden, true);
  }
});
test("前段续读跨刷新保留，新证据改变回应，终局后沉默且注销可重玩", (t) => {
  const local = memory(), a = boot(t, 'index', local);
  a.click('#intro-skip');
  a.search('你是谁');
  const before = a.state().clues.length;
  const b = boot(t, 'index', local, memory(), '#search');
  assert.equal(b.state().clues.length, before);
  b.search('你是谁');
  assert.match(b.$('#suggestions').textContent, /只有我/);
  makeStore(local).collect(data.files.trace);
  b.search('你是谁');
  assert.match(b.$('#suggestions').textContent, /你还记得/);
  b.search('Danny');
  assert.match(b.$('#suggestions').textContent, /你回来了/);
  makeStore(local).mark('staff');
  makeStore(local).finish('left');
  b.w.dispatchEvent(new b.w.StorageEvent('storage', { key: b.w.ZHAOHUI_JOURNEY.key }));
  assert.equal(b.$('#suggestions').hidden, true);
  b.search('小鹿');
  assert.equal(b.$('#suggestions').hidden, true);
  b.click('#reset'); b.click('#confirm-reset'); b.click('#intro-skip');
  b.search('钱包');
  assert.match(b.$('#suggestions').textContent, /我是小鹿/);
});

test("回退查询与从收藏返回不会替玩家消耗小鹿下一句", (t) => {
  const a = boot(t);
  a.click('#intro-skip');
  a.search('你是谁');
  a.search('你在哪');
  const before = a.state().clues.length;
  a.click('#query-back');
  assert.equal(a.state().clues.length, before);
  a.click('[data-nav=mine]');
  a.click('#notebook-return');
  assert.equal(a.state().clues.length, before);
  a.search('你是谁');
  assert.match(a.$('#suggestions').textContent, /只有我/);
});

function describeFound(a) {
  for (let i = 0; i < 3; i++) a.search('你丢了什么');
  assert.ok(a.state().clues.some((c) => c.id === 'xiaolu-arrival-lost-2'));
}
function offerFound(a, id) {
  a.click('[data-nav=mine]');
  a.click(`[data-inspect-found="${id}"]`);
  a.click(`[data-return-found="${id}"]`);
}
test("随身三件拾获物需先检查并听完失物特征，不改变玩家自己的目标", (t) => {
  const a = boot(t);
  a.click('#intro-skip');
  a.click('[data-nav=mine]');
  assert.equal(a.d.querySelectorAll('.found-object').length, 3);
  assert.doesNotMatch(a.$('.found-pocket').textContent, /焦黑/);
  a.click('[data-inspect-found=packet]');
  assert.match(a.$('#modal-body').textContent, /焦黑/);
  assert.equal(a.$('[data-return-found=packet]').disabled, true);
  assert.equal(a.state().belongings.returned, false);
  a.click('#close-modal');
  assert.equal(a.d.activeElement.dataset.inspectFound, 'packet');
  describeFound(a);
  assert.equal(a.state().goal, '');
  a.search('钱包');
  describeFound(a);
  assert.equal(a.state().goal, '钱包');
  assert.match(a.$('#suggestions').textContent, /已保存/);
  assert.equal(a.state().clues.filter((c) => c.id.startsWith('xiaolu-arrival-lost')).length, 3);
});
test("交错物品保留在袋中并给出具体回应，同一错误不重复说话", (t) => {
  const a = boot(t);
  a.click('#intro-skip');
  describeFound(a);
  offerFound(a, 'key');
  assert.match(a.$('#suggestions .suggestion-response').textContent, /没有齿/);
  assert.equal(a.state().belongings.returned, false);
  assert.ok(!a.state().clues.some((c) => c.id === 'found-return-receipt'));
  offerFound(a, 'key');
  assert.equal(a.$('#suggestions .suggestion-response'), null);
  assert.match(a.$('#suggestions').textContent, /此前已核对/);
  offerFound(a, 'sleeve');
  assert.match(a.$('#suggestions .suggestion-response').textContent, /烧痕/);
  assert.equal(a.state().belongings.returned, false);
  a.click('[data-nav=mine]');
  assert.match(a.$('#found-title').textContent, /3 件/);
});
test("交还正确物品保存回执并开放 Danny 的关键便笺，仍需自己解员工凭证", (t) => {
  const local = memory(), a = boot(t, 'index', local);
  a.click('#intro-skip');
  describeFound(a);
  offerFound(a, 'packet');
  assert.equal(a.state().belongings.returned, true);
  assert.match(a.$('#suggestions').textContent, /是这颗/);
  assert.equal(a.state().clues.filter((c) => c.id === 'found-return-receipt').length, 1);
  assert.ok(!a.state().flags.includes('staff'));
  assert.equal(a.$('#application-panel').hidden, true);
  a.click('[data-nav=mine]');
  assert.match(a.$('#found-title').textContent, /2 件/);
  a.click('[data-inspect-found=packet]');
  assert.equal(a.$('[data-return-found]'), null);
  const b = boot(t, 'danny', local, memory(), '#journal--return-note');
  assert.match(b.$('#reading-pane').textContent, /两边没有同步/);
  assert.ok(b.state().clues.some((c) => c.id === 'return-note'));
  assert.ok(!b.$('[data-read=night]'));
  const reload = boot(t, 'index', local, memory(), '#mine');
  assert.match(reload.$('#found-title').textContent, /2 件/);
  assert.equal(reload.state().belongings.returned, true);
});
test("未交还的游客不能通过深链接和站内搜索偷看奖励便笺", (t) => {
  const a = boot(t, 'danny', memory(), memory(), '#journal--return-note');
  assert.ok(!a.state().clues.some((c) => c.id === 'return-note'));
  assert.doesNotMatch(a.$('#reading-pane').textContent, /两边没有同步/);
  a.set('#site-search', '对钟'); a.submit('#site-search-form');
  assert.ok(!a.$('.entry-list [data-read=return-note]'));
});
test("另一个窗口交还后 Danny 游客目录会开放奖励，错误物品不会解锁", (t) => {
  const local = memory(), a = boot(t, 'index', local);
  a.click('#intro-skip');
  const b = boot(t, 'danny', local);
  assert.ok(!b.$('.entry-list [data-read=return-note]'));
  describeFound(a); offerFound(a, 'sleeve');
  b.w.dispatchEvent(new b.w.StorageEvent('storage', { key: b.w.ZHAOHUI_JOURNEY.key }));
  assert.ok(!b.$('.entry-list [data-read=return-note]'));
  offerFound(a, 'packet');
  b.w.dispatchEvent(new b.w.StorageEvent('storage', { key: b.w.ZHAOHUI_JOURNEY.key }));
  assert.ok(b.$('.entry-list [data-read=return-note]'));
});
test("注销重置物品和奖励，旧轮次交还与终局后的交还不会改写存档", (t) => {
  const local = memory(), store = makeStore(local);
  store.update((s) => { s.introduced = true; });
  store.inspectFound('packet');
  store.collect({ id: 'xiaolu-arrival-lost-2', title: '包纸的一角是焦的。', kind: 'message' });
  const old = store.read().runToken;
  store.reset();
  store.update((s) => { s.introduced = true; });
  store.inspectFound('packet');
  store.collect({ id: 'xiaolu-arrival-lost-2', title: '包纸的一角是焦的。', kind: 'message' });
  assert.equal(store.returnFound('packet', old).outcome, 'blocked');
  assert.equal(store.read().belongings.returned, false);
  assert.equal(store.returnFound('unknown', store.read().runToken).outcome, 'blocked');
  store.mark('staff'); store.finish('left');
  assert.equal(store.returnFound('packet', store.read().runToken).outcome, 'blocked');
  store.reset();
  assert.deepEqual(store.read().belongings, { inspected: [], returned: false });
  assert.ok(!store.read().clues.some((c) => c.id === 'found-return-receipt'));
});

test("较多既有收藏不会挤掉新增物品回执，奖励可在完整调查后保存", (t) => {
  const local = memory(), store = makeStore(local);
  store.update((s) => {
    s.introduced = true;
    s.clues = Array.from({ length: 100 }, (_, i) => ({ id: 'existing-' + i, title: '已取得材料 ' + i, kind: 'record', body: [] }));
  });
  const a = boot(t, 'index', local);
  describeFound(a);
  offerFound(a, 'packet');
  assert.ok(a.state().clues.some((c) => c.id === 'found-return-receipt'));
  assert.equal(a.state().clues.filter((c) => c.id.startsWith('existing-')).length, 100);
});
