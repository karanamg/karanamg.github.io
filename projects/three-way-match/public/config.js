// Where the 3-way match gateway lives.
//  - Served by the gateway itself (local `npm start` or the Railway-hosted copy): same origin, leave ''.
//  - Served from GitHub Pages: call the Railway-hosted gateway, which holds the Boomi credentials as secrets.
(() => {
  const RAILWAY_GATEWAY = '';   // e.g. 'https://three-way-match.up.railway.app' once the Railway service exists
  window.THREEWAY_GATEWAY = location.hostname.endsWith('github.io') ? RAILWAY_GATEWAY : '';
  window.THREEWAY_STATIC_ONLY = location.hostname.endsWith('github.io') && !RAILWAY_GATEWAY;
})();
