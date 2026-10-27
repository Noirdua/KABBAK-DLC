/* journal.js — DLC plugin: personal journal (diary) page. */
(function () {
  "use strict";

  const PROFILE_SCRIPT = "app/ui-profile.js?v=20261027-shared-editor";

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
      if (activeSection(helpers) !== "journal") {
        return;
      }
      if (!ui || typeof ui.showJournalPage !== "function") {
        showMessage(root, "Journal could not start — the profile module did not load.");
        return;
      }
      ui.showJournalPage(root, helpers, {
        mode: "diary",
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
      if (String(event?.detail?.activeSection || "") === "journal") {
        void start();
      } else {
        stop();
      }
    };
    document.addEventListener("section:changed", onSection);
    if (activeSection(helpers) === "journal") {
      void start();
    }

    return () => {
      document.removeEventListener("section:changed", onSection);
      stop();
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
    version: "1.4.1",
    section: { id: "journal", label: "Journal" },
    mount
  });
})();
