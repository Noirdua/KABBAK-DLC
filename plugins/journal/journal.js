/* journal.js — DLC plugin: personal journal page.
 * The notebook UI (entries, scenes, quick notes, PDF export) is provided by
 * the app's profile module; this plugin mounts it as its own top-level page.
 */
(function () {
  "use strict";

  const PROFILE_SCRIPT = "app/ui-profile.js?v=20260911-journal-overlay";

  function showMessage(root, message) {
    root.innerHTML = "";
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
    } catch (_error) {
      // Fall through to the availability check below.
    }
    return window.ProfileUi || null;
  }

  function mount(root, helpers) {
    let unmountJournal = null;
    let activating = false;

    async function activate() {
      if (unmountJournal || activating) return;
      activating = true;
      const ui = await ensureProfileUi();
      activating = false;
      if (!ui || typeof ui.mountJournal !== "function") {
        showMessage(root, "Journal could not start — the profile module did not load.");
        return;
      }
      unmountJournal = ui.mountJournal(root, helpers) || null;
    }

    const onSection = (event) => {
      if (String(event?.detail?.activeSection || "") === "journal") {
        void activate();
      }
    };
    document.addEventListener("section:changed", onSection);
    if (String(helpers?.ui?.getActiveSection?.() || "") === "journal") {
      void activate();
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
    version: "1.0.0",
    section: { id: "journal", label: "Journal" },
    mount
  });
})();
