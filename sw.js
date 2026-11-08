// Service worker : permet d'installer le site comme une application et de le consulter hors ligne.
// Stratégie « réseau d'abord » : on prend toujours la version en ligne (donc les prix et le code à jour),
// et on garde une copie pour les moments sans connexion. Les widgets TradingView et les appels d'IA
// ne sont jamais mis en cache.
const CACHE = 'mg-v1';
const ESSENTIEL = ['./', 'index.html', 'css/style.css', 'data.js', 'app.js', 'js/main.js', 'manifest.webmanifest', 'icone-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENTIEL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const memeSite = url.origin === self.location.origin;
  const chartjs = url.hostname === 'cdn.jsdelivr.net';
  if (!memeSite && !chartjs) return; // TradingView, Google Fonts, Gemini : le navigateur s'en occupe
  e.respondWith((async () => {
    try {
      // Même site : on revalide auprès du serveur (évite de mélanger d'anciens et de nouveaux fichiers).
      const rep = memeSite ? await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : await fetch(req);
      if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); }
      return rep;
    } catch {
      const enCache = await caches.match(req, { ignoreSearch: url.pathname.endsWith('prix.json') || url.pathname.endsWith('evenements.json') });
      if (enCache) return enCache;
      if (req.mode === 'navigate') return caches.match('index.html');
      throw new Error('Hors ligne');
    }
  })());
});
