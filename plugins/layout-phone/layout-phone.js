(function () {
  "use strict";

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[layout-phone] TaroTimePluginHost is not available.");
    return;
  }

  const PHONE_VERSION = "1.3.0";

  // Bottom rail is a horizontal scroller; "More" stays pinned on the right.
  const RAIL_ITEMS = [
    { id: "home", label: "Home", icon: "home", section: "home", navId: "open-home" },
    { id: "tarot", label: "Tarot", icon: "tarot", section: "tarot", navId: "open-tarot-cards" },
    { id: "calendar", label: "Calendar", icon: "calendar", section: "planner", navId: "open-calendar" },
    { id: "kabbalah", label: "Kabbalah", icon: "kabbalah", section: "kabbalah", navId: "open-kabbalah-sephirot" },
    { id: "iching", label: "I Ching", icon: "iching", section: "iching", navId: "open-iching-hexagrams" },
    { id: "planets", label: "Planets", icon: "planet", section: "planets", navId: "open-planets" },
    { id: "alphabet", label: "Alphabet", icon: "alphabet", section: "alphabet", navId: "open-alphabet-word" },
    { id: "numbers", label: "Numbers", icon: "numbers", section: "numbers", navId: "open-numbers-browse" },
    { id: "community", label: "Community", icon: "community", section: "community", navId: "open-community" },
    { id: "quiz", label: "Quiz", icon: "quiz", section: "quiz", navId: "open-quiz" },
    { id: "games", label: "Games", icon: "games", section: "games", navId: "open-games" },
    { id: "profile", label: "You", icon: "you", section: "profile", navId: "open-profile" }
  ];

  // Maps a section (and its sub-sections) onto the rail item that owns it.
  const SECTION_RAIL = {
    home: "home",
    tarot: "tarot",
    "tarot-frame": "tarot",
    "tarot-house": "tarot",
    planner: "calendar",
    kabbalah: "kabbalah",
    "kabbalah-worlds": "kabbalah",
    "kabbalah-paths": "kabbalah",
    "kabbalah-cross": "kabbalah",
    "kabbalah-tree": "kabbalah",
    cube: "kabbalah",
    "kabbalah-tandem": "kabbalah",
    iching: "iching",
    "iching-trigram": "iching",
    "iching-bigram": "iching",
    "iching-phase": "iching",
    planets: "planets",
    zodiac: "planets",
    natal: "planets",
    astronomy: "planets",
    sky: "planets",
    cycles: "planets",
    elements: "planets",
    tattvas: "planets",
    modalities: "planets",
    alphabet: "alphabet",
    "alphabet-letters": "alphabet",
    "alphabet-text": "alphabet",
    "alphabet-reference": "alphabet",
    scriber: "alphabet",
    numbers: "numbers",
    "num-pad": "numbers",
    community: "community",
    games: "games",
    quiz: "quiz",
    profile: "profile"
  };

  const HIDE_IN_MORE = new Set([
    "open-home",
    "open-home-menu",
    "open-tarot-cards",
    "open-calendar",
    "open-calendar-months"
  ]);

  const ID_SECTION_ALIASES = {
    "open-kabbalah-sephirot": "kabbalah",
    "open-alphabet-word": "alphabet",
    "open-numbers-browse": "numbers",
    "open-numbers-theory": "numbers",
    "open-iching-hexagrams": "iching"
  };

  function railIdForSection(section) {
    return SECTION_RAIL[String(section || "")] || "";
  }

  function isActiveId(id, section) {
    const current = String(section || "");
    const item = RAIL_ITEMS.find((entry) => entry.navId === id);
    if (item) {
      return item.id === railIdForSection(current);
    }
    const target = ID_SECTION_ALIASES[id] || String(id || "").replace(/^open-/, "");
    return target === current;
  }

  function iconSvg(name) {
    const paths = {
      home: '<path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
      tarot: '<rect x="7" y="3" width="10" height="18" rx="2.4"/><path d="M12 8.6 13.2 11l2.6.2-2 1.8.6 2.6L12 14.4l-2.4 1.2.6-2.6-2-1.8 2.6-.2z"/>',
      calendar: '<rect x="4" y="5" width="16" height="15" rx="2.6"/><path d="M8 3v4M16 3v4M4 10h16"/>',
      kabbalah: '<circle cx="12" cy="4.8" r="2"/><circle cx="5.6" cy="17" r="2"/><circle cx="18.4" cy="17" r="2"/><path d="M12 6.8 6.6 15.4M12 6.8l5.4 8.6M7.6 17h8.8"/>',
      iching: '<path d="M5 7h14M5 12h14M5 17h8"/>',
      planet: '<circle cx="12" cy="12" r="5.2"/><path d="M4.4 15.2c4 1.6 11.2 1.6 15.2 0"/>',
      alphabet: '<path d="M6 19 12 5l6 14M8.6 13.6h6.8"/>',
      numbers: '<path d="M9 4 7 20M17 4l-2 16M5 9h14M4 15h14"/>',
      community: '<circle cx="9" cy="9" r="2.8"/><path d="M4 19c.7-3.1 2.8-4.8 5-4.8s4.3 1.7 5 4.8"/><path d="M15.6 7.2a2.6 2.6 0 1 1 0 5.2M16 19c-.2-1.7-.6-3-1.3-4"/>',
      quiz: '<circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.9"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
      games: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
      you: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 19.5c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2"/>',
      more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1"/>',
      chevron: '<path d="M14.5 6 8.5 12l6 6"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.more}</svg>`;
  }

  function visibleRailItems() {
    return RAIL_ITEMS.filter((item) => {
      if (item.id === "home") {
        return true;
      }
      const button = document.getElementById(item.navId);
      return button instanceof HTMLElement && !button.hidden;
    });
  }

  host.register({
    id: "layout-phone",
    name: "Phone Layout",
    version: PHONE_VERSION,
    role: "skin",
    bundled: document.documentElement.getAttribute("data-kabbak-native") === "1",
    mount(shellEl, helpers) {
      const ui = helpers.ui;
      if (!ui) {
        console.warn("[layout-phone] helpers.ui is not available.");
        return null;
      }

      ui.hideDefaultChrome();
      shellEl.innerHTML = `
        <div class="layout-phone">
          <header class="layout-phone-top">
            <button class="layout-phone-back" type="button" aria-label="Back" hidden>${iconSvg("chevron")}</button>
            <div class="layout-phone-title"></div>
            <div class="layout-phone-top-actions">
              <div class="layout-phone-widgets"></div>
              <button class="layout-phone-settings" type="button" aria-label="Settings">${iconSvg("settings")}</button>
            </div>
          </header>
          <div class="layout-phone-pages"></div>
          <nav class="layout-phone-rail-wrap" aria-label="Primary">
            <div class="layout-phone-rail"></div>
            <button class="layout-phone-rail-more" type="button">${iconSvg("more")}<span>More</span></button>
          </nav>
          <div class="layout-phone-sheet" hidden>
            <button class="layout-phone-sheet-backdrop" type="button" aria-label="Close menu"></button>
            <div class="layout-phone-sheet-panel" role="dialog" aria-label="Menu">
              <div class="layout-phone-sheet-handle"></div>
              <div class="layout-phone-sheet-search"></div>
              <div class="layout-phone-sheet-menu"></div>
              <div class="layout-phone-sheet-options"></div>
            </div>
          </div>
        </div>
      `;

      const rootEl = shellEl.querySelector(".layout-phone");
      const titleEl = shellEl.querySelector(".layout-phone-title");
      const backEl = shellEl.querySelector(".layout-phone-back");
      const settingsEl = shellEl.querySelector(".layout-phone-settings");
      const pagesEl = shellEl.querySelector(".layout-phone-pages");
      const widgetsEl = shellEl.querySelector(".layout-phone-widgets");
      const railEl = shellEl.querySelector(".layout-phone-rail");
      const railMoreEl = shellEl.querySelector(".layout-phone-rail-more");
      const sheetEl = shellEl.querySelector(".layout-phone-sheet");
      const sheetMenuEl = shellEl.querySelector(".layout-phone-sheet-menu");
      const sheetSearchEl = shellEl.querySelector(".layout-phone-sheet-search");
      const sheetBackdropEl = shellEl.querySelector(".layout-phone-sheet-backdrop");
      const sheetOptionsEl = shellEl.querySelector(".layout-phone-sheet-options");

      const OPTIONS_STORAGE_KEY = "kabbak-phone-options";
      const DEFAULT_OPTIONS = { browse: "drill", density: "comfortable", barLabels: true };

      function readOptions() {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(OPTIONS_STORAGE_KEY) || "{}");
          const merged = { ...DEFAULT_OPTIONS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
          if (typeof merged.tabLabels === "boolean" && typeof merged.barLabels !== "boolean") {
            merged.barLabels = merged.tabLabels;
          }
          return merged;
        } catch (_error) {
          return { ...DEFAULT_OPTIONS };
        }
      }

      let options = readOptions();

      function persistOptions() {
        try {
          window.localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
        } catch (_error) {}
      }

      function applyOptions() {
        const root = document.documentElement;
        root.classList.toggle("kabbak-phone-split", options.browse === "split");
        root.classList.toggle("kabbak-phone-compact", options.density === "compact");
        root.classList.toggle("kabbak-phone-no-barlabels", options.barLabels === false);
      }

      function renderOptions() {
        if (!sheetOptionsEl) {
          return;
        }
        sheetOptionsEl.innerHTML = "";
        const rows = [
          { label: "Layout", key: "browse", choices: [["drill", "Full screen"], ["split", "Split"]] },
          { label: "Rows", key: "density", choices: [["comfortable", "Comfortable"], ["compact", "Compact"]] },
          { label: "Bar labels", key: "barLabels", choices: [[true, "Show"], [false, "Hide"]] }
        ];
        rows.forEach((row) => {
          const rowEl = document.createElement("div");
          rowEl.className = "layout-phone-option-row";
          const labelEl = document.createElement("span");
          labelEl.className = "layout-phone-option-label";
          labelEl.textContent = row.label;
          const segEl = document.createElement("div");
          segEl.className = "layout-phone-segmented";
          row.choices.forEach(([value, text]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = text;
            button.classList.toggle("is-active", options[row.key] === value);
            button.addEventListener("click", () => {
              options = { ...options, [row.key]: value };
              persistOptions();
              applyOptions();
              renderOptions();
            });
            segEl.appendChild(button);
          });
          rowEl.appendChild(labelEl);
          rowEl.appendChild(segEl);
          sheetOptionsEl.appendChild(rowEl);
        });
        const versionEl = document.createElement("div");
        versionEl.className = "layout-phone-options-version";
        versionEl.textContent = `Phone layout ${PHONE_VERSION}`;
        sheetOptionsEl.appendChild(versionEl);
      }

      ui.attachPages(pagesEl);
      ui.attachWidgets(widgetsEl);
      applyOptions();

      let sheetOpen = false;

      function activeLayout() {
        const layouts = pagesEl.querySelectorAll(".browse-layout, .kab-layout");
        for (const layout of layouts) {
          if (layout.closest("[hidden]")) continue;
          const section = layout.closest("section");
          if (section instanceof HTMLElement && section.hidden) continue;
          return layout;
        }
        return null;
      }

      function openSection(section) {
        const target = String(section || "");
        if (!target) return;
        if (typeof ui.openSection === "function") {
          ui.openSection(target);
          return;
        }
        ui.openNav(target === "planner" ? "open-calendar" : `open-${target}`);
      }

      function setSheet(open) {
        sheetOpen = Boolean(open);
        sheetEl.hidden = !sheetOpen;
        rootEl.classList.toggle("is-sheet-open", sheetOpen);
        document.documentElement.classList.toggle("kabbak-phone-sheet-open", sheetOpen);
        if (sheetOpen) {
          renderSheet();
        }
      }

      function ensureSearch() {
        const items = ui.listNav();
        const searchItem = items.find((item) => item.type === "search") || null;
        sheetSearchEl.innerHTML = "";
        if (!searchItem) {
          sheetSearchEl.hidden = true;
          return;
        }
        sheetSearchEl.hidden = false;
        const input = document.createElement("input");
        input.type = "search";
        input.placeholder = searchItem.label || "Search menu…";
        input.addEventListener("input", () => {
          window.TaroTimeMenuPlugin?.applySearchFilter?.(input.value);
        });
        sheetSearchEl.appendChild(input);
      }

      function appendNavButton(parent, item, active) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "layout-phone-sheet-item";
        button.textContent = item.label || item.id;
        button.classList.toggle("is-active", isActiveId(item.id, active));
        button.addEventListener("click", () => {
          setSheet(false);
          ui.openNav(item.id);
        });
        parent.appendChild(button);
      }

      function renderSheet() {
        const active = ui.getActiveSection();
        const items = ui.listNav().filter((item) => !item.hidden);
        ensureSearch();
        sheetMenuEl.innerHTML = "";
        items.forEach((item) => {
          if (item.type === "search") return;
          if (HIDE_IN_MORE.has(item.id)) return;
          if (item.type === "header") {
            const heading = document.createElement("div");
            heading.className = "layout-phone-sheet-heading";
            heading.textContent = item.label || "";
            sheetMenuEl.appendChild(heading);
            return;
          }
          const children = (item.children || []).filter((child) => {
            return !child.hidden && child.type !== "search" && !HIDE_IN_MORE.has(child.id);
          });
          if (!children.length) {
            appendNavButton(sheetMenuEl, item, active);
            return;
          }
          const group = document.createElement("div");
          group.className = "layout-phone-sheet-group is-open";
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "layout-phone-sheet-group-toggle";
          toggle.textContent = item.label || "";
          toggle.classList.toggle("is-active", children.some((child) => isActiveId(child.id, active)));
          toggle.addEventListener("click", () => {
            group.classList.toggle("is-open");
          });
          const childWrap = document.createElement("div");
          childWrap.className = "layout-phone-sheet-children";
          children.forEach((child) => appendNavButton(childWrap, child, active));
          group.appendChild(toggle);
          group.appendChild(childWrap);
          sheetMenuEl.appendChild(group);
        });
        renderOptions();
      }

      let railSignature = "";
      let lastRailId = "";
      const railPlugins = new Map();

      function railPluginList() {
        return [...railPlugins.values()];
      }

      function syncRailActive() {
        const activeId = railIdForSection(ui.getActiveSection());
        railEl.querySelectorAll(".layout-phone-rail-item").forEach((button) => {
          if (button.dataset.railPlugin) {
            const entry = railPlugins.get(button.dataset.railPlugin);
            button.classList.toggle("is-active", Boolean(entry?.active));
            return;
          }
          button.classList.toggle("is-active", button.dataset.id === activeId);
        });
        return activeId;
      }

      function centerRailItem(button) {
        if (!button) return;
        const target = Math.max(0, button.offsetLeft - (railEl.clientWidth - button.offsetWidth) / 2);
        if (typeof railEl.scrollTo === "function") {
          railEl.scrollTo({ left: target, behavior: "smooth" });
        } else {
          railEl.scrollLeft = target;
        }
      }

      function renderRail() {
        const items = visibleRailItems();
        const plugins = railPluginList();
        const signature = `${items.map((item) => item.id).join(",")}|${plugins.map((entry) => entry.id).join(",")}`;
        // Build the buttons once. Rebuilding on every chrome render would cancel
        // an in-progress touch drag and reset the scroll position.
        if (signature !== railSignature) {
          railSignature = signature;
          railEl.innerHTML = "";
          items.forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "layout-phone-rail-item";
            button.dataset.id = item.id;
            button.innerHTML = `${iconSvg(item.icon)}<span>${item.label}</span>`;
            button.addEventListener("click", () => openSection(item.section));
            railEl.appendChild(button);
          });
          plugins.forEach((entry) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "layout-phone-rail-item";
            button.dataset.railPlugin = entry.id;
            button.innerHTML = `${entry.icon}<span>${entry.label}</span>`;
            button.addEventListener("click", () => entry.onClick());
            railEl.appendChild(button);
          });
        }
        const activeId = syncRailActive();
        if (activeId && activeId !== lastRailId) {
          lastRailId = activeId;
          centerRailItem(railEl.querySelector(".layout-phone-rail-item.is-active:not([data-rail-plugin])"));
        }
      }

      // Plugins (e.g. the music player) can contribute a rail item instead of
      // taking space in the app bar. Mobile-only entry point.
      const railApi = {
        add(item) {
          const id = String(item?.id || "").trim();
          if (!id) {
            return () => {};
          }
          railPlugins.set(id, {
            id,
            label: String(item.label || "Item"),
            icon: String(item.icon || ""),
            onClick: typeof item.onClick === "function" ? item.onClick : () => {},
            active: Boolean(item.active)
          });
          renderRail();
          return () => {
            if (railPlugins.delete(id)) {
              renderRail();
            }
          };
        },
        remove(id) {
          if (railPlugins.delete(String(id || ""))) {
            renderRail();
          }
        },
        setActive(id, active) {
          const entry = railPlugins.get(String(id || ""));
          if (!entry) {
            return;
          }
          entry.active = Boolean(active);
          railEl.querySelectorAll(".layout-phone-rail-item[data-rail-plugin]").forEach((button) => {
            if (button.dataset.railPlugin === entry.id) {
              button.classList.toggle("is-active", entry.active);
            }
          });
        }
      };
      window.KabbakPhoneRail = railApi;

      function renderChrome() {
        const section = ui.getActiveSection();
        const layout = activeLayout();
        const canReturnToList = Boolean(layout && layout.classList.contains("layout-sidebar-collapsed"));
        titleEl.textContent = ui.sectionLabel(section) || section;
        backEl.hidden = section === "home" && !sheetOpen && !canReturnToList;
        backEl.setAttribute("aria-label", canReturnToList ? "Back to list" : "Back");
        backEl.classList.toggle("is-list-back", canReturnToList);
        renderRail();
        if (sheetOpen) renderSheet();
      }

      backEl.addEventListener("click", () => {
        if (sheetOpen) {
          setSheet(false);
          renderChrome();
          return;
        }
        const layout = activeLayout();
        if (layout && layout.classList.contains("layout-sidebar-collapsed")) {
          window.TarotChromeUi?.showSidebarOnly?.(layout);
          return;
        }
        ui.goBack();
      });
      settingsEl.addEventListener("click", () => {
        setSheet(false);
        openSection("settings");
      });
      railMoreEl.addEventListener("click", () => {
        setSheet(!sheetOpen);
        renderChrome();
      });
      sheetBackdropEl.addEventListener("click", () => {
        setSheet(false);
        renderChrome();
      });

      // Drag scrolling for the rail. Native overflow scrolling is unreliable
      // inside the Android WebView for a strip of buttons, so the rail is
      // scrolled directly. Touch events drive touch devices (most reliable
      // there); pointer events cover mouse/pen.
      let railDrag = null;
      let railMomentum = 0;
      let suppressRailClick = false;

      function stopRailMomentum() {
        if (railMomentum) {
          window.cancelAnimationFrame(railMomentum);
          railMomentum = 0;
        }
      }

      function startRailMomentum(velocity) {
        stopRailMomentum();
        let speed = Math.max(-3, Math.min(3, Number(velocity) || 0));
        let last = window.performance.now();
        const step = (now) => {
          const dt = Math.min(now - last, 32);
          last = now;
          speed *= Math.pow(0.94, dt / 16);
          if (Math.abs(speed) < 0.02) {
            railMomentum = 0;
            return;
          }
          const max = Math.max(0, railEl.scrollWidth - railEl.clientWidth);
          railEl.scrollLeft = Math.max(0, Math.min(max, railEl.scrollLeft - speed * dt));
          railMomentum = window.requestAnimationFrame(step);
        };
        railMomentum = window.requestAnimationFrame(step);
      }

      function beginRailDrag(x, y, pointerId) {
        stopRailMomentum();
        railDrag = {
          pointerId: pointerId == null ? null : pointerId,
          startX: x,
          startY: y,
          startLeft: railEl.scrollLeft,
          lastX: x,
          lastT: window.performance.now(),
          velocity: 0,
          moved: false
        };
      }

      function moveRailDrag(x, y, event) {
        if (!railDrag) return;
        const dx = x - railDrag.startX;
        const dy = y - railDrag.startY;
        if (!railDrag.moved) {
          if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
          railDrag.moved = true;
          if (railDrag.pointerId != null) {
            try { railEl.setPointerCapture(railDrag.pointerId); } catch (_error) {}
          }
        }
        const now = window.performance.now();
        const dt = now - railDrag.lastT;
        if (dt > 0) {
          railDrag.velocity = (x - railDrag.lastX) / dt;
        }
        railDrag.lastX = x;
        railDrag.lastT = now;
        railEl.scrollLeft = railDrag.startLeft - dx;
        if (event && event.cancelable) {
          event.preventDefault();
        }
      }

      function endRailDrag() {
        if (!railDrag) return;
        const drag = railDrag;
        railDrag = null;
        if (drag.pointerId != null) {
          try { railEl.releasePointerCapture(drag.pointerId); } catch (_error) {}
        }
        if (!drag.moved) return;
        suppressRailClick = true;
        window.setTimeout(() => { suppressRailClick = false; }, 600);
        startRailMomentum(drag.velocity);
      }

      railEl.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        beginRailDrag(event.clientX, event.clientY, event.pointerId);
      });

      railEl.addEventListener("pointermove", (event) => {
        if (!railDrag || railDrag.pointerId !== event.pointerId) return;
        moveRailDrag(event.clientX, event.clientY, event);
      });

      railEl.addEventListener("pointerup", (event) => {
        if (railDrag && railDrag.pointerId === event.pointerId) endRailDrag();
      });

      railEl.addEventListener("pointercancel", (event) => {
        if (railDrag && railDrag.pointerId === event.pointerId) endRailDrag();
      });

      railEl.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) return;
        beginRailDrag(event.touches[0].clientX, event.touches[0].clientY, null);
      }, { passive: true });

      railEl.addEventListener("touchmove", (event) => {
        if (!railDrag || event.touches.length !== 1) return;
        moveRailDrag(event.touches[0].clientX, event.touches[0].clientY, event);
      }, { passive: false });

      railEl.addEventListener("touchend", endRailDrag);
      railEl.addEventListener("touchcancel", endRailDrag);

      railEl.addEventListener("click", (event) => {
        if (suppressRailClick) {
          event.preventDefault();
          event.stopPropagation();
          suppressRailClick = false;
        }
      }, true);

      renderChrome();
      // List/detail panes collapse via classes from the core chrome; watch them
      // so the header back/label tracks drill-down without a section change.
      // Coalesce bursts (selection toggles etc.) into one frame.
      let chromeFrame = 0;
      const scheduleChrome = () => {
        if (chromeFrame) return;
        chromeFrame = window.requestAnimationFrame(() => {
          chromeFrame = 0;
          renderChrome();
        });
      };
      const layoutObserver = new MutationObserver(scheduleChrome);
      layoutObserver.observe(pagesEl, { subtree: true, attributes: true, attributeFilter: ["class"] });
      const stop = ui.onSectionChange(renderChrome);
      document.addEventListener("taro-plugins-ready", renderChrome);
      document.addEventListener("taro-menu-updated", renderChrome);
      return () => {
        layoutObserver.disconnect();
        if (chromeFrame) window.cancelAnimationFrame(chromeFrame);
        stopRailMomentum();
        if (window.KabbakPhoneRail === railApi) {
          delete window.KabbakPhoneRail;
        }
        document.documentElement.classList.remove(
          "kabbak-phone-split",
          "kabbak-phone-compact",
          "kabbak-phone-no-barlabels",
          "kabbak-phone-sheet-open"
        );
        document.removeEventListener("taro-plugins-ready", renderChrome);
        document.removeEventListener("taro-menu-updated", renderChrome);
        if (typeof stop === "function") stop();
      };
    }
  });
})();
