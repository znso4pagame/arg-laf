/* 纯前端成就提示：独立存档、单条弹窗与队列，不参与剧情判定。 */
(function (root) {
  "use strict";
  const KEY = "arg-laf-achievements-v1";
  const ACHIEVEMENTS = {
    "first-visit": { title: "初来乍到", how: "打开“找回网”主站", icon: "🏠" },
    "first-search": { title: "第一次搜索", how: "在主站使用搜索功能", icon: "🔍" },
    "found-transcript": {
      title: "转录说明",
      how: "在登记详情里找到“登记来源与转录说明”",
      icon: "📄",
    },
    "old-archive": { title: "旧网页", how: "通过转录说明进入旧网页存档", icon: "🗄️" },
    "danny-visitor": { title: "游客区", how: "进入 Danny 个人站的游客区", icon: "👤" },
    "employee-pass": {
      title: "员工凭证",
      how: "拼出正确的员工凭证并升级权限",
      icon: "🪪",
    },
    workbox: { title: "工作匣", how: "解锁“工作匣”功能", icon: "🧰" },
    "private-search": { title: "私有搜索", how: "解锁“私有搜索”功能", icon: "🔎" },
    "old-cabinet": { title: "旧柜", how: "首次进入“旧柜”区域", icon: "🗃️" },
    "compare-materials": {
      title: "比对材料",
      how: "在旧柜中比较材料并标记差异",
      icon: "⚖️",
    },
    "original-copy": {
      title: "原件与副本",
      how: "正确识别同一事件的原件与副本",
      icon: "📑",
    },
    "blue-marble": {
      title: "蓝色玻璃珠",
      how: "通过蓝色玻璃珠线索找到 Danny 网站",
      icon: "🔵",
      image: "../assets/achievements/blue-marble.png",
    },
    "found-url": {
      title: "网址线索",
      how: "在“寻找物品”中找到网址并到达汇合点",
      icon: "🔗",
    },
    "final-sign": { title: "终局签署", how: "确认“终局签署”", icon: "✍️" },
    "final-abandon": { title: "放弃", how: "确认“放弃”终局", icon: "🚪" },
    "clue-assist": { title: "线索辅助", how: "开启“线索辅助”功能", icon: "💡" },
    collector: { title: "材料收藏家", how: "将材料保存到“我的”页面", icon: "📌" },
  };

  let unlocked = load();
  let queue = [];
  let current = null;
  let generation = 0;

  function load() {
    try {
      const saved = JSON.parse(root.localStorage.getItem(KEY) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
    } catch {}
    return {};
  }
  function save() {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(unlocked));
    } catch {}
  }
  function isUnlocked(id) {
    return Object.prototype.hasOwnProperty.call(unlocked, id);
  }
  function container() {
    let node = document.getElementById("achievement-toasts");
    if (!node) {
      node = document.createElement("div");
      node.id = "achievement-toasts";
      node.setAttribute("aria-live", "polite");
      document.body.appendChild(node);
    }
    return node;
  }
  function remove(node, token) {
    if (token !== generation) return;
    node.remove();
    if (current === node) current = null;
    showNext();
  }
  function showNext() {
    if (current || !queue.length) return;
    const id = queue.shift();
    const config = ACHIEVEMENTS[id];
    if (!config) return showNext();
    const token = ++generation;
    const node = document.createElement("div");
    node.className = "achievement-toast";
    node.dataset.achievement = id;
    node.setAttribute("role", "status");
    const icon = document.createElement("span");
    icon.className = "achievement-icon";
    icon.setAttribute("aria-hidden", "true");
    if (config.image) {
      const image = document.createElement("img");
      image.src = config.image;
      image.alt = "";
      image.addEventListener("error", () => {
        icon.replaceChildren(document.createTextNode(config.icon));
      });
      icon.appendChild(image);
    } else icon.textContent = config.icon;
    const copy = document.createElement("div");
    copy.className = "achievement-copy";
    const kicker = document.createElement("span");
    kicker.className = "achievement-kicker";
    kicker.textContent = "Achievement Unlocked / 成就解锁";
    const title = document.createElement("strong");
    title.className = "achievement-title";
    title.textContent = config.title;
    const how = document.createElement("span");
    how.className = "achievement-how";
    how.textContent = "你是怎么做到的：" + config.how;
    copy.append(kicker, title, how);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "achievement-close";
    close.setAttribute("aria-label", "关闭成就提示");
    close.textContent = "×";
    close.addEventListener("click", () => {
      const closeToken = ++generation;
      node.classList.add("is-leaving");
      root.setTimeout(() => remove(node, closeToken), 260);
    });
    node.append(icon, copy, close);
    container().appendChild(node);
    current = node;
    root.setTimeout(() => {
      if (token !== generation) return;
      node.classList.add("is-leaving");
      root.setTimeout(() => remove(node, token), 320);
    }, 4000);
  }
  function unlock(id) {
    if (!ACHIEVEMENTS[id] || isUnlocked(id)) return false;
    unlocked[id] = Date.now();
    save();
    queue.push(id);
    showNext();
    return true;
  }
  function reset() {
    unlocked = {};
    queue = [];
    generation++;
    current = null;
    try {
      root.localStorage.removeItem(KEY);
    } catch {}
    const node = document.getElementById("achievement-toasts");
    if (node) node.replaceChildren();
  }
  root.AchievementSystem = { unlock, isUnlocked, reset, ACHIEVEMENTS, KEY };
  if (
    root.location &&
    new URLSearchParams(root.location.search).get("resetAchievements") === "1"
  )
    reset();
})(typeof window !== "undefined" ? window : globalThis);
