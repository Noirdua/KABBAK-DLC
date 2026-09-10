/* layout-default.js — official default layout skin.
 * Leaves the built-in top bar and pages in place so it can be selected
 * alongside other UI overhauls.
 */
(function () {
  "use strict";

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[layout-default] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "layout-default",
    name: "Default Layout",
    version: "1.0.0",
    role: "skin",
    preserveChrome: true,
    mount(_shellEl, helpers) {
      helpers?.ui?.showDefaultChrome?.();
      return null;
    }
  });
})();
