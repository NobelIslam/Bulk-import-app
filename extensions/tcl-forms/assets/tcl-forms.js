// Tiny loader referenced by the app block and app embed. The full runtime sits
// next to it on Shopify's CDN (tcl-forms-runtime.js) and is fetched once, so the
// block stays well under Shopify's app block JavaScript size budget.
(function () {
  "use strict";
  if (window.__tclForms) {
    window.__tclForms.init();
    return;
  }
  if (window.__tclFormsLoading) return;
  window.__tclFormsLoading = true;

  var current = document.currentScript;
  var src = current && current.src && /tcl-forms\.js/.test(current.src)
    ? current.src.replace(/tcl-forms\.js/, "tcl-forms-runtime.js")
    : "/apps/forms/embed.js";

  var script = document.createElement("script");
  script.src = src;
  script.async = true;
  document.head.appendChild(script);
})();
