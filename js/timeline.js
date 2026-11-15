/* Danny 当班记录的人工校订。记录时间来自不同钟表，排序不等同按原始字面时间排序。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DANNY_TIMELINE = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const events = [
    { id: "keys", label: "领取照明钥匙" },
    { id: "wall", label: "西北角异常读数登记" },
    { id: "reply", label: "收到找回网第一次回复" },
    { id: "draft", label: "保存认领附则草稿" },
    { id: "door", label: "通道门口出现 Danny" },
    { id: "test", label: "灯带测试失败" },
  ];
  const correct = ["keys", "wall", "reply", "draft", "door"];
  function check(order, included) {
    const chosen = order.filter((id) => included.includes(id));
    return (
      chosen.length === correct.length &&
      chosen.every((id, i) => id === correct[i])
    );
  }
  return { events, check };
});
