/* 动效只描绘已经完成的状态变化；不等待动画来解锁内容或提交进度。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.ZHAOHUI_MOTION = factory(root, root.ZHAOHUI_JOURNEY);
})(typeof globalThis !== "undefined" ? globalThis : this, function (w, store) {
  "use strict";
  const active = new Map(),
    ease = "cubic-bezier(.22,.7,.22,1)";
  let media;
  try {
    media = w.matchMedia("(prefers-reduced-motion: reduce)");
  } catch {}
  function reduced() {
    return !!media?.matches || store.read().settings.reduced;
  }
  function cancel(element) {
    const a = active.get(element);
    if (a) {
      active.delete(element);
      try {
        a.cancel();
      } catch {}
    }
  }
  function cancelTree(root) {
    if (!root) return;
    for (const el of [...active.keys()])
      if (el === root || root.contains(el)) cancel(el);
  }
  function cancelAll() {
    for (const el of [...active.keys()]) cancel(el);
  }
  function sync() {
    const value = reduced();
    w.document.documentElement.dataset.motion = value ? "reduced" : "full";
    if (value) cancelAll();
    return !value;
  }
  function play(el, frames, options = {}) {
    if (!el || !el.isConnected || !sync() || typeof el.animate !== "function")
      return null;
    cancel(el);
    let a;
    try {
      a = el.animate(frames, {
        duration: 180,
        easing: ease,
        fill: "backwards",
        ...options,
      });
    } catch {
      return null;
    }
    if (!a) return null;
    active.set(el, a);
    const clean = () => {
      if (active.get(el) === a) active.delete(el);
    };
    if (a.finished?.then) a.finished.then(clean, clean);
    else {
      a.onfinish = clean;
      a.oncancel = clean;
    }
    return a;
  }
  function enter(root, { items = null } = {}) {
    if (!root || !sync()) return;
    const rows = items ? [...root.querySelectorAll(items)].slice(0, 8) : [];
    if (rows.length)
      rows.forEach((row, i) =>
        play(
          row,
          [
            { opacity: 0.55, transform: "translateY(5px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 185, delay: i * 14 },
        ),
      );
    else
      play(
        root,
        [
          { opacity: 0.72, transform: "translateY(4px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 170 },
      );
  }
  function flip(root) {
    play(
      root,
      [
        { opacity: 0.72, transform: "perspective(900px) rotateY(-12deg)" },
        { opacity: 1, transform: "perspective(900px) rotateY(0)" },
      ],
      { duration: 230 },
    );
  }
  function feedback(root, kind = "success") {
    if (kind === "error")
      play(
        root,
        [
          { transform: "translateX(0)" },
          { transform: "translateX(3px)", offset: 0.25 },
          { transform: "translateX(-2px)", offset: 0.6 },
          { transform: "translateX(0)" },
        ],
        { duration: 180 },
      );
    else
      play(
        root,
        [
          { boxShadow: "inset 3px 0 0 #91aa7b", opacity: 0.75 },
          { boxShadow: "inset 0 0 0 #91aa7b00", opacity: 1 },
        ],
        { duration: 260 },
      );
  }
  function capture(root, selector = "[data-event]") {
    const positions = new Map();
    if (!root || !sync()) return positions;
    root
      .querySelectorAll(selector)
      .forEach((el) =>
        positions.set(el.dataset.event, el.getBoundingClientRect().top),
      );
    return positions;
  }
  function reorder(root, positions) {
    if (!root || !sync()) return;
    root.querySelectorAll("[data-event]").forEach((el) => {
      const old = positions.get(el.dataset.event);
      if (old === undefined) return;
      const delta = old - el.getBoundingClientRect().top;
      if (Math.abs(delta) > 0.5)
        play(
          el,
          [
            { transform: `translateY(${delta}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 210 },
        );
    });
  }
  if (media?.addEventListener) media.addEventListener("change", sync);
  else media?.addListener?.(sync);
  w.addEventListener("storage", (e) => {
    if (e.key === store.key) sync();
  });
  w.addEventListener("pagehide", cancelAll);
  w.addEventListener("pageshow", sync);
  sync();
  return Object.freeze({
    reduced,
    sync,
    enter,
    flip,
    feedback,
    capture,
    reorder,
    cancelTree,
    cancelAll,
  });
});
