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
    const facets = groups
      .filter((group) => group.some((term) => q.includes(fold(term))))
      .map((group) => group.map(fold));
    const loose = String(query).trim().split(/\s+/).map(fold).filter(Boolean);
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
            entry.note,
            entry.source,
            ...(entry.keywords || []),
            ...(Array.isArray(entry.body) ? entry.body : [entry.body]),
            ...(entry.fields || []).flat(),
          ]
            .filter(Boolean)
            .join(" "),
        );
        const score = text.includes(q)
          ? 100
          : facets.length &&
              facets.every((group) =>
                group.some((term) => text.includes(term)),
              ) &&
              (loose.length < 2 ||
                loose.every(
                  (term) =>
                    text.includes(term) ||
                    facets.some(
                      (group) =>
                        group.includes(term) &&
                        group.some((alias) => text.includes(alias)),
                    ),
                ))
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
  /* 自动补全只从调用方已经可见的材料里取词，不读取隐藏剧情。
     命中的原词优先，随后补上相关标签，和普通搜索使用同一份数据。 */
  function suggest(query, records, limit = 6) {
    const q = fold(query).slice(0, 80);
    if (!q) return [];
    const terms = [
      ...new Set(
        matches(query, records).flatMap((x) => [
          x.name || x.title,
          x.type,
          x.place?.split(" · ")[0],
          ...(x.keywords || []).slice(0, 3),
        ]),
      ),
    ].filter((x) => x && fold(x) !== q);
    const direct = terms.filter((x) => fold(x).includes(q));
    const rest = terms.filter((x) => !fold(x).includes(q));
    return [...direct, ...rest].slice(0, limit);
  }
  return { fold, matches, related, suggest };
});
