/* layout-dock.js — example UI overhaul plugin.
 * Replaces the top bar with a left dock + bottom HUD. Existing app pages
 * keep working; helpers.ui moves them into the new content pane.
 */
(function () {
  "use strict";

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[layout-dock] TaroTimePluginHost is not available.");
    return;
  }

  const SECTION_BUTTON_ALIASES = {
    home: ["open-home-menu", "open-home"],
    tarot: ["open-tarot-cards"],
    calendar: ["open-calendar-months"],
    iching: ["open-iching-hexagrams"],
    kabbalah: ["open-kabbalah-sephirot"],
    numbers: ["open-numbers-browse"],
    timeline: ["open-calendar-timeline"]
  };

  function idsForSection(section) {
    const id = String(section || "");
    return SECTION_BUTTON_ALIASES[id] || [`open-${id}`];
  }

  function isActiveId(id, section) {
    return idsForSection(section).includes(id) || id === `open-${section}`;
  }

  host.register({
    id: "layout-dock",
    name: "Dock Layout",
      version: "1.0.2",
    role: "skin",
    mount(shellEl, helpers) {
      const ui = helpers.ui;
      if (!ui) {
        console.warn("[layout-dock] helpers.ui is not available.");
        return null;
      }

      ui.hideDefaultChrome();
      shellEl.innerHTML = `
        <div class="layout-dock">
          <nav class="layout-dock-nav" aria-label="App sections">
            <div class="layout-dock-brand">KABBAK</div>
            <div class="layout-dock-menu"></div>
          </nav>
          <div class="layout-dock-pages"></div>
          <footer class="layout-dock-hud">
            <button class="layout-dock-back" type="button">Back</button>
            <button class="layout-dock-home" type="button">Home</button>
            <div class="layout-dock-status"></div>
            <div class="layout-dock-widgets"></div>
          </footer>
        </div>
      `;

      const navEl = shellEl.querySelector(".layout-dock-nav");
      const menuEl = shellEl.querySelector(".layout-dock-menu");
      const pagesEl = shellEl.querySelector(".layout-dock-pages");
      const widgetsEl = shellEl.querySelector(".layout-dock-widgets");
      const statusEl = shellEl.querySelector(".layout-dock-status");
      const backEl = shellEl.querySelector(".layout-dock-back");
      const homeEl = shellEl.querySelector(".layout-dock-home");

      ui.attachPages(pagesEl);
      ui.attachWidgets(widgetsEl);

      function ensureDockSearch(item) {
        let wrap = navEl.querySelector(".layout-dock-search");
        if (!item) {
          if (wrap) wrap.hidden = true;
          return;
        }
        if (!wrap) {
          wrap = document.createElement("label");
          wrap.className = "layout-dock-search";
          const input = document.createElement("input");
          input.type = "search";
          input.addEventListener("input", () => {
            window.TaroTimeMenuPlugin?.applySearchFilter?.(input.value);
          });
          wrap.appendChild(input);
          navEl.insertBefore(wrap, menuEl);
        }
        wrap.hidden = false;
        const input = wrap.querySelector("input");
        if (input && document.activeElement !== input) {
          input.placeholder = item.label || "Search menu…";
        }
      }

      function renderNav() {
        const active = ui.getActiveSection();
        const items = ui.listNav().filter((item) => !item.hidden);
        ensureDockSearch(items.find((item) => item.type === "search") || null);
        menuEl.innerHTML = "";
        items.forEach((item) => {
          if (item.type === "search") return;
          if (item.type === "header") {
            const heading = document.createElement("div");
            heading.className = "layout-dock-heading";
            heading.textContent = item.label || "";
            menuEl.appendChild(heading);
            return;
          }
          const children = (item.children || []).filter((child) => !child.hidden && child.type !== "search");
          if (!children.length) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "layout-dock-item";
            button.textContent = item.label;
            button.classList.toggle("is-active", isActiveId(item.id, active));
            button.addEventListener("click", () => ui.openNav(item.id));
            menuEl.appendChild(button);
            return;
          }
          const group = document.createElement("div");
          group.className = "layout-dock-group";
          const childActive = children.some((child) => isActiveId(child.id, active));
          group.classList.add("is-open");
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "layout-dock-group-toggle";
          toggle.textContent = item.label;
          toggle.classList.toggle("is-active", childActive);
          toggle.addEventListener("click", () => {
            group.classList.toggle("is-open");
          });
          const childWrap = document.createElement("div");
          childWrap.className = "layout-dock-children";
          children.forEach((child) => {
            const leaf = document.createElement("button");
            leaf.type = "button";
            leaf.className = "layout-dock-leaf";
            leaf.textContent = child.label;
            leaf.classList.toggle("is-active", isActiveId(child.id, active));
            leaf.addEventListener("click", () => ui.openNav(child.id));
            childWrap.appendChild(leaf);
          });
          group.appendChild(toggle);
          group.appendChild(childWrap);
          menuEl.appendChild(group);
        });
        statusEl.textContent = ui.sectionLabel(active) || active;
      }

      backEl.addEventListener("click", () => ui.goBack());
      homeEl.addEventListener("click", () => ui.openNav("open-home-menu"));
      renderNav();
      const stop = ui.onSectionChange(renderNav);
      document.addEventListener("taro-plugins-ready", renderNav);
      document.addEventListener("taro-menu-updated", renderNav);
      return () => {
        document.removeEventListener("taro-plugins-ready", renderNav);
        document.removeEventListener("taro-menu-updated", renderNav);
        if (typeof stop === "function") stop();
      };
    }
  });
})();
