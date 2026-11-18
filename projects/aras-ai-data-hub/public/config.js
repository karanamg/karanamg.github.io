// Where the Integrasi Connect gateway lives.
//  - Served by the gateway itself (local `npm start` or the Railway copy): same origin, leave ''.
//  - Served from GitHub Pages: call the Railway-hosted gateway, which holds the Boomi credentials as secrets.
(() => {
  const RAILWAY_GATEWAY = 'https://integrasi-connect.up.railway.app';
  window.AIH_GATEWAY = location.hostname.endsWith('github.io') ? RAILWAY_GATEWAY : '';
  window.AIH_STATIC_ONLY = location.hostname.endsWith('github.io') && !RAILWAY_GATEWAY;
})();
