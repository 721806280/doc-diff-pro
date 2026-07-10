const CACHE_NAME = 'doc-diff-pro-v1';
const APP_SHELL_URL = new URL('./', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name.startsWith('doc-diff-pro-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(request.mode === 'navigate'
    ? networkFirst(request)
    : cacheFirst(request));
});

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(APP_SHELL_URL, { cache: 'reload' });
  if (!response.ok) throw new Error(`Could not cache app shell: ${response.status}`);

  const html = await response.clone().text();
  await cache.put(APP_SHELL_URL, response);

  const urls = new Set([
    new URL('manifest.webmanifest', APP_SHELL_URL).href,
    new URL('favicon.svg', APP_SHELL_URL).href
  ]);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const assetUrl = new URL(match[1], APP_SHELL_URL);
    if (assetUrl.origin === self.location.origin) urls.add(assetUrl.href);
  }

  await Promise.allSettled(Array.from(urls, async (url) => {
    const asset = await fetch(url, { cache: 'reload' });
    if (asset.ok) await cache.put(url, asset);
  }));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(APP_SHELL_URL, response.clone());
    return response;
  } catch {
    return (await cache.match(APP_SHELL_URL)) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
