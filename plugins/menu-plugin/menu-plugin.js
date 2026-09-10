/* menu-plugin.js — DLC plugin: admin-configurable top bar menu with submenus.
 * config.json: {
 *   "menuTitle": "My Title",         // optional banner title (blank = app default)
 *   "showUnlisted": true,
 *   "items": [
 *     { "id": "open-home-menu", "label": "Home", "enabled": true },
 *     { "id": "open-tarot", "label": "Tarot", "enabled": true, "children": [
 *         { "id": "open-tarot-cards", "label": "Cards", "enabled": true },
 *         { "id": "open-tarot-spread", "label": "Draw Spread" }
 *     ]},
 *     { "id": "mystic", "label": "Mystic ▾", "enabled": true, "children": [
 *         { "id": "open-elements", "label": "Elements" },
 *         { "id": "open-gods", "label": "Gods" }
 *     ]}
 *   ]
 * }
 * - Top-level order follows `items`.
 * - `children` turns an entry into a dropdown (existing dropdowns are reused;
 *   new group ids create a fresh dropdown with a custom trigger).
 * - Child ids reference existing app buttons, or a known section id
 *   ("open-" prefix optional); unknown ids are reported as broken links.
 * - `enabled: false` hides the entry.
 * - Unlisted app entries keep their default position unless showUnlisted=false.
 * - `keywords` on an item (or child) are extra search terms matched by the
 *   optional menu search bar.
 * - `showSearch: true` renders a search box in the menu bar that filters
 *   entries by label, id, dataset, and keywords.
 */
