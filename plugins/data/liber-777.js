/* liber-777.js — Liber 777 correspondence tables on a clickable Tree of Life.
 *
 * left:  the Tree of Life (10 sephirot + Da'ath + the 22 letter paths). Click a
 *        sephirah or a path to read its correspondence list.
 * right: every Liber 777 row for the selected key, plus a full-table view.
 *
 * Data lives in data/liber-777.json (open_777 data set, MIT; transcription of
 * Liber 777, 1909, Aleister Crowley, public domain).
 */
(function () {
  "use strict";

  const DATA_PATHS = ["data/liber-777.json", "liber-777.json"];
  const NS = "http://www.w3.org/2000/svg";
  const R = 13;
  const VIEW = { width: 240, height: 470 };

  // Standard Hermetic Golden Dawn positions (same layout the app's Kabbalah
  // tree uses) on a 240x470 viewBox.
  const NODE_POS = {
    1: [120, 30],
    2: [200, 88],
    3: [40, 88],
    4: [200, 213],
    5: [40, 213],
    6: [120, 273],
    7: [200, 343],
    8: [40, 343],
    9: [120, 398],
    10: [120, 448]
  };
  const DAAT_POS = [120, 148];

  // Golden Dawn path numbering: 11-32 are the 22 letter paths between the
  // sephirot. 31 is Tav, the path from Yesod down into Malkuth in the GD
  // arrangement used by the app's own Kabbalah tree.
  const PATHS = [
    { n: 11, from: 1, to: 2 },
    { n: 12, from: 1, to: 3 },
    { n: 13, from: 1, to: 6 },
    { n: 14, from: 2, to: 3 },
    { n: 15, from: 2, to: 6 },
    { n: 16, from: 2, to: 4 },
    { n: 17, from: 3, to: 6 },
    { n: 18, from: 3, to: 5 },
    { n: 19, from: 4, to: 5 },
    { n: 20, from: 4, to: 6 },
    { n: 21, from: 4, to: 7 },
    { n: 22, from: 5, to: 6 },
    { n: 23, from: 5, to: 8 },
    { n: 24, from: 6, to: 7 },
    { n: 25, from: 6, to: 9 },
    { n: 26, from: 6, to: 8 },
    { n: 27, from: 7, to: 8 },
    { n: 28, from: 7, to: 9 },
    { n: 29, from: 7, to: 10 },
    { n: 30, from: 8, to: 9 },
    { n: 31, from: 9, to: 10 },
    { n: 32, from: 8, to: 10 }
  ];

  const SEPHIROT = [
    { key: "1", name: "Kether", numeral: "1", planet: "Primum Mobile" },
    { key: "2", name: "Chokmah", numeral: "2", planet: "Neptune" },
    { key: "3", name: "Binah", numeral: "3", planet: "Saturn" },
    { key: "4", name: "Chesed", numeral: "4", planet: "Jupiter" },
    { key: "5", name: "Geburah", numeral: "5", planet: "Mars" },
    { key: "6", name: "Tiphareth", numeral: "6", planet: "Sol" },
    { key: "7", name: "Netzach", numeral: "7", planet: "Venus" },
    { key: "8", name: "Hod", numeral: "8", planet: "Mercury" },
    { key: "9", name: "Yesod", numeral: "9", planet: "Luna" },
    { key: "10", name: "Malkuth", numeral: "10", planet: "Earth" }
  ];

  // The letters and the signs/planets the sheet gives for paths 11-32. Only
  // used for tree labels and the key list; the tables themselves come from
  // the data file.
  const PATH_META = {
    11: { letter: "א", latin: "Aleph", glyph: "🜁" },
    12: { letter: "ב", latin: "Beth", glyph: "☿" },
    13: { letter: "ג", latin: "Gimel", glyph: "☾" },
    14: { letter: "ד", latin: "Daleth", glyph: "♀" },
    15: { letter: "ה", latin: "Heh", glyph: "♈" },
    16: { letter: "ו", latin: "Vav", glyph: "♉" },
    17: { letter: "ז", latin: "Zayin", glyph: "♊" },
    18: { letter: "ח", latin: "Cheth", glyph: "♋" },
    19: { letter: "ט", latin: "Teth", glyph: "♌" },
    20: { letter: "י", latin: "Yod", glyph: "♍" },
    21: { letter: "כ", latin: "Kaph", glyph: "♃" },
    22: { letter: "ל", latin: "Lamed", glyph: "♎" },
    23: { letter: "מ", latin: "Mem", glyph: "🜄" },
    24: { letter: "נ", latin: "Nun", glyph: "♏" },
    25: { letter: "ס", latin: "Samekh", glyph: "♐" },
    26: { letter: "ע", latin: "Ayin", glyph: "♑" },
    27: { letter: "פ", latin: "Pe", glyph: "♂" },
    28: { letter: "צ", latin: "Tzaddi", glyph: "♒" },
    29: { letter: "ק", latin: "Qoph", glyph: "♓" },
    30: { letter: "ר", latin: "Resh", glyph: "☉" },
    31: { letter: "ש", latin: "Shin", glyph: "🜂" },
    32: { letter: "ת", latin: "Tav", glyph: "♄" }
  };

  const VEILS = [
    { key: "000", name: "Ain", hebrew: "אין", note: "Nothing" },
    { key: "00", name: "Ain Soph", hebrew: "אין סוף", note: "No Limit" },
    { key: "0", name: "Ain Soph Aur", hebrew: "אין סוף אור", note: "Limitless Light" }
  ];

  // The sheet lists the three veils on three lines of the same cell; the build
  // step splits them into keys "000" / "00" / "0". The fallback keeps old data
  // files usable, but the normal path already has the keys.
  const VEIL_LINES = { "000": 0, "00": 1, "0": 2 };

  function splitVeils(data) {
    const values = data?.keys?.["0"];
    if (!values || data.keys["000"]) return data;
    const lines = (title) => String(values[title] || "").split("\n");
    if (lines("II. Transliteration of the Hebrew Names of the Paths").length < 3) return data;
    Object.keys(VEIL_LINES).forEach((key) => {
      const index = VEIL_LINES[key];
      const subset = {};
      Object.entries(values).forEach(([title, value]) => {
        const parts = String(value).split("\n");
        subset[title] = parts.length === 3 ? parts[index] : value;
      });
      data.keys[key] = subset;
    });
    return data;
  }

  // Headings that repeat a parent column's content just in Latin letters; they
  // are shown next to the parent value instead of as their own row.
  const COMPANION = {
    "II. Hebrew Names of the Paths": [
      "II. Transliteration of the Hebrew Names of the Paths",
      "III. Translation of the Names of the Paths"
    ],
    "VI. Heavens of Assiah": [
      "VI. Transliteration of the Heavens of Assiah",
      "VII. Translation of Heavens of Assiah",
      "VII. Meanings of the Symbols"
    ],
    "VII. Orders of the Qliphoth": [
      "VII. Transliteration of the Orders of the Qliphoth",
      "CXXIII. Translation of the Orders of the Qliphoth"
    ],
    "CXXXVII. Signs of the Zodiac": ["CXXXVII. Signs of the Zodiac .1"]
  };

  const COMPANION_OF = new Map();
  Object.entries(COMPANION).forEach(([primary, list]) => {
    list.forEach((title) => COMPANION_OF.set(title, primary));
  });

  const $ = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  };

  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([name, value]) => node.setAttribute(name, String(value)));
    return node;
  };

  function keySort(a, b) {
    const order = (key) => {
      if (key === "000") return -2;
      if (key === "00") return -1;
      return Number(key);
    };
    return order(a) - order(b);
  }

  function stripNumeral(title) {
    return String(title || "").replace(/^[IVXLC]+(?:\.[IVXLC]+)?\.\s*/, "");
  }

  function numeralOf(column) {
    if (column.numeral) return column.numeral;
    const match = String(column.key || "").match(/^([IVXLC]+(?:\.[IVXLC]+)?)\./);
    return match ? match[1] : "";
  }

  function keyLabel(data, key) {
    if (key === "daath") return "Da'ath";
    const meta = data?.meta?.["keyLabels"] || {};
    if (meta[key]) return meta[key];
    if (key === "000") return "Ain";
    if (key === "00") return "Ain Soph";
    if (key === "0") return "Ain Soph Aur";
    const seph = SEPHIROT.find((entry) => entry.key === key);
    if (seph) return seph.name;
    const num = Number(key);
    if (PATH_META[num]) return `Path ${key} · ${PATH_META[num].latin}`;
    if (key === "33") return "Tav (Kether / Earth)";
    if (key === "34") return "Shin (Spirit)";
    return `Key ${key}`;
  }

  function keySubLabel(data, key) {
    if (key === "daath") return "דעת · Knowledge";
    if (key === "000" || key === "00" || key === "0") {
      const veil = VEILS.find((entry) => entry.key === key);
      return veil ? veil.note : "";
    }
    const seph = SEPHIROT.find((entry) => entry.key === key);
    if (seph) return `Sephirah ${seph.numeral}${seph.planet ? ` · ${seph.planet}` : ""}`;
    const num = Number(key);
    if (PATH_META[num]) return `${PATH_META[num].letter} ${PATH_META[num].latin} ${PATH_META[num].glyph || ""}`.trim();
    if (key === "33") return "ת ♄ 🜃";
    if (key === "34") return "ש 🜂";
    return "";
  }

  function normalizeKey(raw) {
    const value = String(raw == null ? "" : raw).trim();
    if (!value) return "";
    if (value === "000" || value === "00") return value;
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0 && num <= 34) return String(Math.trunc(num));
    return "";
  }

  // The API user may open the JSON through the asset endpoint (auth key) or
  // straight from the plugin folder; both shapes are accepted.
  async function loadData(helpers) {
    const read = (payload) => {
      if (!payload || typeof payload !== "object") return null;
      if (!payload.keys || typeof payload.keys !== "object") return null;
      return payload;
    };
    try {
      const payload = await helpers.requestJson(
        "GET",
        `/api/v1/plugins/${encodeURIComponent(helpers.pluginName)}/files/data/liber-777.json`
      );
      const ok = read(payload?.json && typeof payload.json === "object" ? payload.json : payload?.data || payload);
      if (ok) return ok;
    } catch (_error) {}
    for (const path of DATA_PATHS) {
      try {
        const response = await fetch(new URL(path, document.baseURI).toString(), { cache: "force-cache" });
        if (!response.ok) continue;
        const ok = read(await response.json());
        if (ok) return ok;
      } catch (_error) {}
    }
    return null;
  }

  async function loadConfig(helpers) {
    try {
      const payload = await helpers.requestJson(
        "GET",
        `/api/v1/plugins/${encodeURIComponent(helpers.pluginName)}/config`
      );
      return payload?.config && typeof payload.config === "object" ? payload.config : {};
    } catch (_error) {
      return {};
    }
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  function renderTree(state, onSelect) {
    const svg = svgEl("svg", {
      viewBox: `0 0 ${VIEW.width} ${VIEW.height}`,
      class: "l777-tree",
      role: "group",
      "aria-label": "Tree of Life"
    });

    const linkLayer = svgEl("g", { class: "l777-tree-links" });
    const nodeLayer = svgEl("g", { class: "l777-tree-nodes" });
    svg.appendChild(linkLayer);
    svg.appendChild(nodeLayer);

    PATHS.forEach((path) => {
      const [x1, y1] = NODE_POS[path.from] || [];
      const [x2, y2] = NODE_POS[path.to] || [];
      if (x1 == null || x2 == null) return;
      const meta = PATH_META[path.n] || {};
      const active = state.key === String(path.n);

      const line = svgEl("line", {
        x1, y1, x2, y2,
        class: `l777-path${active ? " is-active" : ""}`,
        "data-path": path.n
      });
      linkLayer.appendChild(line);

      const hit = svgEl("line", {
        x1, y1, x2, y2,
        class: "l777-path-hit",
        "data-path": path.n,
        tabindex: "0",
        role: "button",
        "aria-label": `Path ${path.n}: ${meta.latin || ""}`
      });
      const choose = (event) => {
        event.preventDefault();
        onSelect(String(path.n));
      };
      hit.addEventListener("click", choose);
      hit.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") choose(event);
      });
      linkLayer.appendChild(hit);

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const badge = svgEl("g", {
        class: `l777-path-badge${active ? " is-active" : ""}`,
        transform: `translate(${mx.toFixed(1)} ${my.toFixed(1)})`,
        "data-path": path.n,
        "aria-hidden": "true"
      });
      badge.appendChild(svgEl("rect", {
        x: -11, y: -9, width: 22, height: 18, rx: 4, class: "l777-badge-box"
      }));
      const letter = svgEl("text", {
        x: 0, y: 4, class: "l777-badge-text", "text-anchor": "middle"
      });
      letter.textContent = meta.letter || String(path.n);
      badge.appendChild(letter);
      linkLayer.appendChild(badge);
      badge.addEventListener("click", () => onSelect(String(path.n)));
    });

    // Sephirot: circle with its number, name printed underneath.
    SEPHIROT.forEach((seph) => {
      const [x, y] = NODE_POS[Number(seph.key)] || [];
      if (x == null) return;
      const active = state.key === seph.key;
      nodeLayer.appendChild(svgEl("circle", {
        cx: x, cy: y, r: R,
        class: `l777-node${active ? " is-active" : ""}`,
        "data-key": seph.key, tabindex: "0", role: "button",
        "aria-label": `${seph.name}, sephirah ${seph.numeral}`
      }));
      const label = svgEl("text", {
        x, y, class: "l777-node-text", "text-anchor": "middle", "dominant-baseline": "central"
      });
      label.textContent = seph.numeral;
      nodeLayer.appendChild(label);
      const name = svgEl("text", {
        x, y: y + R + 10, class: "l777-node-name", "text-anchor": "middle"
      });
      name.textContent = seph.name;
      nodeLayer.appendChild(name);
    });

    // Da'ath.
    const [dx, dy] = DAAT_POS;
    nodeLayer.appendChild(svgEl("circle", {
      cx: dx, cy: dy, r: R - 2, class: `l777-node l777-node-daath${state.key === "daath" ? " is-active" : ""}`,
      tabindex: "0", role: "button", "aria-label": "Da'ath (no table of its own)"
    }));
    const daatText = svgEl("text", {
      x: dx, y: dy, class: "l777-node-text", "text-anchor": "middle", "dominant-baseline": "central"
    });
    daatText.textContent = "·";
    nodeLayer.appendChild(daatText);
    const daatName = svgEl("text", {
      x: dx, y: dy + R + 8, class: "l777-node-name", "text-anchor": "middle"
    });
    daatName.textContent = "Da'ath";
    nodeLayer.appendChild(daatName);

    svg.querySelectorAll(".l777-node[data-key]").forEach((node) => {
      const choose = (event) => {
        event.preventDefault();
        onSelect(String(node.getAttribute("data-key")));
      };
      node.addEventListener("click", choose);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") choose(event);
      });
    });
    svg.querySelector(".l777-node-daath")?.addEventListener("click", () => onSelect("daath"));

    return svg;
  }

  function keyList(state, data, onSelect) {
    const list = $("div", "l777-keylist");
    const group = (label, keys) => {
      if (!keys.length) return;
      list.appendChild($("p", "l777-keylist-heading", label));
      keys.forEach((key) => {
        const button = $("button", `l777-keylist-item${state.key === key ? " is-active" : ""}`);
        button.type = "button";
        button.dataset.key = key;
        button.appendChild($("span", "l777-keylist-name", keyLabel(data, key)));
        const sub = keySubLabel(data, key);
        if (sub) button.appendChild($("span", "l777-keylist-sub", sub));
        button.addEventListener("click", () => onSelect(key));
        list.appendChild(button);
      });
    };
    group("Veils of Negative Existence", VEILS.map((veil) => veil.key));
    group("Sephirot", SEPHIROT.map((seph) => seph.key));
    group("Paths", PATHS.map((path) => String(path.n)));
    group("Columns XXXIII–XXXIV", ["33", "34"].filter((key) => data?.keys?.[key]));
    return list;
  }

  function renderHeader(state, data) {
    const header = $("header", "l777-header");
    const meta = $("div", "l777-header-meta");
    const kicker = $("p", "l777-kicker");
    kicker.textContent = state.key === "daath" ? "Hidden Sephirah" : `777 for key ${state.key}`;
    meta.appendChild(kicker);
    meta.appendChild($("h2", "l777-title", state.key === "daath" ? "Da'ath" : keyLabel(data, state.key)));
    const sub = state.key === "daath"
      ? "דעת · Knowledge — the hidden sephirah has no column of its own"
      : keySubLabel(data, state.key);
    if (sub) meta.appendChild($("p", "l777-sub", sub));
    header.appendChild(meta);

    const nav = $("div", "l777-nav");
    const ordered = [...VEILS.map((veil) => veil.key), ...SEPHIROT.map((seph) => seph.key), ...PATHS.map((path) => String(path.n))];
    const index = ordered.indexOf(state.key);
    const step = (delta) => {
      if (index < 0) return;
      const next = ordered[(index + delta + ordered.length) % ordered.length];
      state.select(next);
    };
    const prev = $("button", "l777-nav-btn", "◂");
    prev.type = "button";
    prev.title = "Previous key";
    prev.addEventListener("click", () => step(-1));
    const next = $("button", "l777-nav-btn", "▸");
    next.type = "button";
    next.title = "Next key";
    next.addEventListener("click", () => step(1));
    nav.appendChild(prev);
    nav.appendChild(next);
    header.appendChild(nav);
    return header;
  }

  function renderTable(state, data) {
    const values = data?.keys?.[state.key];
    const wrap = $("div", "l777-tables");
    if (!values || !Object.keys(values).length) {
      wrap.appendChild($("p", "l777-empty", state.key === "daath"
        ? "Da'ath is the invisible sephirah; 777 assigns it no column. Kether (1) and the supernal triad carry the nearest correspondences."
        : "No correspondences recorded for this key."));
      return wrap;
    }

    const rows = [];
    Object.keys(values).forEach((title) => {
      if (COMPANION_OF.has(title)) return;
      const primaryKey = COMPANION_OF.get(title);
      if (primaryKey && !values[primaryKey]) return;
      const companions = (COMPANION[title] || [])
        .filter((companion) => values[companion])
        .map((companion) => ({ title: companion, value: values[companion] }));
      rows.push({ title, value: values[title], companions });
    });

    const columnsByKey = new Map((data.columns || []).map((column) => [column.key, column]));
    const filter = String(state.query || "").trim().toLowerCase();
    const visible = filter
      ? rows.filter((row) => [row.title, row.value, ...row.companions.map((entry) => `${entry.title} ${entry.value}`)]
        .join(" ")
        .toLowerCase()
        .indexOf(filter) >= 0)
      : rows;

    if (!visible.length) {
      wrap.appendChild($("p", "l777-empty", `No row in ${keyLabel(data, state.key)} matches “${state.query}”.`));
      return wrap;
    }
    if (filter) {
      wrap.appendChild($("p", "l777-count", `${visible.length} of ${rows.length} rows match`));
    }

    visible.forEach((entry) => {
      const column = columnsByKey.get(entry.title) || {};
      const row = $("div", "l777-row");
      const head = $("div", "l777-row-head");
      const numeral = numeralOf(column) || numeralOf({ key: entry.title });
      if (numeral) head.appendChild($("span", "l777-numeral", numeral));
      head.appendChild($("span", "l777-row-title", stripNumeral(entry.title)));

      const body = $("div", "l777-row-body");
      const value = $("div", "l777-value");
      String(entry.value || "").split("\n").forEach((line) => {
        if (line.trim()) value.appendChild($("p", "l777-value-line", line));
      });
      entry.companions.forEach((companion) => {
        const line = $("p", "l777-value-sub");
        line.appendChild($("span", "l777-value-sub-label", stripNumeral(companion.title)));
        line.appendChild($("span", "l777-value-sub-text", companion.value));
        value.appendChild(line);
      });
      body.appendChild(value);
      row.appendChild(head);
      row.appendChild(body);
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderAllTable(state, data) {
    const wrap = $("div", "l777-matrix-wrap");
    const keys = Object.keys(data.keys || {}).sort(keySort);
    const table = $("table", "l777-matrix");
    const head = $("thead");
    const headRow = $("tr");
    headRow.appendChild($("th", "l777-matrix-corner", "Column"));
    keys.forEach((key) => {
      const th = $("th", "", keyLabel(data, key));
      th.dataset.key = key;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = $("tbody");
    (data.columns || []).forEach((column) => {
      const tr = $("tr");
      const th = $("th", "", column.key);
      tr.appendChild(th);
      keys.forEach((key) => {
        const td = $("td", "", data.keys[key]?.[column.key] || "");
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    const query = String(state.query || "").trim().toLowerCase();
    if (query) {
      const mark = (node) => {
        const text = node.textContent || "";
        const at = text.toLowerCase().indexOf(query);
        if (at < 0) return;
        const before = text.slice(0, at);
        const hit = text.slice(at, at + query.length);
        const after = text.slice(at + query.length);
        node.textContent = "";
        node.appendChild(document.createTextNode(before));
        node.appendChild($("mark", "l777-mark", hit));
        node.appendChild(document.createTextNode(after));
      };
      table.querySelectorAll(".l777-value-line").forEach(mark);
    }
    wrap.appendChild(table);
    return wrap;
  }

  function searchResults(state, data) {
    const query = String(state.query || "").trim().toLowerCase();
    if (!query) return null;
    const results = $("div", "l777-results");
    const hits = [];
    Object.keys(data.keys || {}).sort(keySort).forEach((key) => {
      const values = data.keys[key] || {};
      const matches = Object.keys(values).filter((title) => {
        const text = `${title} ${values[title]}`.toLowerCase();
        return text.indexOf(query) >= 0;
      });
      if (matches.length) hits.push({ key, matches });
    });
    if (!hits.length) return null;
    results.appendChild($("p", "l777-results-title", `${hits.length} keys contain “${state.query}”`));
    hits.forEach((hit) => {
      const button = $("button", "l777-result");
      button.type = "button";
      button.appendChild($("span", "l777-result-name", keyLabel(data, hit.key)));
      button.appendChild($("span", "l777-result-count", `${hit.matches.length} rows`));
      const preview = hit.matches.slice(0, 3).map((title) => {
        const short = stripNumeral(title);
        return `${short}: ${String(data.keys[hit.key][title]).split("\n")[0]}`;
      }).join(" · ");
      button.appendChild($("span", "l777-result-preview", preview));
      button.addEventListener("click", () => state.select(hit.key));
      results.appendChild(button);
    });
    return results;
  }

  function render(root, state, data) {
    root.innerHTML = "";
    const shell = $("div", "l777-shell");

    const side = $("aside", "l777-side");
    side.appendChild($("h1", "l777-brand", "777"));
    side.appendChild($("p", "l777-brand-sub", "Liber 777 · correspondences"));
    side.appendChild(renderTree(state, (key) => state.select(key)));
    side.appendChild(keyList(state, data, (key) => state.select(key)));

    const main = $("section", "l777-main");
    main.appendChild(renderHeader(state, data));

    const tools = $("div", "l777-tools");
    const search = $("input", "l777-search");
    search.type = "search";
    search.placeholder = "Search every table…";
    search.value = state.query || "";
    search.setAttribute("aria-label", "Search all 777 tables");
    search.addEventListener("input", () => {
      state.query = search.value;
      state.paint({ keepFocus: true });
    });
    tools.appendChild(search);
    const allToggle = $("button", `l777-toggle${state.showAll ? " is-active" : ""}`, "Full table");
    allToggle.type = "button";
    allToggle.addEventListener("click", () => {
      state.showAll = !state.showAll;
      state.paint();
    });
    tools.appendChild(allToggle);
    main.appendChild(tools);

    const found = searchResults(state, data);
    if (found) main.appendChild(found);

    if (state.showAll) {
      main.appendChild(renderAllTable(state, data));
    } else {
      main.appendChild(renderTable(state, data));
    }

    shell.appendChild(side);
    shell.appendChild(main);
    root.appendChild(shell);
  }

  function mount(root, helpers) {
    let data = null;
    let config = {};
    let disposed = false;
    let lastKey = "";

    const state = {
      key: "",
      query: "",
      showAll: false,
      select(key) {
        const next = String(key || "").trim() === "daath" ? "daath" : normalizeKey(key);
        if (!next) return;
        if (next === this.key) return;
        this.key = next;
        this.query = "";
        try { window.localStorage.setItem("kabbak-liber-777-key", next); } catch (_error) {}
        this.paint();
        document.dispatchEvent(new CustomEvent("liber-777:key", {
          detail: { key: next, pluginName: helpers.pluginName }
        }));
      },
      paint(options = {}) {
        if (disposed || !data) return;
        render(root, state, data);
        const input = options.keepFocus ? root.querySelector(".l777-search") : null;
        if (input) {
          input.focus();
          const end = input.value.length;
          try { input.setSelectionRange(end, end); } catch (_error) {}
        }
      }
    };

    async function boot() {
      const loaded = await loadData(helpers);
      if (disposed) return;
      if (!loaded) {
        root.innerHTML = "";
        const shell = $("div", "l777-shell l777-shell-error");
        shell.appendChild($("h1", "l777-brand", "777"));
        shell.appendChild($("p", "l777-empty",
          "Could not load the Liber 777 data file (data/liber-777.json). Re-install the plugin from the DLC Shop."));
        root.appendChild(shell);
        return;
      }
      data = splitVeils(loaded);
      const keys = Object.keys(data.keys || {}).sort(keySort);
      const fromHash = normalizeKey(new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key"));
      const preferred = normalizeKey(config?.defaultKey) || normalizeKey(lastKey);
      state.key = fromHash || preferred || keys[0] || "0";
      state.showAll = false;
      (document.documentElement.dataset.liber777 = "ready");
      state.paint();
    }

    async function start() {
      lastKey = String(window.localStorage.getItem("kabbak-liber-777-key") || "");
      // Config only picks the default key; a failure must not block the page.
      config = await loadConfig(helpers);
      await boot();
    }

    const onRoute = (event) => {
      const detail = event?.detail || {};
      const rawKey = detail.key ?? detail.path;
      const next = normalizeKey(rawKey);
      if (next && next !== state.key) {
        state.query = "";
        state.showAll = false;
        state.select(next);
      }
    };
    document.addEventListener("navigate:liber-777", onRoute);
    document.addEventListener("nav:liber-777", onRoute);

    void start();
    return () => {
      disposed = true;
      document.removeEventListener("navigate:liber-777", onRoute);
      document.removeEventListener("nav:liber-777", onRoute);
      try { window.localStorage.setItem("kabbak-liber-777-key", state.key || ""); } catch (_error) {}
      root.innerHTML = "";
    };
  }

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[liber-777] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "liber-777",
    name: "Liber 777",
    version: "1.0.0",
    section: { id: "liber-777", label: "777" },
    mount
  });
})();
