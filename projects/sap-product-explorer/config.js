// Where the Explorer's Boomi gateway lives.
//  - Served by the gateway itself (Railway service or local `npm start`): same origin, leave ''.
//  - Served from GitHub Pages: call the Railway-hosted gateway (set its URL below once deployed).
(() => {
  const RAILWAY_GATEWAY = ''; // e.g. 'https://sap-product-explorer.up.railway.app'
  window.PORTAL_CONFIG = { apiBase: location.hostname.endsWith('github.io') ? RAILWAY_GATEWAY : '' };
})();
