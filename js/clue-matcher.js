/* 有界、离线的线索匹配。候选范围由调用方提供，不读取隐藏剧情。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZHAOHUI_MATCHER = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function fold(value) {
    return Array.from(String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[\p{White_Space}\p{Punctuation}\p{Symbol}]/gu, '')).slice(0, 80).join('');
  }
  // Damerau 编辑距离：插入、删除、替换、相邻交换均计一次。
  function similarity(input, target) {
    const a = Array.from(fold(input)), b = Array.from(fold(target));
    if (!a.length || !b.length) return 0;
    const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) rows[i][0] = i;
    for (let j = 0; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i-1][j] + 1, rows[i][j-1] + 1, rows[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) rows[i][j] = Math.min(rows[i][j], rows[i-2][j-2] + 1);
    }
    return Math.max(0, 1 - rows[a.length][b.length] / Math.max(a.length, b.length));
  }
  function reveal(label, score) {
    const chars = Array.from(String(label));
    const level = score >= 1 ? 3 : score >= .7 ? 2 : score >= .5 ? 1 : 0;
    const visible = level === 3 ? chars.length : level ? Math.min(chars.length - 1, Math.ceil(chars.length * level / 3)) : 0;
    return { level, stage: ['', 'A', 'AB', 'ABC'][level], text: chars.slice(0, visible).join('') + '□'.repeat(Math.max(0, chars.length - visible)) };
  }
  function rank(input, candidates, limit = 3) {
    if (!fold(input)) return [];
    const results = candidates.map(candidate => {
      const forms = [...new Set([candidate.label, ...(candidate.forms || [])])];
      const score = Math.max(...forms.map(form => similarity(input, form)));
      return { key: candidate.key, label: candidate.label, score, percent: Math.floor(score * 100 + 1e-8), ...reveal(candidate.label, score) };
    }).filter(result => result.level > 0);
    results.sort((a, b) => b.score - a.score || a.label.length - b.label.length || a.key.localeCompare(b.key));
    const best = results[0]?.score || 0;
    // 并列时保留备选，不把一个相近方向伪装成唯一答案。
    return results.filter(result => result.score >= best - .08).slice(0, Math.max(1, Math.min(3, limit)));
  }
  return Object.freeze({ fold, similarity, reveal, rank });
});
