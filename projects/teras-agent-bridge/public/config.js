// Where the Teras Connect gateway lives.
//  - Served by the gateway itself (laptop `npm start` or the Railway copy): same origin, leave ''.
//  - Served from GitHub Pages: call the Railway-hosted gateway, which holds the Boomi credentials as secrets.
//  The on-prem runtime sits behind the firewall, so public copies start on the Boomi cloud runtime.
(() => {
  const RAILWAY_GATEWAY = 'https://teras-agent-bridge.up.railway.app';
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  window.TERAS_GATEWAY = location.hostname.endsWith('github.io') ? RAILWAY_GATEWAY : '';
  if (!local) window.TERAS_DEFAULT_RT = 'cloud';
})();