(function () {
  "use strict";

  const MENU_THEMES = ["default", "led", "wood", "paper", "stone", "velvet"];
  const SEARCH_MENU_ID = "mp-menu-search";
  const DEFAULT_CONFIG = { showUnlisted: false, menuSpacing: "normal", menuTheme: "default", logo: "", overlayBackground: "", menuTitle: "", hideMenuButton: false, showSearch: false, items: [] };

  // These stay in the menu as regular items: they can be reordered or grouped,
  // but cannot be disabled or omitted. App gates still hide Profile/Admin.
  const REQUIRED_MENU_IDS = new Set(["open-settings", "open-profile", "open-admin"]);
  const REQUIRED_MENU_ORDER = ["open-settings", "open-profile", "open-admin"];
  let lastConfig = DEFAULT_CONFIG;
  let lastHelpers = null;

  // What each section opens (shown in the menu editor as dataset info).
  const SECTION_DATASETS = {
    "home": "Home welcome",
    "sky": "Astronomy — live sky, planetary hour, moon",
    "alphabet": "Alphabet reference",
    "alphabet-text": "Alphabet — text library dataset",
    "alphabet-word": "Alphabet — word search",
    "alphabet-letters": "Alphabet — letter reference",
    "alphabet-reference": "Alphabet — reference entries",
    "astronomy": "Astronomy menu",
    "audio": "Audio menu",
    "audio-circle": "Audio — circle player",
    "audio-notes": "Audio — notes player",
    "calendar": "Calendar menu",
    "calendar-months": "Calendar — month view",
    "calendar-timeline": "Calendar — timeline view",
    "holidays": "Calendar — holidays",
    "cycles": "Astronomy — planetary cycles",
    "elements": "Elements reference",
    "enochian": "Enochian reference",
    "gods": "Gods reference",
    "iching": "I Ching menu",
    "iching-hexagrams": "I Ching — hexagrams",
    "iching-trigrams": "I Ching — trigrams",
    "kabbalah": "Kabbalah menu",
    "modalities": "Astrology — modalities",
    "natal": "Astrology — natal chart",
    "numbers": "Numerology",
    "planets": "Astronomy — planets",
    "profile": "Your profile",
    "quiz": "Quiz",
    "scriber": "Scriber — writing studio",
    "settings": "App settings",
    "tarot": "Tarot menu",
    "tarot-cards": "Tarot — card dataset",
    "tarot-spread": "Tarot — draw spread",
    "tarot-frame": "Tarot — frame",
    "zodiac": "Astrology — zodiac",
    "admin": "Admin panel"
  };

  function sectionIdFromButtonId(buttonId) {
    return String(buttonId || "").replace(/^open-/, "");
  }

  function normalizeSectionId(value) {
    return String(value || "").trim().replace(/^open-/, "").toLowerCase();
  }

  // Top-level entries that are only menu groups (they have no section of their
  // own; their content lives in subpages).
  const MENU_GROUP_IDS = new Set(["alphabet", "astronomy", "audio", "calendar", "iching", "kabbalah", "numbers", "tarot"]);

  function isMenuGroupId(value) {
    return MENU_GROUP_IDS.has(normalizeSectionId(value));
  }

  function isRequiredMenuId(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    if (REQUIRED_MENU_IDS.has(raw)) return true;
    return REQUIRED_MENU_IDS.has(`open-${raw.replace(/^open-/, "")}`);
  }

  function stripDropdownSuffix(text) {
    return String(text || "").replace(/[\s▾▼↓]+$/g, "").trim();
  }

  function datasetForId(buttonOrSectionId) {
    const normalized = normalizeSectionId(buttonOrSectionId);
    return SECTION_DATASETS[normalized] || "";
  }

  // Resolves a config id (bare section name or "open-…" button id) to an
  // actual app unit, if one exists.
  function resolveUnitById(units, id) {
    const byId = units.byId;
    const raw = String(id || "").trim();
    if (!raw) return null;
    if (byId.has(raw)) return byId.get(raw);
    const bare = raw.replace(/^open-/, "");
    if (byId.has(`open-${bare}`)) return byId.get(`open-${bare}`);
    return null;
  }

  // Canonical id for editor storage: keep real button ids as-is, bare section
  // names stay bare for custom links, unknown ids pass through for reporting.
  function resolveMenuId(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed || trimmed === "undefined") return "";
    const units = collectAllUnits();
    if (units.byId.has(trimmed)) return trimmed;
    const bare = trimmed.replace(/^open-/, "");
    if (units.byId.has(`open-${bare}`)) return `open-${bare}`;
    const section = normalizeSectionId(trimmed);
    if (SECTION_DATASETS[section]) return bare;
    return trimmed;
  }

  function displayMenuId(id) {
    const raw = String(id || "").trim();
    if (!raw) return "";
    const bare = raw.replace(/^open-/, "");
    const units = collectAllUnits();
    if (units.byId.has(raw) || units.byId.has(`open-${bare}`)) {
      return bare;
    }
    return raw;
  }

  function collectAllUnits() {
    const actions = document.getElementById("topbar-actions");
    const topLevel = [];
    const subpages = [];
    const byId = new Map();
    if (!actions) {
      return { topLevel, subpages, byId };
    }

    const addUnit = (element, id, label, isSubpage, parentDropdownEl) => {
      if (!element) return null;
      const unit = { element, id, label: stripDropdownSuffix(label), isSubpage, parentDropdownEl };
      if (id) {
        byId.set(id, unit);
      }
      (isSubpage ? subpages : topLevel).push(unit);
      return unit;
    };

    Array.from(actions.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      const isDropdown = child.classList?.contains("topbar-dropdown");
      if (isDropdown) {
        const trigger = child.querySelector("button.settings-trigger");
        const unit = addUnit(child, trigger?.id || "", (trigger?.textContent || "").trim(), false, child);
        child.querySelectorAll(".topbar-dropdown-menu button").forEach((btn) => {
          addUnit(btn, btn.id || "", (btn.textContent || "").trim(), true, unit ? child : null);
        });
        return;
      }
      if (child.tagName === "BUTTON") {
        addUnit(child, child.id || "", (child.textContent || "").trim(), false, null);
      }
    });

    return { topLevel, subpages, byId };
  }

  function findOrCreateDropdown(item) {
    const actions = document.getElementById("topbar-actions");
    const units = collectAllUnits();
    const existing = units.byId.get(String(item?.id || ""));

    // Reuse an existing dropdown wrapper when the id already points at one.
    if (existing?.element?.classList?.contains("topbar-dropdown")) {
      let menu = existing.element.querySelector(".topbar-dropdown-menu");
      if (!menu) {
        menu = document.createElement("div");
        menu.className = "topbar-dropdown-menu";
        menu.setAttribute("role", "menu");
        existing.element.appendChild(menu);
      }
      let trigger = existing.element.querySelector("button.settings-trigger");
      if (!trigger && dismantledTriggers.has(existing.id)) {
        // A previously flattened dropdown: restore its trigger inside the wrapper.
        trigger = dismantledTriggers.get(existing.id).trigger;
        existing.element.appendChild(trigger);
      }
      if (!trigger) {
        trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "settings-trigger mp-menu-trigger";
        trigger.setAttribute("aria-haspopup", "menu");
        trigger.setAttribute("aria-expanded", "false");
        existing.element.appendChild(trigger);
      }
      showUnit(existing.element);
      return { wrapper: existing.element, trigger, menu };
    }

    // Reuse an existing plain button as the trigger inside a new dropdown.
    let trigger = existing?.element || null;
    const wrapper = document.createElement("div");
    wrapper.className = "topbar-dropdown mp-custom-dropdown";
    wrapper.setAttribute("aria-label", String(item?.label || item?.id || "Menu"));
    if (!trigger) {
      trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "settings-trigger mp-menu-trigger";
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      if (item?.id) {
        trigger.dataset.section = sectionIdFromButtonId(item.id);
      }
    } else {
      trigger.classList.add("mp-menu-trigger");
    }
    wrapper.appendChild(trigger);
    const menu = document.createElement("div");
    menu.className = "topbar-dropdown-menu";
    menu.setAttribute("role", "menu");
    wrapper.appendChild(menu);
    if (actions && !wrapper.parentElement) {
      actions.appendChild(wrapper);
    }
    return { wrapper, trigger, menu };
  }

  function createSectionButton(child) {
    const section = normalizeSectionId(child?.id || child?.section || "");
    if (!section || !SECTION_DATASETS[section]) {
      return null;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-trigger topbar-sub-trigger mp-custom-link";
    button.textContent = String(child?.label || SECTION_DATASETS[section] || section);
    button.dataset.section = section;
    button.addEventListener("click", () => {
      window.TarotSectionStateUi?.setActiveSection?.(section);
    });
    return button;
  }

  function hideUnit(element) {
    if (!element) return;
    element.classList.add("mp-hidden");
    element.style.display = "none";
  }

  function showUnit(element) {
    if (!element) return;
    element.classList.remove("mp-hidden");
    element.style.display = "";
  }

  // --- Menu spacing -----------------------------------------------------------
  const SPACING_PRESETS = {
    compact: { gap: "2px" },
    normal: { gap: "" },
    roomy: { gap: "18px" }
  };

  function applyMenuSpacing(spacingValue) {
    const preset = SPACING_PRESETS[spacingValue] || SPACING_PRESETS.normal;
    document.documentElement.style.setProperty("--mp-menu-gap", preset.gap);
  }

  function applyMenuOverlay(fileName) {
    const name = String(fileName || "").trim();
    const src = name && lastHelpers?.assetUrl ? lastHelpers.assetUrl(name) : "";
    const safe = String(src || "").replace(/\\/g, "/").replace(/"/g, "");
    document.documentElement.style.setProperty("--tt-menu-overlay-image", safe ? `url("${safe}")` : "none");
  }

  function applyMenuTheme(themeValue) {
    const appLook = String(document.body?.dataset.appLook || "");
    if (appLook && appLook !== "default") return;
    const theme = MENU_THEMES.includes(themeValue) ? themeValue : "default";
    if (document.body) {
      if (theme === "default") delete document.body.dataset.menuTheme;
      else document.body.dataset.menuTheme = theme;
    }
  }

  // --- Banner logo ------------------------------------------------------------
  let logoImgEl = null;
  let logoImgUrl = "";

  function applyMenuLogo(logoFile) {
    const homeBtn = document.getElementById("open-home");
    const fileName = String(logoFile || "").trim();
    if (!homeBtn) {
      return;
    }
    if (!fileName) {
      if (logoImgEl) {
        logoImgEl.remove();
        logoImgEl = null;
        logoImgUrl = "";
      }
      return;
    }
    const src = lastHelpers?.assetUrl ? lastHelpers.assetUrl(fileName) : "";
    if (!src) {
      return;
    }
    if (!logoImgEl) {
      logoImgEl = document.createElement("img");
      logoImgEl.className = "mp-menu-logo";
      logoImgEl.alt = "";
      logoImgEl.addEventListener("error", () => {
        if (logoImgEl) {
          logoImgEl.hidden = true;
        }
      });
      homeBtn.insertBefore(logoImgEl, homeBtn.firstChild);
    }
    if (logoImgUrl !== src) {
      logoImgUrl = src;
      logoImgEl.hidden = false;
      logoImgEl.src = src;
    }
  }

  // --- Menu title ------------------------------------------------------------
  // config.menuTitle replaces the "KABBAK" banner text. Blank restores the
  // app default. Branding may render the label as a .topbar-home-text span;
  // that span is reused so branding markup survives, otherwise a managed
  // .mp-menu-title span keeps the plugin logo image and the title apart.
  let defaultMenuTitle = "";
  let appliedMenuTitle = "";
  let homeTitleObserver = null;

  function readHomeTitleText() {
    const homeBtn = document.getElementById("open-home");
    if (!homeBtn) return "";
    const labelEl = homeBtn.querySelector(".topbar-home-text, .mp-menu-title");
    return (labelEl ? labelEl.textContent : homeBtn.textContent || "").trim();
  }

  function applyMenuTitle(title) {
    const homeBtn = document.getElementById("open-home");
    if (!homeBtn) return;

    if (!defaultMenuTitle) {
      defaultMenuTitle = readHomeTitleText() || "KABBAK";
    }

    let labelEl = homeBtn.querySelector(".topbar-home-text")
      || homeBtn.querySelector(".mp-menu-title");
    if (!labelEl) {
      labelEl = document.createElement("span");
      labelEl.className = "mp-menu-title";
      Array.from(homeBtn.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.remove();
        }
      });
      homeBtn.appendChild(labelEl);
    }

    const next = String(title || "").trim() || defaultMenuTitle;
    appliedMenuTitle = next;
    if (labelEl.textContent !== next) {
      labelEl.textContent = next;
    }

    if (!homeTitleObserver) {
      homeTitleObserver = new MutationObserver(() => {
        // A branding refresh rewrote the button; restore the configured title.
        if (appliedMenuTitle && readHomeTitleText() !== appliedMenuTitle) {
          applyMenuTitle(appliedMenuTitle);
        }
      });
      homeTitleObserver.observe(homeBtn, { childList: true, characterData: true, subtree: true });
    }
  }

  const headerEls = new Map();
  const dismantledTriggers = new Map();

  function getHeaderEl(label) {
    const normalized = String(label || "").trim();
    if (!normalized) return null;
    if (!headerEls.has(normalized)) {
      const header = document.createElement("div");
      header.className = "mp-menu-header";
      header.textContent = normalized;
      header.style.cssText = [
        "font-size:10px",
        "font-weight:700",
        "letter-spacing:0.09em",
        "text-transform:uppercase",
        "color:#8b7fb8",
        "padding:var(--mp-menu-gap,8px) 8px 2px",
        "user-select:none",
        "cursor:default"
      ].join(";");
      headerEls.set(normalized, header);
    }
    return headerEls.get(normalized);
  }

  // Flattens a built-in dropdown into a plain top-level button: the trigger is
  // extracted, the wrapper and its leftover subpages are hidden. The admin can
  // re-group it later by adding children to that id in the config.
  function flattenDropdownUnit(unit) {
    const actions = document.getElementById("topbar-actions");
    const wrapper = unit.element;
    const trigger = wrapper.querySelector("button.settings-trigger");
    hideUnit(wrapper);
    wrapper.querySelectorAll(".topbar-dropdown-menu button").forEach(hideUnit);
    if (!trigger || !actions) {
      return null;
    }
    dismantledTriggers.set(unit.id, { trigger, wrapper });
    trigger.textContent = stripDropdownSuffix(trigger.textContent);
    if (!trigger.dataset.mpNavBound) {
      trigger.dataset.mpNavBound = "1";
      trigger.addEventListener("click", () => {
        const parent = trigger.closest(".topbar-dropdown");
        if (!parent || parent.style.display === "none") {
          const section = sectionIdFromButtonId(trigger.id);
          // Menu groups have no section of their own: only navigate when the
          // id points at a real section.
          if (!isMenuGroupId(section) && SECTION_DATASETS[normalizeSectionId(section)]) {
            window.TarotSectionStateUi?.setActiveSection?.(section);
          }
        }
      });
    }
    showUnit(trigger);
    actions.appendChild(trigger);
    return trigger;
  }

  function applyMenu(config) {
    const actions = document.getElementById("topbar-actions");
    if (!actions) return;
    const { topLevel, byId } = collectAllUnits();

    REQUIRED_MENU_ORDER.forEach((requiredId) => {
      if (byId.has(requiredId)) return;
      const element = document.getElementById(requiredId);
      if (!(element instanceof HTMLElement)) return;
      const unit = {
        element,
        id: requiredId,
        label: stripDropdownSuffix(element.textContent || ""),
        isSubpage: Boolean(element.closest(".topbar-dropdown-menu")),
        parentDropdownEl: element.closest(".topbar-dropdown")
      };
      byId.set(requiredId, unit);
      topLevel.push(unit);
    });

    topLevel.forEach((unit) => {
      if (unit.element.dataset.menuInitialHidden === undefined) {
        unit.element.dataset.menuInitialHidden = String(Boolean(unit.element.hidden));
      }
    });

    const items = Array.isArray(config.items) ? config.items : [];
    const handledTopLevelIds = new Set();
    const placed = [];

    function place(element) {
      if (!element || placed.includes(element)) return;
      placed.push(element);
    }

    function reveal(element) {
      if (!element) return;
      showUnit(element);
    }

    items.forEach((item) => {
      const id = String(item?.id || "").trim();

      if (item?.type === "header") {
        const header = getHeaderEl(item?.label || id);
        if (header) {
          showUnit(header);
          place(header);
        }
        return;
      }

      if (item?.type === "search" || id === SEARCH_MENU_ID) {
        const searchEl = ensureSearchBar(true, item?.label);
        if (searchEl) {
          showUnit(searchEl);
          place(searchEl);
        }
        return;
      }

      if (!id) return;
      const children = Array.isArray(item?.children) ? item.children : [];
      const resolvedUnit = resolveUnitById({ byId }, id);

      if (isMenuGroupId(id) && !children.length) {
        if (resolvedUnit?.element) hideUnit(resolvedUnit.element);
        return;
      }

      if (children.length) {
        const dropdown = findOrCreateDropdown({ ...item, id: resolvedUnit?.id || id });
        if (!dropdown) return;
        handledTopLevelIds.add(resolvedUnit?.id || id);

        const baseLabel = String(
          item?.label || stripDropdownSuffix(dropdown.trigger?.textContent || "") || ""
        ).trim();
        if (dropdown.trigger) {
          dropdown.trigger.textContent = baseLabel ? `${baseLabel} ▾` : "▾";
        }
        if (item?.enabled === false && !isRequiredMenuId(resolvedUnit?.id || id)) {
          hideUnit(dropdown.wrapper);
        } else {
          reveal(dropdown.wrapper);
        }

        const configuredChildIds = new Set();
        children.forEach((child) => {
          const childId = String(child?.id || "").trim();
          const resolvedChild = childId ? resolveUnitById({ byId }, childId) : null;
          configuredChildIds.add(resolvedChild?.id || childId);
        });
        dropdown.menu.querySelectorAll("button").forEach((btn) => {
          if (!configuredChildIds.has(btn.id)) {
            hideUnit(btn);
          }
        });

        children.forEach((child) => {
          const childId = String(child?.id || "").trim();
          if (!childId) return;
          const resolvedChild = resolveUnitById({ byId }, childId);
          let button = resolvedChild?.element || null;
          if (!button) {
            button = createSectionButton(child);
          }
          if (!button) return;
          if (child?.label) {
            button.textContent = String(child.label).trim();
          }
          if (child?.enabled === false && !isRequiredMenuId(resolvedChild?.id || childId)) {
            hideUnit(button);
          } else {
            reveal(button);
          }
          dropdown.menu.appendChild(button);
        });
        place(dropdown.wrapper);
        return;
      }

      const unit = resolvedUnit;
      if (!unit) return;
      handledTopLevelIds.add(unit.id);

      let visibleEl = unit.element;
      if (unit.element.classList?.contains("topbar-dropdown")) {
        visibleEl = flattenDropdownUnit(unit);
        if (!visibleEl) return;
      }
      if (item?.enabled === false && !isRequiredMenuId(unit.id)) {
        hideUnit(visibleEl);
      } else {
        reveal(visibleEl);
      }
      if (item?.label && visibleEl.tagName === "BUTTON") {
        visibleEl.textContent = stripDropdownSuffix(item.label);
      }
      place(visibleEl);
    });

    const showUnlisted = config.showUnlisted === true;
    topLevel.forEach((unit) => {
      if (handledTopLevelIds.has(unit.id)) return;
      if (isRequiredMenuId(unit.id)) return;
      if (showUnlisted) {
        if (isMenuGroupId(unit.id)) {
          hideUnit(unit.element);
          return;
        }
        if (unit.element.classList?.contains("topbar-dropdown")) {
          const trigger = flattenDropdownUnit(unit);
          if (!trigger) return;
          if (unit.element.dataset.menuInitialHidden === "true" || trigger.hidden) {
            hideUnit(trigger);
          } else {
            reveal(trigger);
          }
          place(trigger);
        } else if (unit.element.dataset.menuInitialHidden === "true" || unit.element.hidden) {
          hideUnit(unit.element);
          place(unit.element);
        } else {
          reveal(unit.element);
          place(unit.element);
        }
      } else {
        hideUnit(unit.element);
      }
    });

    topLevel.forEach((unit) => {
      if (handledTopLevelIds.has(unit.id)) return;
      if (!unit.element.classList?.contains("topbar-menu-plugin-api")) return;
      reveal(unit.element);
      place(unit.element);
    });

    REQUIRED_MENU_ORDER.forEach((requiredId) => {
      if (handledTopLevelIds.has(requiredId)) return;
      const requiredUnit = byId.get(requiredId);
      if (!requiredUnit) return;
      handledTopLevelIds.add(requiredId);
      reveal(requiredUnit.element);
      place(requiredUnit.element);
    });

    if (placed.length) {
      const frag = document.createDocumentFragment();
      placed.forEach((element) => frag.appendChild(element));
      actions.insertBefore(frag, actions.firstChild);
    }
    headerEls.forEach((header) => {
      if (!placed.includes(header)) hideUnit(header);
    });

    applyMenuSpacing(config.menuSpacing);
    applyMenuTheme(config.menuTheme);
    applyMenuOverlay(config.overlayBackground);
    applyMenuLogo(config.logo);
    applyMenuTitle(config.menuTitle);
    applyMenuButtonMode(config.hideMenuButton === true);

    lastConfig = config;

    const searchPlaced = placed.includes(searchWrapEl);
    const wantSearch = config.showSearch === true || searchPlaced
      || (Array.isArray(config.items) && config.items.some((item) => item?.type === "search" || String(item?.id || "") === SEARCH_MENU_ID));
    if (!searchPlaced) {
      ensureSearchBar(wantSearch);
      if (wantSearch && searchWrapEl && !placed.includes(searchWrapEl)) {
        actions.appendChild(searchWrapEl);
      }
    }
    const query = String(searchInput()?.value || "").trim();
    if (query) {
      applySearchFilter(query);
    }
  }

  // --- Menu button mode --------------------------------------------------------
  // hideMenuButton switches the app to its drawer layout: the "Menu" button is
  // hidden and the banner title (open-home) opens the navigation drawer. The
  // app's own setting is remembered and restored when the option is turned off.
  let menuButtonOriginalLayout = "";
  let menuButtonOverridden = false;

  function applyMenuButtonMode(hide) {
    if (hide) {
      if (!menuButtonOverridden) {
        menuButtonOriginalLayout = String(document.body?.dataset?.menuLayout || "");
        menuButtonOverridden = true;
      }
      if (document.body) {
        document.body.dataset.menuLayout = "drawer";
      }
    } else if (menuButtonOverridden) {
      menuButtonOverridden = false;
      if (document.body) {
        document.body.dataset.menuLayout = menuButtonOriginalLayout || "panel";
      }
    }
  }

  // --- Menu search bar ---------------------------------------------------------
  // config.showSearch renders a search box at the end of the menu bar. It
  // filters entries by label, id, section dataset, and the `keywords` fields
  // configured on items and their children. Clearing the box restores the
  // configured menu.
  let searchWrapEl = null;

  function searchInput() {
    return searchWrapEl?.querySelector("input") || null;
  }

  function buildKeywordIndex(config) {
    const index = new Map();
    const addItem = (item) => {
      if (!item || typeof item !== "object") return;
      const id = String(item?.id || "").trim();
      const resolved = id ? resolveMenuId(id) : "";
      const keywords = String(item?.keywords || "").trim();
      if (resolved && keywords) {
        index.set(resolved, keywords);
      }
    };
    (Array.isArray(config?.items) ? config.items : []).forEach((item) => {
      addItem(item);
      (Array.isArray(item?.children) ? item.children : []).forEach(addItem);
    });
    return index;
  }

  function unitSearchText(unit, keywordIndex) {
    const parts = [unit?.label || "", unit?.id || ""];
    const section = normalizeSectionId(unit?.id);
    if (SECTION_DATASETS[section]) parts.push(SECTION_DATASETS[section]);
    const keywords = unit?.id ? keywordIndex.get(unit.id) || "" : "";
    if (keywords) parts.push(keywords);
    return parts.join(" ").toLowerCase();
  }

  function applySearchFilter(query) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) {
      applyMenu(lastConfig || DEFAULT_CONFIG);
      return;
    }
    const { topLevel, byId } = collectAllUnits();
    const keywordIndex = buildKeywordIndex(lastConfig || {});

    headerEls.forEach((header) => hideUnit(header));

    topLevel.forEach((unit) => {
      if (unit.element === searchWrapEl || unit.element?.classList?.contains("mp-menu-search")) {
        return;
      }
      const isDropdown = unit.element?.classList?.contains("topbar-dropdown");
      if (!isDropdown) {
        if (unitSearchText(unit, keywordIndex).includes(normalized)) {
          showUnit(unit.element);
        } else {
          hideUnit(unit.element);
        }
        return;
      }
      const triggerMatches = unitSearchText(unit, keywordIndex).includes(normalized);
      if (triggerMatches) {
        unit.element.querySelectorAll(".topbar-dropdown-menu button").forEach(showUnit);
        showUnit(unit.element);
        return;
      }
      let anyMatch = false;
      unit.element.querySelectorAll(".topbar-dropdown-menu button").forEach((btn) => {
        const childUnit = btn.id ? byId.get(btn.id) : null;
        const text = childUnit
          ? unitSearchText(childUnit, keywordIndex)
          : `${btn.textContent || ""} ${btn.id || ""}`.toLowerCase();
        if (text.includes(normalized)) {
          showUnit(btn);
          anyMatch = true;
        } else {
          hideUnit(btn);
        }
      });
      if (anyMatch) {
        showUnit(unit.element);
      } else {
        hideUnit(unit.element);
      }
    });
  }

  function ensureSearchBar(show, placeholder) {
    const actions = document.getElementById("topbar-actions");
    if (!actions) return null;
    if (!show) {
      if (searchWrapEl) searchWrapEl.remove();
      return null;
    }
    if (!searchWrapEl) {
      searchWrapEl = document.createElement("div");
      searchWrapEl.id = SEARCH_MENU_ID;
      searchWrapEl.className = "mp-menu-search";
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "Search menu…";
      input.setAttribute("aria-label", "Search menu items");
      input.addEventListener("input", () => {
        applySearchFilter(input.value);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          input.value = "";
          applySearchFilter("");
          input.blur();
        }
      });
      searchWrapEl.appendChild(input);
    }
    const input = searchWrapEl.querySelector("input");
    const nextPlaceholder = String(placeholder || "").trim() || "Search menu…";
    if (input && input.placeholder !== nextPlaceholder) {
      input.placeholder = nextPlaceholder;
    }
    return searchWrapEl;
  }

  // --- Link report (for the menu editor) -------------------------------------

  function collectConfigIds(config) {
    const ids = new Set();
    (Array.isArray(config?.items) ? config.items : []).forEach((item) => {
      const id = String(item?.id || "").trim();
      if (id && id !== "undefined") ids.add(id);
      (Array.isArray(item?.children) ? item.children : []).forEach((child) => {
        const childId = String(child?.id || "").trim();
        if (childId && childId !== "undefined") ids.add(childId);
      });
    });
    return ids;
  }

  function getLinkReport(config) {
    const { topLevel, byId } = collectAllUnits();
    const configuredIds = collectConfigIds(config || {});

    // Anything the app offers but the menu doesn't include. Only top-level
    // entries are reported: subpages only exist when an admin groups them.
    const missing = [];
    topLevel.forEach((unit) => {
      if (!unit.id) return;
      if (isMenuGroupId(unit.id)) return;
      const matches = configuredIds.has(unit.id) || configuredIds.has(displayMenuId(unit.id));
      if (!matches) {
        missing.push({
          id: unit.id,
          displayId: displayMenuId(unit.id),
          label: unit.label || unit.id,
          isSubpage: unit.isSubpage,
          dataset: datasetForId(unit.id)
        });
      }
    });

    // Anything the config references that doesn't exist in the app.
    const broken = [];
    configuredIds.forEach((id) => {
      if (resolveUnitById({ byId }, id)) return;
      const section = normalizeSectionId(id);
      if (SECTION_DATASETS[section]) return; // valid custom section link
      broken.push({ id: displayMenuId(id) });
    });

    return { missing, broken };
  }

  async function loadAndApply(helpers) {
    let config = DEFAULT_CONFIG;
    try {
      const url = helpers?.assetUrl("config.json");
      if (url) {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) {
          const loaded = await response.json();
          if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
            config = { ...DEFAULT_CONFIG, ...loaded };
          }
        }
      }
    } catch (_error) {
      // Keep defaults if config is unavailable.
    }
    applyMenu(config);
  }

  document.addEventListener("taro-plugins-ready", () => {
    if (lastHelpers) applyMenu(lastConfig || DEFAULT_CONFIG);
  });

  document.addEventListener("taro-plugin-config-updated", (event) => {
    if (String(event?.detail?.pluginName || "") === "menu-plugin" && lastHelpers) {
      void loadAndApply(lastHelpers);
    }
  });

  // Delegated open/close for custom dropdowns the plugin creates.
  document.addEventListener("click", (event) => {
    const trigger = event.target?.closest?.(".mp-menu-trigger");
    if (!trigger) {
      document.querySelectorAll(".mp-custom-dropdown.is-open").forEach((dropdown) => {
        dropdown.classList.remove("is-open");
        dropdown.querySelector("button")?.setAttribute("aria-expanded", "false");
      });
      return;
    }
    const dropdown = trigger.closest(".mp-custom-dropdown");
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains("is-open");
    document.querySelectorAll(".mp-custom-dropdown.is-open").forEach((entry) => {
      entry.classList.remove("is-open");
      entry.querySelector("button")?.setAttribute("aria-expanded", "false");
    });
    if (!isOpen) {
      dropdown.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      event.stopPropagation();
    }
  });

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[menu-plugin] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "menu-plugin",
    name: "Menu Order",
    version: "1.8.0",
    mount(containerEl, helpers) {
      lastHelpers = helpers;
      containerEl.style.display = "none"; // no visible widget; it manages the nav itself
      void loadAndApply(helpers);
      return null;
    }
  });

  window.TaroTimeMenuPlugin = {
    getTopbarUnits: () => collectAllUnits().topLevel,
    getAllUnits: collectAllUnits,
    getSectionDatasets: () => ({ ...SECTION_DATASETS }),
    getLinkReport,
    resolveMenuId,
    displayMenuId,
    isMenuGroupId,
    isRequiredMenuId,
    getMenuThemes: () => MENU_THEMES.slice(),
    stripDropdownSuffix,
    getConfig: () => lastConfig
  };
})();
