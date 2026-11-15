/* 纯静态 ARG 的共用存档。材料、个人推测与实际进度分开保存。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else {
    let storage;
    try {
      storage = root.localStorage;
    } catch {}
    root.ZHAOHUI_JOURNEY = factory(storage);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (storage) {
  "use strict";
  const key = "zhaohui-journey-v2";
  let memory = null,
    usingStorage = !!storage;
  const text = (value, max = 1000) =>
    typeof value === "string" ? value.slice(0, max) : "";
  const empty = () => ({
    version: 2,
    revision: 0,
    introduced: false,
    goal: "",
    lastQuery: "",
    searchHistory: [],
    searchCursor: -1,
    danny: {
      query: "",
      pair: ["", ""],
      timeline: ["draft", "test", "door", "keys", "reply", "wall"],
      included: ["draft", "test", "door", "keys", "reply", "wall"],
    },
    ending: "",
    name: "",
    flags: [],
    clues: [],
    notes: [],
    settings: { assist: false, reduced: false },
    registrations: [],
  });
  function cleanEntry(value) {
    if (!value || !text(value.id, 100) || !text(value.title, 100)) return null;
    return {
      id: text(value.id, 100),
      title: text(value.title, 100),
      kind: ["page", "record", "image", "message"].includes(value.kind)
        ? value.kind
        : "record",
      source: text(value.source, 100),
      summary: text(value.summary, 400),
      body: Array.isArray(value.body)
        ? value.body
            .filter((x) => typeof x === "string")
            .slice(0, 20)
            .map((x) => text(x, 1500))
        : [],
      fields: Array.isArray(value.fields)
        ? value.fields
            .filter((x) => Array.isArray(x) && x.length === 2)
            .slice(0, 20)
            .map((x) => [text(x[0], 60), text(x[1], 400)])
        : [],
      image: /^\.\.\/assets\/[a-z0-9-]+\.svg$/.test(value.image || "")
        ? value.image
        : "",
      url: /^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/.test(value.url || "")
        ? value.url
        : "",
      starred: !!value.starred,
      note: text(value.note, 2000),
    };
  }
  function normalize(raw) {
    const state = empty();
    if (!raw || raw.version !== 2) return state;
    state.revision = Math.max(0, Number(raw.revision) || 0);
    state.introduced = raw.introduced === true;
    state.goal = text(raw.goal, 60);
    state.lastQuery = text(raw.lastQuery, 80);
    state.searchHistory = Array.isArray(raw.searchHistory)
      ? raw.searchHistory
          .filter((x) => typeof x === "string" && x.trim())
          .slice(-12)
          .map((x) => text(x, 80))
      : [];
    state.searchCursor = Math.min(
      state.searchHistory.length - 1,
      Math.max(
        -1,
        Number.isInteger(raw.searchCursor)
          ? raw.searchCursor
          : state.searchHistory.length - 1,
      ),
    );
    const allowedPair = ["municipalA", "municipalB", "renovation", "inventory"];
    state.danny.query = text(raw.danny?.query, 80);
    state.danny.pair = [0, 1].map((i) =>
      allowedPair.includes(raw.danny?.pair?.[i]) ? raw.danny.pair[i] : "",
    );
    const eventIds = ["draft", "test", "door", "keys", "reply", "wall"];
    if (
      Array.isArray(raw.danny?.timeline) &&
      raw.danny.timeline.length === 6 &&
      new Set(raw.danny.timeline).size === 6 &&
      raw.danny.timeline.every((id) => eventIds.includes(id))
    )
      state.danny.timeline = raw.danny.timeline.slice();
    if (Array.isArray(raw.danny?.included))
      state.danny.included = [
        ...new Set(raw.danny.included.filter((id) => eventIds.includes(id))),
      ];
    state.ending = ["claimed", "left"].includes(raw.ending) ? raw.ending : "";
    state.name = text(raw.name, 30);
    state.flags = Array.isArray(raw.flags)
      ? [
          ...new Set(
            raw.flags.filter((x) =>
              [
                "trace",
                "staff",
                "cabinet",
                "compared",
                "verified",
                "scare-seen",
                "timeline",
              ].includes(x),
            ),
          ),
        ]
      : [];
    state.clues = Array.isArray(raw.clues)
      ? raw.clues.map(cleanEntry).filter(Boolean).slice(0, 100)
      : [];
    state.notes = Array.isArray(raw.notes)
      ? raw.notes
          .filter((x) => x && text(x.id, 100))
          .slice(0, 50)
          .map((x) => ({
            id: text(x.id, 100),
            title: text(x.title, 80) || "个人推测",
            body: text(x.body, 3000),
          }))
      : [];
    state.settings = {
      assist: raw.settings?.assist === true,
      reduced: raw.settings?.reduced === true,
    };
    state.registrations = Array.isArray(raw.registrations)
      ? raw.registrations
          .filter(
            (x) =>
              x && typeof x.name === "string" && typeof x.place === "string",
          )
          .slice(0, 50)
          .map((x) => ({
            id: text(x.id, 80),
            name: text(x.name, 60),
            place: text(x.place, 80),
            description: text(x.description, 300),
            type: text(x.type, 20),
            date: text(x.date, 20),
          }))
      : [];
    return state;
  }
  function read() {
    if (!usingStorage) return normalize(memory);
    try {
      const raw = storage.getItem(key);
      const state = raw ? normalize(JSON.parse(raw)) : empty();
      memory = state;
      return state;
    } catch {
      usingStorage = false;
      return normalize(memory);
    }
  }
  function update(mutator) {
    const state = read();
    mutator(state);
    state.revision++;
    memory = state;
    try {
      if (usingStorage) storage.setItem(key, JSON.stringify(state));
    } catch {
      usingStorage = false;
    }
    return state;
  }
  function collect(entry) {
    const clean = cleanEntry(entry);
    if (!clean) return read();
    return update((state) => {
      const previous = state.clues.find((x) => x.id === clean.id);
      if (previous) {
        const { starred, note } = previous;
        Object.assign(previous, clean, { starred, note });
      } else if (state.clues.length < 100) state.clues.push(clean);
    });
  }
  function mark(flag) {
    return update((state) => {
      if (!state.flags.includes(flag)) state.flags.push(flag);
    });
  }
  function annotate(id, note) {
    return update((state) => {
      const entry = state.clues.find((x) => x.id === id);
      if (entry) entry.note = text(note, 2000);
    });
  }
  function star(id) {
    return update((state) => {
      const entry = state.clues.find((x) => x.id === id);
      if (entry) entry.starred = !entry.starred;
    });
  }
  function addNote(title, body) {
    return update((state) => {
      if (state.notes.length < 50)
        state.notes.push({
          id:
            "note-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 6),
          title: text(title, 80) || "个人推测",
          body: text(body, 3000),
        });
    });
  }
  function finish(ending, name = "") {
    return update((state) => {
      if (state.ending) return;
      if (
        ending === "claimed" &&
        name.trim() &&
        state.flags.includes("staff")
      ) {
        state.ending = "claimed";
        state.name = text(name.trim(), 30);
      }
      if (ending === "left" && state.flags.includes("staff"))
        state.ending = "left";
    });
  }
  function reset() {
    memory = empty();
    try {
      if (usingStorage) storage.setItem(key, JSON.stringify(memory));
    } catch {
      usingStorage = false;
    }
    return read();
  }
  return Object.freeze({
    key,
    read,
    update,
    collect,
    mark,
    annotate,
    star,
    addNote,
    finish,
    reset,
    normalize,
  });
});
