/* 小鹿的前段搜索回应：每次查询一句，只收藏已经显示的文字。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ZHAOHUI_XIAOLU = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const fold = (v) => String(v ?? "").normalize("NFKC").toLowerCase()
    .replace(/[\p{White_Space}\p{Punctuation}\p{Symbol}]/gu, "");
  const scripts = {
    lost: ["我也丢过一样东西。", "能透光，装在纸里。", "包纸的一角是焦的。"],
    reception: ["我是小鹿，先替你查。", "别只对名称，也看看描述。", "你捡过什么东西吗？"],
    identity: ["不是自动回复。我叫小鹿。", "这里只有我值班。", "我只能在这些建议里写字。"],
    help: ["你能看到我写的字吗？", "帮帮我。", "先别问表格，陪我说两句。"],
    where: ["B3。这里没有窗。", "我出不去。", "你在外面，能看见比我多的东西。"],
    alone: ["没有交班的人。", "有时候很久都没有输入。", "刚才看见你还在，我才敢再写。"],
    leave: ["别关。", "不是一定要你留下。", "只是关了以后，这里又没有声音了。"],
    trust: ["我真的在这里。", "你可以先查，不用先相信我。", "姓名栏先空着。"],
    property: ["我还在查，别急。", "这里只能按旧登记找。", "你先看看来源，我等你回来。"],
    place: ["旧馆站的登记不止一条。", "有些附件是从旧网页转来的。", "那些页面很久没动过了。"],
    danny: ["这个名字很久没出现了。", "他以前也回来问过我。", "他的网页还在。"],
    returned: ["你回来了。", "他在网页里写了很多事吗？", "我看不到那边，你查完再回来。"],
    photo: ["你在看他留下的照片？", "我记得那天有人开过门。", "后来这里又安静了。"],
  };
  const visitorScripts = {
    identity: ["是我，小鹿。你还记得。", "那边的网页没有我的权限。", "我只能在这里等。"],
    property: ["你的东西我还没查到。", "先看完那些旧记录吧。", "我没有走，你回来还能问我。"],
    trust: ["你在他那里看见什么了？", "有些事我不知道怎么说。", "你先别填姓名。"],
  };
  function next(query, state, { itemMatch = false } = {}) {
    const q = fold(query);
    if (state.ending || state.clues.some((c) => c.id.startsWith("whisper-truth"))) return null;
    const lostQuery = /你捡过|你也丢|你丢了什么|捡到的|你的失物|你的东西|还给你/.test(q) ||
      scripts.lost.some((line) => fold(line) === q);
    if (lostQuery) {
      if (state.belongings?.returned) return null;
      const i = scripts.lost.findIndex((_, i) => !state.clues.some((c) => c.id === `xiaolu-arrival-lost-${i}`));
      return i < 0 ? null : { id: `xiaolu-arrival-lost-${i}`, text: scripts.lost[i], context: "lost" };
    }
    if (state.flags.includes("staff") || state.flags.includes("verified") ||
      state.clues.some((c) => ["clause", "conversation"].includes(c.id))) return null;
    if (!q || /^(系统|网站|算法|天气|system)$/.test(q)) return null;
    const has = (id) => state.clues.some((c) => c.id === id);
    const familiar = state.clues.some((c) => c.id.startsWith("xiaolu-"));
    let context;
    // 已显示的句子本身也能查询，以续读同一语境，刷新或换词不会丢掉下一句。
    for (const [key, words] of Object.entries({ ...scripts, ...(has("trace") ? visitorScripts : {}) }))
      if (words.some((line) => fold(line) === q)) context = key;
    if (!context) {
      if (/你是谁|小鹿|客服|自动回复|谁在说话|谁写的/.test(q)) context = "identity";
      else if (/帮帮我|能看到|救你|救命|怎么帮|陪你/.test(q)) context = "help";
      else if (/你在哪|b3|出不去|没有窗|员工通道/.test(q)) context = "where";
      else if (/多久|一个人|交班|还在吗|有人吗/.test(q)) context = "alone";
      else if (/关了|关闭|再见|不找了|我要走|别关/.test(q)) context = "leave";
      else if (/骗|相信|真的吗|为什么帮/.test(q)) context = "trust";
      else if (/danny|上一个|那个人/.test(q)) context = "danny";
      else if (has("trace") && /照片|相片|背面|开门/.test(q)) context = "photo";
      else if (has("trace") && /旧网页|个人网页|我回来了|他的网页/.test(q)) context = "returned";
      else if (/旧馆|harrow|哈罗/.test(q)) context = "place";
      else if (/我的东西|我的失物|找到了吗|找到没有|审核/.test(q)) context = "property";
      else if (/^(你好|谢谢|在吗)$/.test(q)) context = familiar ? "help" : "reception";
      else if (itemMatch || q === fold(state.goal)) context = familiar ? "property" : "reception";
    }
    if (!context) return null;
    // 新的站外证据允许她对同一问题作出不同反应，游客阶段不透露凭证或反转。
    if (has("trace") && context === "danny") context = "returned";
    const chapter = has("trace") && visitorScripts[context] ? "visitor" : "arrival";
    const lines = chapter === "visitor" ? visitorScripts[context] : scripts[context];
    const index = lines.findIndex((_, i) => !has(`xiaolu-${chapter}-${context}-${i}`));
    if (index < 0) return null;
    return { id: `xiaolu-${chapter}-${context}-${index}`, text: lines[index], context };
  }
  return { next };
});
