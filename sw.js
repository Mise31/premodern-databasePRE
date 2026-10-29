/* Service Worker per Premodern MTG Database (PWA).
   Strategia:
   - App shell (html, json, icone): network-first, cosi' online si vede sempre
     l'ultima versione e offline si usa la copia salvata.
   - Immagini carte da Scryfall (cards.scryfall.io): stale-while-revalidate,
     cosi' una volta viste restano disponibili anche offline.
   Con il network-first non serve piu' alzare CACHE_VERSION a ogni modifica;
   alzala solo se cambi l'elenco CORE_ASSETS o la logica di questo file. */

const CACHE_VERSION = 'premodern-v6';
const CORE_CACHE = CACHE_VERSION + '-core';
const IMG_CACHE = CACHE_VERSION + '-img';

const CORE_ASSETS = [
  './',
  './index.html',
  './premodern_cards.json',
  './premodern_stampe.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API di Scryfall (prezzi): sempre dalla rete, mai in cache, cosi' i prezzi sono attuali.
  if (url.hostname === 'api.scryfall.com') return;

  // Immagini delle carte da Scryfall: stale-while-revalidate.
  if (url.hostname.endsWith('scryfall.io') || url.hostname.endsWith('scryfall.com')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // App shell e tutto il resto della stessa origine: network-first.
  // Online si prende sempre la versione aggiornata (e si salva in cache);
  // offline si usa la copia salvata.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CORE_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true }).then((cached) =>
          cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
    );
  }
});
