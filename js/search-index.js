/* 只检索调用方传入的公开或有权限材料，不从隐藏剧情补词。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ZHAOHUI_SEARCH = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const fold = (v) =>
    String(v ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\p{White_Space}\p{Punctuation}\p{Symbol}]/gu, "");
  const groups = [
    ["钱包", "皮夹", "钱夹"],
    ["钥匙", "门匙", "钥匙扣"],
    ["耳机", "headphones", "airpods"],
    ["证件", "工牌", "卡套", "学生证", "校园卡"],
    ["雨伞", "伞", "下雨"],
    ["相机", "摄影", "胶片", "胶卷"],
    ["旧书", "书本"],
    ["围巾", "围脖"],
    ["票根", "车票", "门票"],
    ["旧馆", "Harrow House", "哈罗", "美术馆", "画廊"],
    ["明信片", "邮寄"],
    ["纸袋", "袋子", "手提袋"],
  ];
  function matches(query, records) {
    const q = fold(query).slice(0, 80);
    if (!q) return records.slice();
    const expanded = groups
      .filter((group) => group.some((term) => q.includes(fold(term))))
      .flat()
      .map(fold);
    return records
      .map((entry, index) => {
        const text = fold(
          [
            entry.id,
            entry.name,
            entry.title,
            entry.type,
            entry.place,
            entry.description,
            entry.summary,
            ...(entry.keywords || []),
            ...(entry.body || []),
            ...(entry.fields || []).flat(),
          ]
            .filter(Boolean)
            .join(" "),
        );
        const score = text.includes(q)
          ? 100
          : expanded.some((term) => text.includes(term))
            ? 40
            : 0;
        return { entry, index, score };
      })
      .filter((x) => x.score)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((x) => x.entry);
  }
  function related(records, query) {
    const q = fold(query);
    return [
      ...new Set(
        records
          .flatMap((x) => [
            x.type,
            x.place?.split(" · ")[0],
            ...(x.keywords || []).slice(0, 2),
          ])
          .filter((x) => x && fold(x) !== q),
      ),
    ].slice(0, 6);
  }
  return { fold, matches, related };
});
