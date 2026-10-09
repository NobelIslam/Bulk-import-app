// Served at /apps/forms/embed.js through the App Proxy, so the "form code"
// snippet works anywhere in a theme without the app block or app embed.
// It is the same runtime the theme app extension ships.
import runtime from "../../extensions/tcl-forms/assets/tcl-forms-runtime.js?raw";

export const loader = () =>
  new Response(runtime, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
