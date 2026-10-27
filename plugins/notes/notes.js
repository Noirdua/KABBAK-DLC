/* notes.js — DLC plugin: quick notes page. */
(function () {
  "use strict";

  const PROFILE_SCRIPT = "app/ui-profile.js?v=20261027-enochian-persist";

  function showMessage(root, message) {
    root.replaceChildren();
    const box = document.createElement("div");
    box.className = "journal-message";
    box.textContent = message;
    root.appendChild(box);
  }

  async function ensureProfileUi() {
    if (window.ProfileUi && typeof window.ProfileUi.showJournalPage === "function") {
      return window.ProfileUi;
    }
    try {
      await window.TarotLazySections?.loadScript?.(PROFILE_SCRIPT);
    } catch (_error) {}
    return window.ProfileUi || null;
  }

  function activeSection(helpers) {
    return String(
      helpers?.ui?.getActiveSection?.()
      || window.TarotSectionStateUi?.getActiveSection?.()
      || ""
    );
  }

  function goBack(helpers) {
    if (typeof helpers?.ui?.goBack === "function") {
      helpers.ui.goBack();
      return;
    }
    if (typeof window.TarotSectionStateUi?.goBack === "function") {
      window.TarotSectionStateUi.goBack();
      return;
    }
    window.TarotSectionStateUi?.setActiveSection?.("home");
  }

  function mount(root, helpers) {
    let starting = false;
    let mounted = false;

    async function start() {
      if (starting || mounted) {
        return;
      }
      starting = true;
      root.replaceChildren();
      const ui = await ensureProfileUi();
      starting = false;
      if (activeSection(helpers) !== "notes") {
        return;
      }
      if (!ui || typeof ui.showJournalPage !== "function") {
        showMessage(root, "Notes could not start — the profile module did not load.");
        return;
      }
      ui.showJournalPage(root, helpers, {
        mode: "note",
        onBack: () => goBack(helpers)
      });
      mounted = true;
    }

    function stop() {
      if (typeof window.ProfileUi?.releaseJournalPage === "function") {
        window.ProfileUi.releaseJournalPage(root);
      }
      mounted = false;
      root.replaceChildren();
    }

    const onSection = (event) => {
      if (String(event?.detail?.activeSection || "") === "notes") {
        void start();
      } else {
        stop();
      }
    };
    document.addEventListener("section:changed", onSection);
    if (activeSection(helpers) === "notes") {
      void start();
    }

    return () => {
      document.removeEventListener("section:changed", onSection);
      stop();
    };
  }

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[notes] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "notes",
    name: "Notes",
    kind: "gui",
    version: "1.0.2",
    section: { id: "notes", label: "Notes" },
    mount
  });
})();
