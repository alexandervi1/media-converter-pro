/**
 * Service Worker de Media Converter Pro.
 *
 * Estrategia:
 *  - App shell (HTML/CSS/JS/iconos/fuentes): cache-first con revalidación
 *    en background, para que la app abra instantáneo y funcione offline
 *    en lo básico (la API siempre requiere red).
 *  - /api/* y SSE: siempre red (network-only).
 */

const CACHE_NAME = 'mcp-shell-v8';

const SHELL_ASSETS = [
    '/',
    '/css/styles.css',
    '/js/bundle.js',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/favicon.ico'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API y streams: nunca cachear
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    if (event.request.method !== 'GET') {
        return;
    }

    // App shell: cache-first + revalidación
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request)
                .then((response) => {
                    if (response.ok && url.origin === self.location.origin) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || network;
        })
    );
});
