// ╔══════════════════════════════════════════════════════╗
// ║  BITE. POS — Service Worker                         ║
// ║  Upload to bite.pay4.space/sw.js                    ║
// ╚══════════════════════════════════════════════════════╝

const CACHE = 'bite-pos-v2';

// Files to cache for offline shell
const SHELL = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
];

// Install: cache shell assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Supabase API calls → always network (never cache live data)
// - Everything else → cache first, fallback to network
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Always go to network for Supabase API
  if (url.includes('.supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for app shell and static assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('/') || caches.match('/index.html');
        }
      });
    })
  );
});
