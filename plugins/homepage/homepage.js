/* homepage.js — DLC plugin: admin-curated homepage.
 * Fetches this plugin's index.html and injects it into the app's home welcome
 * container, replacing the built-in welcome content.
 */
(function () {
  "use strict";

  const HOMEPAGE_FILE = "index.html";

  // The built-in welcome is hidden by default so it never flashes while this
  // plugin loads. Show it again when the plugin page is unavailable.
  function showBuiltinWelcome(container) {
    const fallback = container.querySelector("#home-welcome-default");
    if (fallback) {
      fallback.hidden = false;
    }
  }

  async function applyHomepage(helpers) {
    const container = document.getElementById("home-welcome");
    if (!container) {
      return;
    }
    try {
      const url = helpers?.assetUrl(HOMEPAGE_FILE);
      if (!url) {
        showBuiltinWelcome(container);
        return;
      }
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        showBuiltinWelcome(container);
        return;
      }
      const html = await response.text();
      if (!String(html || "").trim()) {
        showBuiltinWelcome(container);
        return;
      }
      container.innerHTML = html;
    } catch (_error) {
      // Keep the built-in welcome content when the plugin page is unavailable.
      showBuiltinWelcome(container);
    }
  }

  const onContentUpdated = (event) => {
    if (String(event?.detail?.pluginName || "") === "homepage") {
      void applyHomepage(window.homepageHelpers);
    }
  };

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[homepage] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "homepage",
    name: "Homepage",
    version: "1.0.0",
    mount(containerEl, helpers) {
      window.homepageHelpers = helpers;
      containerEl.style.display = "none"; // replaces home content, not a topbar widget
      void applyHomepage(helpers);
      document.addEventListener("taro-plugin-content-updated", onContentUpdated);
      return () => {
        document.removeEventListener("taro-plugin-content-updated", onContentUpdated);
      };
    }
  });
})();
