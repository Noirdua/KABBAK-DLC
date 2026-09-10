/* mindmap-layout.js — UI overhaul: menu and correspondence items as a mindmap. */
(function () {
  "use strict";

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[mindmap-layout] TaroTimePluginHost is not available.");
    return;
  }

  const PAGE_NAV_IDS = new Set([
    "open-home",
    "open-home-menu",
    "open-admin",
    "open-settings",
    "open-profile",
    "open-quiz",
    "open-scriber",
    "open-tarot-spread",
    "open-tarot-frame",
    "open-tarot-house",
    "open-natal",
    "open-sky",
    "open-alphabet-word",
    "open-alphabet-text",
    "open-alphabet-reference",
    "open-audio",
    "open-audio-circle",
    "open-audio-notes",
    "open-numbers-theory",
    "open-numbers-num-pad",
    "open-calendar-timeline",
    "open-kabbalah-cross",
    "open-kabbalah-tree",
    "open-iching-bigrams",
    "open-iching-phases",
    "open-cycles"
  ]);

  const CATALOG_BY_NAV = {
    "open-tarot": "tarot",
    "open-tarot-cards": "tarot",
    "open-planets": "planets",
    "open-zodiac": "zodiac",
    "open-elements": "elements",
    "open-tattvas": "tattvas",
    "open-gods": "gods",
    "open-enochian": "enochian",
    "open-alphabet": "letters",
    "open-alphabet-letters": "letters",
    "open-kabbalah": "sephirot",
    "open-kabbalah-sephirot": "sephirot",
    "open-kabbalah-paths": "paths",
    "open-kabbalah-worlds": "worlds",
    "open-kabbalah-cube": "cube",
    "open-iching": "iching",
    "open-iching-hexagrams": "iching",
    "open-iching-trigrams": "trigrams",
    "open-numbers": "numbers",
    "open-numbers-browse": "numbers",
    "open-calendar": "months",
    "open-calendar-months": "months",
    "open-holidays": "holidays",
    "open-modalities": "modalities"
  };

  function isPageNav(navId) {
    const id = String(navId || "");
    if (!id) return false;
    if (PAGE_NAV_IDS.has(id)) return true;
    const el = document.getElementById(id);
    if (!el) return false;
    if (el.dataset.pluginSectionOpen) return true;
    return el.classList.contains("topbar-menu-plugin-api")
      || el.classList.contains("topbar-menu-admin")
      || el.classList.contains("topbar-menu-settings")
      || el.classList.contains("topbar-menu-profile")
      || el.classList.contains("topbar-menu-home");
  }

  function inferCatalog(navId) {
    const id = String(navId || "");
    if (isPageNav(id)) return "";
    if (CATALOG_BY_NAV[id]) return CATALOG_BY_NAV[id];
    if (/tarot/.test(id)) return "tarot";
    if (/planet|cycle/.test(id)) return "planets";
    if (/zodiac/.test(id)) return "zodiac";
    if (/element/.test(id)) return "elements";
    if (/tattva/.test(id)) return "tattvas";
    if (/god/.test(id)) return "gods";
    if (/enochian/.test(id)) return "enochian";
    if (/letter|alphabet/.test(id)) return "letters";
    if (/sephir/.test(id)) return "sephirot";
    if (/path/.test(id)) return "paths";
    if (/world/.test(id)) return "worlds";
    if (/cube/.test(id)) return "cube";
    if (/hexagram|iching$/.test(id)) return "iching";
    if (/trigram/.test(id)) return "trigrams";
    if (/number/.test(id)) return "numbers";
    if (/month|calendar/.test(id)) return "months";
    if (/holiday/.test(id)) return "holidays";
    if (/modalit/.test(id)) return "modalities";
    return "";
  }

  const TYPE_KICKERS = {
    hebrewLetter: "Letter",
    planet: "Planet",
    planetCorrespondence: "Planet",
    zodiac: "Zodiac",
    zodiacCorrespondence: "Zodiac",
    decan: "Decan",
    element: "Element",
    tarotCard: "Tarot",
    tarot: "Tarot",
    calendarMonth: "Month",
    cube: "Cube",
    iching: "I Ching",
    path: "Path",
    sephira: "Sefira",
    god: "God",
    number: "Number"
  };

  function slug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "node";
  }

  function nameOf(value) {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (typeof value.en === "string") return value.en;
    if (value.en && typeof value.en.en === "string") return value.en.en;
    if (typeof value.roman === "string") return value.roman;
    if (typeof value.name === "string") return value.name;
    if (value.name) return nameOf(value.name);
    return "";
  }

  function shorten(text, max) {
    const value = String(text || "").trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.values(value);
    return [];
  }

  function uniqueById(nodes) {
    const seen = new Set();
    return nodes.filter((node) => {
      if (!node?.id || seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });
  }

  host.register({
    id: "mindmap-layout",
    name: "Mindmap Layout",
    version: "1.0.0",
    role: "skin",
    mount(shellEl, helpers) {
      const ui = helpers.ui;
      if (!ui) {
        console.warn("[mindmap-layout] helpers.ui is not available.");
        return null;
      }

      ui.hideDefaultChrome();
      shellEl.innerHTML = `
        <div class="mindmap-app">
          <header class="mindmap-hud">
            <button class="mindmap-back" type="button">Back</button>
            <button class="mindmap-home" type="button">Home</button>
            <div class="mindmap-crumbs"></div>
            <button class="mindmap-page-toggle" type="button">Page</button>
            <div class="mindmap-hud-widgets"></div>
          </header>
          <div class="mindmap-stage">
            <div class="mindmap-world">
              <svg class="mindmap-svg"></svg>
              <div class="mindmap-nodes"></div>
            </div>
            <div class="mindmap-hint">Click a node to expand its map · drag to pan · wheel to zoom · Page for the original screen</div>
          </div>
          <div class="mindmap-pages"></div>
        </div>
      `;

      const appEl = shellEl.querySelector(".mindmap-app");
      const stageEl = shellEl.querySelector(".mindmap-stage");
      const worldEl = shellEl.querySelector(".mindmap-world");
      const svgEl = shellEl.querySelector(".mindmap-svg");
      const nodesEl = shellEl.querySelector(".mindmap-nodes");
      const crumbsEl = shellEl.querySelector(".mindmap-crumbs");
      const pagesEl = shellEl.querySelector(".mindmap-pages");
      const widgetsEl = shellEl.querySelector(".mindmap-hud-widgets");
      const backEl = shellEl.querySelector(".mindmap-back");
      const homeEl = shellEl.querySelector(".mindmap-home");
      const pageToggleEl = shellEl.querySelector(".mindmap-page-toggle");

      ui.attachPages(pagesEl);
      ui.attachWidgets(widgetsEl);

      const cache = { tarot: null, iching: null };
      const view = { x: 0, y: 0, scale: 0.85 };
      const pan = { active: false, moved: false, x: 0, y: 0, vx: 0, vy: 0 };
      let stack = [{ type: "menu", label: "KABBAK" }];
      let graph = { nodes: [], edges: [] };
      let pageOpen = false;
      let renderToken = 0;

      function setPageOpen(next) {
        pageOpen = Boolean(next);
        appEl.classList.toggle("is-page-open", pageOpen);
        pageToggleEl.classList.toggle("is-on", pageOpen);
        pageToggleEl.textContent = pageOpen ? "Hide page" : "Page";
      }

      function applyView() {
        worldEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      }

      function current() {
        return stack[stack.length - 1] || { type: "menu", label: "KABBAK" };
      }

      function pushFrame(frame) {
        stack.push(frame);
        void showFrame();
      }

      async function ensureData() {
        const runtime = window.TarotAppRuntime;
        const magick = await runtime?.ensureMagickDatasetLoaded?.()
          || await runtime?.ensureMagickDataset?.()
          || null;
        const reference = await runtime?.ensureReferenceData?.() || runtime?.getReferenceData?.() || null;
        return { magick, reference };
      }

      async function loadTarot() {
        if (cache.tarot) return cache.tarot;
        const payload = await window.TarotDataService?.loadTarotCards?.() || [];
        cache.tarot = Array.isArray(payload) ? payload : asList(payload);
        return cache.tarot;
      }

      async function loadIching() {
        if (cache.iching) return cache.iching;
        try {
          const payload = await helpers.requestJson("GET", "/api/v1/iching");
          cache.iching = payload?.hexagrams || payload?.trigrams || payload || {};
        } catch (_error) {
          cache.iching = {};
        }
        return cache.iching;
      }

      function navItems() {
        return ui.listNav().filter((item) => !item.hidden);
      }

      function navNodeFromItem(item, parentId) {
        const children = (item.children || []).filter((child) => !child.hidden).map((child) => navNodeFromItem(child, item.id));
        return {
          id: item.id || slug(item.label),
          kind: "nav",
          label: item.label,
          kicker: parentId === "hub" ? "section" : "page",
          parentId,
          navId: item.id,
          catalog: inferCatalog(item.id),
          children
        };
      }

      function buildMenuGraph() {
        const nodes = [{ id: "hub", kind: "hub", label: "KABBAK", kicker: "menu" }];
        const edges = [];
        navItems().forEach((item) => {
          const node = navNodeFromItem(item, "hub");
          nodes.push(node);
          edges.push({ from: "hub", to: node.id });
        });
        return { nodes: uniqueById(nodes), edges };
      }

      function buildBranchGraph(frame) {
        const hub = { id: "hub", kind: "hub", label: frame.label, kicker: "menu" };
        const nodes = [hub];
        const edges = [];
        (frame.children || []).forEach((child) => {
          const node = {
            ...child,
            id: child.id || slug(child.label),
            parentId: "hub",
            kicker: child.kicker || "page"
          };
          nodes.push(node);
          edges.push({ from: "hub", to: node.id });
        });
        return { nodes: uniqueById(nodes), edges };
      }

      function nodeFromRecord(prefix, record, parentId, extra = {}) {
        const id = record.id || record.hebrewLetterId || slug(nameOf(record) || record.char);
        const label = extra.label || nameOf(record) || record.char || record.symbol || id;
        return {
          id: `${prefix}-${id}`,
          kind: extra.kind || "item",
          kicker: extra.kicker || prefix,
          label: shorten(label, 36),
          parentId,
          itemType: extra.itemType || prefix,
          itemId: extra.itemId || id,
          navEvent: extra.navEvent || "",
          navDetail: extra.navDetail || null,
          navId: extra.navId || "",
          record
        };
      }

      async function buildCatalogGraph(catalog) {
        const { magick, reference } = await ensureData();
        const hub = { id: "hub", kind: "hub", label: catalog.label || catalog.type, kicker: "map" };
        const nodes = [hub];
        const edges = [];

        function addChild(node) {
          nodes.push(node);
          edges.push({ from: node.parentId || "hub", to: node.id });
        }

        if (catalog.type === "tarot") {
          const cards = await loadTarot();
          const groups = [
            { id: "major", label: "Major Arcana", test: (card) => String(card.arcana || "") === "Major" },
            { id: "wands", label: "Wands", test: (card) => /wand/i.test(card.suit || "") },
            { id: "cups", label: "Cups", test: (card) => /cup/i.test(card.suit || "") },
            { id: "swords", label: "Swords", test: (card) => /sword/i.test(card.suit || "") },
            { id: "disks", label: "Disks", test: (card) => /disk|pentacle|coin/i.test(card.suit || "") }
          ];
          if (catalog.group) {
            const group = groups.find((entry) => entry.id === catalog.group);
            (cards || []).filter((card) => group?.test(card)).forEach((card) => {
              addChild(nodeFromRecord("tarot", card, "hub", {
                kicker: card.arcana || "card",
                navEvent: "nav:tarot-trump",
                navDetail: { cardName: card.name, trumpNumber: card.number }
              }));
            });
          } else {
            groups.forEach((group) => {
              const count = (cards || []).filter(group.test).length;
              if (!count) return;
              addChild({
                id: `tarot-group-${group.id}`,
                kind: "group",
                kicker: `${count}`,
                label: group.label,
                parentId: "hub",
                catalogType: "tarot",
                catalogGroup: group.id
              });
            });
          }
        } else if (catalog.type === "planets") {
          asList(reference?.planets).forEach((planet) => {
            addChild(nodeFromRecord("planet", planet, "hub", {
              kicker: planet.symbol || "planet",
              navEvent: "nav:planet",
              navDetail: { planetId: planet.id }
            }));
          });
        } else if (catalog.type === "zodiac") {
          asList(reference?.signs).forEach((sign) => {
            addChild(nodeFromRecord("zodiac", sign, "hub", {
              label: `${sign.symbol || ""} ${nameOf(sign) || sign.name}`.trim(),
              navEvent: "nav:zodiac",
              navDetail: { signId: sign.id }
            }));
          });
        } else if (catalog.type === "elements") {
          asList(magick?.grouped?.alchemy?.elements || magick?.grouped?.elements).forEach((element) => {
            addChild(nodeFromRecord("element", element, "hub", {
              navEvent: "nav:elements",
              navDetail: { elementId: element.id }
            }));
          });
        } else if (catalog.type === "tattvas") {
          asList(magick?.grouped?.alchemy?.tattvas).forEach((tattva) => {
            addChild(nodeFromRecord("tattva", tattva, "hub", {
              navEvent: "nav:tattvas",
              navDetail: { tattvaId: tattva.id }
            }));
          });
        } else if (catalog.type === "letters") {
          ["hebrew", "greek", "english"].forEach((alphabet) => {
            const letters = magick?.grouped?.alphabets?.[alphabet];
            if (!Array.isArray(letters) || !letters.length) return;
            addChild({
              id: `letters-${alphabet}`,
              kind: "group",
              kicker: `${letters.length}`,
              label: alphabet,
              parentId: "hub",
              catalogType: "letter-set",
              alphabet
            });
          });
        } else if (catalog.type === "letter-set") {
          const letters = magick?.grouped?.alphabets?.[catalog.alphabet] || [];
          letters.forEach((letter) => {
            addChild(nodeFromRecord("letter", letter, "hub", {
              label: `${letter.char || ""} ${letter.name || nameOf(letter)}`.trim(),
              itemId: letter.hebrewLetterId || slug(letter.name),
              navEvent: "nav:alphabet",
              navDetail: {
                alphabet: catalog.alphabet,
                hebrewLetterId: letter.hebrewLetterId,
                greekName: letter.name,
                englishLetter: letter.char
              }
            }));
          });
        } else if (catalog.type === "sephirot") {
          const tree = magick?.grouped?.kabbalah?.["kabbalah-tree"] || {};
          asList(tree.sephiroth).forEach((sephira) => {
            addChild(nodeFromRecord("sephira", sephira, "hub", {
              label: nameOf(sephira) || sephira.id,
              navEvent: "nav:kabbalah-path",
              navDetail: { pathNo: sephira.number || sephira.index || sephira.no }
            }));
          });
        } else if (catalog.type === "paths") {
          const tree = magick?.grouped?.kabbalah?.["kabbalah-tree"] || {};
          asList(tree.paths).forEach((path) => {
            addChild(nodeFromRecord("path", path, "hub", {
              label: `Path ${path.pathNumber || path.number} · ${nameOf(path) || path.letter || ""}`.trim(),
              navEvent: "nav:kabbalah-path",
              navDetail: { pathNo: path.pathNumber || path.number }
            }));
          });
        } else if (catalog.type === "gods") {
          const gods = magick?.grouped?.gods || {};
          const byPath = gods.byPath || gods;
          Object.keys(byPath).forEach((key) => {
            const entry = byPath[key];
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
            if (!entry.name && !entry.label && !entry.greek && !entry.type) return;
            addChild(nodeFromRecord("god", entry, "hub", {
              itemId: key,
              label: `${entry.name || entry.label || `Path ${key}`} · ${entry.greek || ""}`.trim(),
              navEvent: "nav:gods",
              navDetail: { pathNo: Number(key), godName: entry.greek || entry.name }
            }));
          });
        } else if (catalog.type === "iching") {
          const iching = await loadIching();
          const hexagrams = asList(iching.hexagrams || iching);
          const groups = new Map();
          hexagrams.forEach((hex) => {
            const upper = String(hex.upperTrigram || hex.above || Math.ceil((Number(hex.number) || 1) / 8));
            if (!groups.has(upper)) groups.set(upper, []);
            groups.get(upper).push(hex);
          });
          if (catalog.group) {
            (groups.get(catalog.group) || []).forEach((hex) => {
              addChild(nodeFromRecord("iching", hex, "hub", {
                label: `${hex.number}. ${nameOf(hex) || hex.name || ""}`.trim(),
                itemId: String(hex.number || hex.id),
                navEvent: "nav:iching",
                navDetail: { hexagramNumber: hex.number }
              }));
            });
          } else {
            [...groups.entries()].forEach(([key, list]) => {
              addChild({
                id: `iching-group-${slug(key)}`,
                kind: "group",
                kicker: `${list.length}`,
                label: `Trigram ${key}`,
                parentId: "hub",
                catalogType: "iching",
                catalogGroup: key
              });
            });
          }
        } else if (catalog.type === "trigrams") {
          const iching = await loadIching();
          asList(iching.trigrams).forEach((trigram) => {
            addChild(nodeFromRecord("trigram", trigram, "hub", {
              navEvent: "nav:iching",
              navDetail: { planetaryInfluence: trigram.planet || trigram.name }
            }));
          });
        } else if (catalog.type === "numbers") {
          asList(magick?.grouped?.numbers?.entries).slice(0, 32).forEach((entry) => {
            addChild(nodeFromRecord("number", entry, "hub", {
              label: String(entry.value ?? entry.number ?? nameOf(entry)),
              navEvent: "nav:number",
              navDetail: { value: entry.value ?? entry.number }
            }));
          });
        } else if (catalog.type === "months") {
          asList(reference?.calendarMonths || reference?.months).forEach((month) => {
            addChild(nodeFromRecord("month", month, "hub", {
              navEvent: "nav:calendar-month",
              navDetail: { monthId: month.id }
            }));
          });
        } else if (catalog.type === "enochian") {
          asList(magick?.grouped?.enochian?.letters || magick?.grouped?.enochian).forEach((letter) => {
            addChild(nodeFromRecord("enochian", letter, "hub", {
              navEvent: "nav:alphabet",
              navDetail: { alphabet: "enochian", enochianId: letter.id }
            }));
          });
        } else if (catalog.type === "worlds") {
          asList(magick?.grouped?.kabbalah?.fourWorlds).forEach((world) => {
            addChild(nodeFromRecord("world", world, "hub", {
              itemType: "sephira",
              navEvent: "nav:kabbalah-path",
              navDetail: { pathNo: world.number || world.index }
            }));
          });
        } else if (catalog.type === "cube") {
          const cube = magick?.grouped?.kabbalah?.cube || {};
          asList(cube.faces || cube.walls || cube.directions || cube).forEach((face) => {
            addChild(nodeFromRecord("cube", face, "hub", {
              itemType: "path",
              navEvent: "nav:cube",
              navDetail: { wallId: face.id }
            }));
          });
        } else if (catalog.type === "modalities") {
          ["cardinal", "fixed", "mutable"].forEach((modality) => {
            addChild({
              id: `modality-${modality}`,
              kind: "item",
              kicker: "modality",
              label: modality,
              parentId: "hub",
              itemType: "zodiac",
              itemId: modality,
              navEvent: "nav:modalities",
              navDetail: { modalityId: modality }
            });
          });
        } else if (catalog.type === "holidays") {
          asList(reference?.calendarHolidays || reference?.holidays || reference?.celestialHolidays).slice(0, 24).forEach((holiday) => {
            addChild(nodeFromRecord("holiday", holiday, "hub", {
              itemType: "month",
              navEvent: "nav:calendar-month",
              navDetail: { monthId: holiday.monthId || holiday.id }
            }));
          });
        }

        if (nodes.length === 1) {
          navItems().slice(0, 12).forEach((item) => {
            addChild({
              ...navNodeFromItem(item, "hub"),
              kicker: "related"
            });
          });
        }
        return { nodes: uniqueById(nodes), edges };
      }

      function relNode(parentId, index, spec) {
        const itemType = spec.itemType || {
          hebrewLetter: "letter",
          planetCorrespondence: "planet",
          planet: "planet",
          zodiacCorrespondence: "zodiac",
          zodiac: "zodiac",
          decan: "zodiac",
          element: "element",
          tarotCard: "tarot",
          tarot: "tarot",
          calendarMonth: "month",
          iching: "iching",
          path: "path",
          sephira: "sephira",
          god: "god",
          number: "number"
        }[spec.type] || "";
        return {
          id: `${parentId}-rel-${index}-${slug(spec.label)}`,
          kind: itemType ? "item" : "rel",
          kicker: spec.kicker || TYPE_KICKERS[spec.type] || spec.type || "link",
          label: shorten(spec.label, 40),
          parentId,
          itemType,
          itemId: spec.itemId || slug(spec.label),
          catalogType: spec.catalogType || "",
          navEvent: spec.navEvent || "",
          navDetail: spec.navDetail || null,
          navId: spec.navId || "",
          record: spec.record || null
        };
      }

      function relationsFromTarot(card, parentId) {
        const out = [];
        const push = (spec) => {
          if (spec?.label) out.push(spec);
        };
        if (card.hebrewLetter || card.hebrewLetterId) {
          push({
            type: "hebrewLetter",
            label: card.hebrewLetter || card.hebrewLetterId,
            itemType: "letter",
            itemId: card.hebrewLetterId || slug(card.hebrewLetter),
            navEvent: "nav:alphabet",
            navDetail: { alphabet: "hebrew", hebrewLetterId: card.hebrewLetterId }
          });
        }
        if (card.kabbalahPathNumber) {
          push({
            type: "path",
            label: `Path ${card.kabbalahPathNumber}`,
            itemType: "path",
            itemId: String(card.kabbalahPathNumber),
            navEvent: "nav:kabbalah-path",
            navDetail: { pathNo: card.kabbalahPathNumber }
          });
        }
        asList(card.relations).forEach((relation) => {
          const type = String(relation?.type || "");
          const data = relation?.data || {};
          const spec = {
            type,
            label: relation.label || relation.id || type,
            record: relation
          };
          if (type === "hebrewLetter") {
            spec.itemType = "letter";
            spec.itemId = data.letterId || relation.id;
            spec.navEvent = "nav:alphabet";
            spec.navDetail = { alphabet: "hebrew", hebrewLetterId: spec.itemId };
          } else if (type === "planet" || type === "planetCorrespondence" || type === "decanRuler") {
            spec.itemType = "planet";
            spec.itemId = data.planetId || relation.id;
            spec.navEvent = "nav:planet";
            spec.navDetail = { planetId: spec.itemId };
          } else if (type === "zodiac" || type === "zodiacCorrespondence" || type === "decan") {
            spec.itemType = "zodiac";
            spec.itemId = data.signId || relation.id;
            spec.navEvent = "nav:zodiac";
            spec.navDetail = { signId: spec.itemId };
          } else if (type === "element") {
            spec.itemType = "element";
            spec.itemId = data.elementId || relation.id;
            spec.navEvent = "nav:elements";
            spec.navDetail = { elementId: spec.itemId };
          } else if (type === "tarotCard") {
            spec.itemType = "tarot";
            spec.itemId = slug(data.cardName || relation.label);
            spec.navEvent = "nav:tarot-trump";
            spec.navDetail = { cardName: data.cardName || relation.label };
          } else if (type === "calendarMonth") {
            spec.itemType = "month";
            spec.itemId = data.monthId || relation.id;
            spec.navEvent = "nav:calendar-month";
            spec.navDetail = { monthId: spec.itemId };
          } else if (type === "iching" || /iching/i.test(type)) {
            spec.itemType = "iching";
            spec.navEvent = "nav:iching";
            spec.navDetail = { hexagramNumber: data.hexagramNumber || data.number };
          }
          push(spec);
        });
        return out.map((spec, index) => relNode(parentId, index, spec));
      }

      function relationsFromLetter(letter, parentId) {
        const out = [];
        if (letter.tarot?.card) {
          out.push({
            type: "tarot",
            label: letter.tarot.card,
            itemType: "tarot",
            navEvent: "nav:tarot-trump",
            navDetail: { cardName: letter.tarot.card, trumpNumber: letter.tarot.trumpNumber }
          });
        }
        if (letter.kabbalahPathNumber) {
          out.push({
            type: "path",
            label: `Path ${letter.kabbalahPathNumber}`,
            itemType: "path",
            navEvent: "nav:kabbalah-path",
            navDetail: { pathNo: letter.kabbalahPathNumber }
          });
        }
        if (letter.astrology?.name) {
          const kind = letter.astrology.type === "planet" ? "planet" : "element";
          out.push({
            type: kind,
            label: letter.astrology.name,
            itemType: kind,
            navEvent: kind === "planet" ? "nav:planet" : "nav:elements",
            navDetail: kind === "planet"
              ? { planetId: slug(letter.astrology.name) }
              : { elementId: slug(letter.astrology.name) }
          });
        }
        if (letter.numerology != null) {
          out.push({
            type: "number",
            label: String(letter.numerology),
            itemType: "number",
            navEvent: "nav:number",
            navDetail: { value: letter.numerology }
          });
        }
        if (letter.greekEquivalent) {
          out.push({
            type: "letter",
            label: `Greek ${letter.greekEquivalent}`,
            itemType: "letter",
            navEvent: "nav:alphabet",
            navDetail: { alphabet: "greek", greekName: letter.greekEquivalent }
          });
        }
        return out.map((spec, index) => relNode(parentId, index, spec));
      }

      function relationsFromGeneric(record, parentId) {
        const keys = [
          ["planetId", "planet", "nav:planet", "planetId"],
          ["hebrewLetterId", "letter", "nav:alphabet", "hebrewLetterId"],
          ["elementId", "element", "nav:elements", "elementId"],
          ["element", "element", "nav:elements", "elementId"],
          ["rulingPlanetId", "planet", "nav:planet", "planetId"],
          ["godNameId", "god", "nav:gods", "godId"],
          ["chakraId", "chakra", "", ""],
          ["modality", "modality", "nav:modalities", "modalityId"]
        ];
        const out = [];
        keys.forEach(([key, itemType, navEvent, detailKey]) => {
          const value = record?.[key];
          if (!value || typeof value === "object") return;
          const spec = {
            type: itemType,
            label: String(value),
            itemType,
            itemId: String(value)
          };
          if (navEvent) {
            spec.navEvent = navEvent;
            spec.navDetail = detailKey === "hebrewLetterId"
              ? { alphabet: "hebrew", hebrewLetterId: value }
              : { [detailKey]: value };
          }
          out.push(spec);
        });
        if (record.tarot?.majorArcana) {
          out.push({
            type: "tarot",
            label: record.tarot.majorArcana,
            itemType: "tarot",
            navEvent: "nav:tarot-trump",
            navDetail: { cardName: record.tarot.majorArcana, trumpNumber: record.tarot.number }
          });
        }
        if (record.greek) {
          out.push({
            type: "god",
            label: String(record.greek),
            itemType: "god",
            navEvent: "nav:gods",
            navDetail: { godName: record.greek, pathNo: record.no }
          });
        }
        return uniqueById(out.map((spec, index) => relNode(parentId, index, spec)));
      }

      async function buildItemGraph(item) {
        const { magick, reference } = await ensureData();
        const hub = {
          id: "hub",
          kind: "hub",
          label: item.label,
          kicker: item.itemType || "item"
        };
        let children = [];
        if (item.itemType === "tarot") {
          const cards = await loadTarot();
          const card = cards.find((entry) => entry.id === item.itemId || slug(entry.name) === slug(item.itemId) || entry.name === item.label);
          children = card ? relationsFromTarot(card, "hub") : [];
        } else if (item.itemType === "letter") {
          const alphabets = magick?.grouped?.alphabets || {};
          const letter = asList(alphabets.hebrew)
            .concat(asList(alphabets.greek), asList(alphabets.english))
            .find((entry) => entry.hebrewLetterId === item.itemId || slug(entry.name) === slug(item.itemId) || entry.name === item.label);
          children = letter ? relationsFromLetter(letter, "hub") : [];
        } else if (item.itemType === "planet") {
          const planet = asList(reference?.planets).find((entry) => entry.id === item.itemId);
          children = planet ? relationsFromGeneric(planet, "hub") : [];
        } else if (item.itemType === "zodiac") {
          const sign = asList(reference?.signs).find((entry) => entry.id === item.itemId);
          children = sign ? relationsFromGeneric(sign, "hub") : [];
        } else if (item.itemType === "sephira" || item.itemType === "path") {
          const tree = magick?.grouped?.kabbalah?.["kabbalah-tree"] || {};
          const record = asList(tree.sephiroth).concat(asList(tree.paths))
            .find((entry) => entry.id === item.itemId || String(entry.pathNumber || entry.number) === String(item.itemId));
          children = record ? relationsFromGeneric(record, "hub") : [];
        } else if (item.record) {
          children = relationsFromGeneric(item.record, "hub");
        }
        if (!children.length) {
          children = navItems().slice(0, 8).map((entry, index) => relNode("hub", index, {
            type: "section",
            label: entry.label,
            catalogType: inferCatalog(entry.id),
            navId: entry.id
          }));
        }
        return {
          nodes: uniqueById([hub, ...children]),
          edges: children.map((child) => ({ from: "hub", to: child.id }))
        };
      }

      function layoutGraph(model, width, height) {
        const nodes = model.nodes.map((node) => ({ ...node }));
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const childrenOf = new Map();
        model.edges.forEach((edge) => {
          if (!childrenOf.has(edge.from)) childrenOf.set(edge.from, []);
          childrenOf.get(edge.from).push(byId.get(edge.to));
        });
        const hub = nodes.find((node) => node.kind === "hub") || nodes[0];
        if (!hub) return { nodes: [], edges: model.edges };
        hub.x = width / 2;
        hub.y = height / 2;
        hub.depth = 0;

        function place(node, angle, span) {
          const kids = (childrenOf.get(node.id) || []).filter(Boolean);
          const count = kids.length;
          if (!count) return;
          const radius = Math.max(170, (count * 78) / Math.max(span, 0.7));
          kids.forEach((kid, index) => {
            const kidSpan = span / count;
            const kidAngle = angle - span / 2 + kidSpan * (index + 0.5);
            kid.x = node.x + Math.cos(kidAngle) * radius;
            kid.y = node.y + Math.sin(kidAngle) * radius;
            kid.depth = (node.depth || 0) + 1;
            place(kid, kidAngle, Math.max(kidSpan * 1.15, 0.55));
          });
        }
        place(hub, -Math.PI / 2, Math.PI * 2);
        return { nodes, edges: model.edges };
      }

      function renderCrumbs() {
        crumbsEl.innerHTML = "";
        stack.forEach((frame, index) => {
          if (index) {
            const sep = document.createElement("span");
            sep.textContent = " › ";
            crumbsEl.appendChild(sep);
          }
          const button = document.createElement("button");
          button.type = "button";
          button.className = "mindmap-crumb";
          button.textContent = frame.label;
          button.addEventListener("click", () => {
            stack = stack.slice(0, index + 1);
            void showFrame();
          });
          crumbsEl.appendChild(button);
        });
      }

      function bindNodeActivate(el, node) {
        el.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
        });
        el.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void onNodeClick(node);
        });
        el.addEventListener("dblclick", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openPage(node);
        });
      }

      function renderGraph() {
        const bounds = stageEl.getBoundingClientRect();
        const laid = layoutGraph(graph, Math.max(bounds.width, 800), Math.max(bounds.height, 600));
        const byId = new Map(laid.nodes.map((node) => [node.id, node]));
        svgEl.setAttribute("viewBox", `0 0 ${Math.max(bounds.width, 800)} ${Math.max(bounds.height, 600)}`);
        svgEl.innerHTML = laid.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return "";
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const cx = mx - dy * 0.12;
          const cy = my + dx * 0.12;
          return `<path class="mindmap-link" data-to="${String(to.id).replace(/"/g, "")}" d="M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}" />`;
        }).join("");
        svgEl.querySelectorAll(".mindmap-link").forEach((pathEl) => {
          const node = byId.get(pathEl.getAttribute("data-to"));
          if (!node) return;
          bindNodeActivate(pathEl, node);
        });
        nodesEl.innerHTML = "";
        laid.nodes.forEach((node) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `mm-node mm-node-${node.kind || "item"}`;
          button.style.left = `${node.x}px`;
          button.style.top = `${node.y}px`;
          button.innerHTML = `<span class="mm-kicker"></span><span class="mm-label"></span>`;
          button.querySelector(".mm-kicker").textContent = node.kicker || "";
          button.querySelector(".mm-label").textContent = node.label || node.id;
          bindNodeActivate(button, node);
          nodesEl.appendChild(button);
        });
      }

      function openPage(node) {
        if (node?.navEvent) {
          document.dispatchEvent(new CustomEvent(node.navEvent, { detail: node.navDetail || {} }));
        } else if (node?.navId) {
          ui.openNav(node.navId);
        }
        setPageOpen(true);
      }

      async function onNodeClick(node) {
        if (!node || node.kind === "hub") return;
        const pageNav = isPageNav(node.navId);
        if (pageNav && node.kind === "nav") {
          openPage(node);
          return;
        }
        if (node.kind === "group" || node.catalogType) {
          pushFrame({
            type: "catalog",
            label: node.label,
            catalogType: node.catalogType || node.catalog || inferCatalog(node.navId),
            catalogGroup: node.catalogGroup,
            alphabet: node.alphabet,
            navId: node.navId
          });
          return;
        }
        if (Array.isArray(node.children) && node.children.length) {
          pushFrame({
            type: "branch",
            label: node.label,
            children: node.children,
            navId: node.navId
          });
          return;
        }
        if (node.catalog || inferCatalog(node.navId)) {
          pushFrame({
            type: "catalog",
            label: node.label,
            catalogType: node.catalog || inferCatalog(node.navId),
            navId: node.navId
          });
          return;
        }
        if (node.itemType || node.kind === "item" || node.kind === "rel") {
          pushFrame({
            type: "item",
            label: node.label,
            itemType: node.itemType || node.kind,
            itemId: node.itemId || node.id,
            navEvent: node.navEvent,
            navDetail: node.navDetail,
            navId: node.navId,
            record: node.record
          });
          return;
        }
        if (node.navId) {
          openPage(node);
        }
      }

      async function showFrame() {
        const token = ++renderToken;
        const frame = current();
        renderCrumbs();
        if (frame.type === "catalog") {
          graph = await buildCatalogGraph({
            type: frame.catalogType,
            group: frame.catalogGroup,
            alphabet: frame.alphabet,
            label: frame.label,
            navId: frame.navId
          });
        } else if (frame.type === "branch") {
          graph = buildBranchGraph(frame);
        } else if (frame.type === "item") {
          graph = await buildItemGraph(frame);
        } else {
          graph = buildMenuGraph();
        }
        if (token !== renderToken) return;
        renderGraph();
        view.x = 0;
        view.y = 0;
        view.scale = 0.82;
        applyView();
      }

      stageEl.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        if (event.target.closest(".mm-node, .mindmap-link, .mindmap-hud")) return;
        pan.active = true;
        pan.moved = false;
        pan.x = event.clientX;
        pan.y = event.clientY;
        pan.vx = view.x;
        pan.vy = view.y;
      });
      stageEl.addEventListener("pointermove", (event) => {
        if (!pan.active) return;
        const dx = event.clientX - pan.x;
        const dy = event.clientY - pan.y;
        if (!pan.moved && Math.hypot(dx, dy) < 6) return;
        if (!pan.moved) {
          pan.moved = true;
          stageEl.classList.add("is-panning");
          try { stageEl.setPointerCapture(event.pointerId); } catch (_error) {}
        }
        view.x = pan.vx + dx;
        view.y = pan.vy + dy;
        applyView();
      });
      stageEl.addEventListener("pointerup", () => {
        pan.active = false;
        pan.moved = false;
        stageEl.classList.remove("is-panning");
      });
      stageEl.addEventListener("wheel", (event) => {
        event.preventDefault();
        const rect = stageEl.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const before = view.scale;
        const next = Math.min(2.4, Math.max(0.35, before * (event.deltaY > 0 ? 0.92 : 1.08)));
        const wx = (mx - view.x) / before;
        const wy = (my - view.y) / before;
        view.scale = next;
        view.x = mx - wx * next;
        view.y = my - wy * next;
        applyView();
      }, { passive: false });

      backEl.addEventListener("click", () => {
        if (stack.length > 1) {
          stack.pop();
          void showFrame();
          return;
        }
        ui.goBack();
      });
      homeEl.addEventListener("click", () => {
        stack = [{ type: "menu", label: "KABBAK" }];
        setPageOpen(false);
        void showFrame();
      });
      pageToggleEl.addEventListener("click", () => {
        if (!pageOpen) {
          const frame = current();
          if (frame.navId) ui.openNav(frame.navId);
          else if (frame.navEvent) document.dispatchEvent(new CustomEvent(frame.navEvent, { detail: frame.navDetail || {} }));
          else ui.openNav("open-home-menu");
        }
        setPageOpen(!pageOpen);
      });

      const onResize = () => renderGraph();
      window.addEventListener("resize", onResize);
      document.addEventListener("taro-plugins-ready", () => {
        if (current().type === "menu") void showFrame();
      });
      document.addEventListener("connection:access-updated", () => {
        if (current().type === "menu") void showFrame();
      });
      void showFrame();
      applyView();

      return () => {
        window.removeEventListener("resize", onResize);
      };
    }
  });
})();
