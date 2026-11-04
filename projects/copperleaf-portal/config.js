// Where the portal's Boomi gateway lives.
//  - Served by the gateway itself (local `npm start` or the Railway-hosted copy): same origin, leave ''.
//  - Served from GitHub Pages: call the Railway-hosted gateway, which holds the Boomi credentials as secrets.
(() => {
  const RAILWAY_GATEWAY = ''; // e.g. 'https://copperleaf-portal-production.up.railway.app'
  window.PORTAL_CONFIG = { apiBase: location.hostname.endsWith('github.io') ? RAILWAY_GATEWAY : '' };
})();
