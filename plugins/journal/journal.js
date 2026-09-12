/* journal.js — DLC plugin: personal journal page. */
(function () {
  "use strict";

  const PROFILE_SCRIPT = "app/ui-profile.js?v=20260912-dream-symbols";

  function showMessage(root, message) {
    root.replaceChildren();
    const box = document.createElement("div");
    box.className = "journal-message";
    box.textContent = message;
    root.appendChild(box);
  }

  async function ensureProfileUi() {
    if (window.ProfileUi && typeof window.ProfileUi.mountJournal === "function") {
      return window.ProfileUi;
    }
    try {
      await window.TarotLazySections?.loadScript?.(PROFILE_SCRIPT);
    } catch (_error) {}
    return window.ProfileUi || null;
  }

  function renderLanding(root, onPick) {
    root.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "journal-landing";
    [
      { id: "diary", label: "Diary" },
      { id: "note", label: "Note" }
    ].forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "journal-landing-btn";
      button.textContent = choice.label;
      button.addEventListener("click", () => onPick(choice.id));
      wrap.appendChild(button);
    });
    root.appendChild(wrap);
  }

  function mount(root, helpers) {
    let unmountJournal = null;

    function showLanding() {
      if (typeof unmountJournal === "function") {
        unmountJournal();
      }
      unmountJournal = null;
      renderLanding(root, showMode);
    }

    async function showMode(mode) {
      root.replaceChildren();
      const ui = await ensureProfileUi();
      if (!ui || typeof ui.mountJournal !== "function") {
        showMessage(root, "Journal could not start — the profile module did not load.");
        return;
      }
      unmountJournal = ui.mountJournal(root, helpers, { mode, onBack: showLanding }) || null;
    }

    const onSection = (event) => {
      if (String(event?.detail?.activeSection || "") === "journal" && !unmountJournal && !root.querySelector(".journal-landing")) {
        showLanding();
      }
    };
    document.addEventListener("section:changed", onSection);
    if (String(helpers?.ui?.getActiveSection?.() || "") === "journal") {
      showLanding();
    }

    return () => {
      document.removeEventListener("section:changed", onSection);
      if (typeof unmountJournal === "function") {
        unmountJournal();
      }
      unmountJournal = null;
    };
  }

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[journal] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "journal",
    name: "Journal",
    kind: "gui",
    version: "1.1.0",
    section: { id: "journal", label: "Journal" },
    mount
  });
})();
