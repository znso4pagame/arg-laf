/* 有界、离线的线索匹配。候选范围由调用方提供，不读取隐藏剧情。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ZHAOHUI_MATCHER = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function fold(value) {
    return Array.from(
      String(value ?? "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\p{White_Space}\p{Punctuation}\p{Symbol}]/gu, ""),
    )
      .slice(0, 80)
      .join("");
  }
  // OSA 编辑距离：插入、删除、替换、相邻交换均计一次。
  function similarity(input, target) {
    const a = Array.from(fold(input)),
      b = Array.from(fold(target));
    if (!a.length || !b.length) return 0;
    const rows = Array.from({ length: a.length + 1 }, () =>
      new Array(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i++) rows[i][0] = i;
    for (let j = 0; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) {
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    return Math.max(
      0,
      1 - rows[a.length][b.length] / Math.max(a.length, b.length),
    );
  }
  function reveal(label, score) {
    const chars = Array.from(String(label));
    const level = score >= 1 ? 3 : score >= 0.7 ? 2 : score >= 0.5 ? 1 : 0;
    const visible =
      level === 3
        ? chars.length
        : level
          ? Math.min(chars.length - 1, Math.ceil((chars.length * level) / 3))
          : 0;
    return {
      level,
      stage: ["", "A", "AB", "ABC"][level],
      text:
        chars.slice(0, visible).join("") +
        "□".repeat(Math.max(0, chars.length - visible)),
    };
  }
  function difference(input, target) {
    const a = Array.from(fold(input)),
      b = Array.from(fold(target));
    if (a.join("") === b.join("")) return "exact";
    if (a.length < b.length && b.join("").includes(a.join("")))
      return "fragment";
    const distance = Math.round(
      (1 - similarity(input, target)) * Math.max(a.length, b.length),
    );
    if (distance === 1 && a.length === b.length + 1) return "extra";
    if (distance === 1 && b.length === a.length + 1) return "missing";
    if (distance === 1 && a.length === b.length) {
      const changed = a
        .map((c, i) => (c === b[i] ? -1 : i))
        .filter((i) => i >= 0);
      if (
        changed.length === 2 &&
        changed[1] === changed[0] + 1 &&
        a[changed[0]] === b[changed[1]] &&
        a[changed[1]] === b[changed[0]]
      )
        return "order";
      return "spelling";
    }
    return "near";
  }
  function rank(input, candidates, limit = 3) {
    if (!fold(input)) return [];
    const results = candidates
      .map((candidate) => {
        const forms = [
          ...new Set([candidate.label, ...(candidate.forms || [])]),
        ];
        const best = forms.reduce(
          (match, form) => {
            const score = similarity(input, form);
            return score > match.score ? { form, score } : match;
          },
          { form: candidate.label, score: -1 },
        );
        const { score } = best;
        // 部分匹配沿玩家正在使用的同义写法提示，完整时再显示规范名称。
        const fragmentLabel = score === 1 ? candidate.label : best.form;
        return {
          key: candidate.key,
          label: candidate.label,
          score,
          kind: difference(input, best.form),
          percent: Math.floor(score * 100 + 1e-8),
          ...reveal(fragmentLabel, score),
        };
      })
      .filter((result) => result.level > 0);
    results.sort(
      (a, b) =>
        b.score - a.score ||
        a.label.length - b.label.length ||
        a.key.localeCompare(b.key),
    );
    const best = results[0]?.score || 0;
    // 并列时保留备选，不把一个相近方向伪装成唯一答案。
    return results
      .filter((result) => result.score >= best - 0.08)
      .slice(0, Math.max(1, Math.min(3, limit)));
  }
  return Object.freeze({ fold, similarity, reveal, difference, rank });
});
