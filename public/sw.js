const BUILD_ID = new URL(self.location.href).searchParams.get('v') ?? 'local';
const CACHE_NAME = `doc-diff-pro-${BUILD_ID}`;
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

  await cache.put(APP_SHELL_URL, response);

  const assetManifestUrl = new URL('asset-manifest.json', APP_SHELL_URL).href;
  const assetManifestResponse = await fetch(assetManifestUrl, { cache: 'reload' });
  if (!assetManifestResponse.ok) {
    throw new Error(`Could not cache asset manifest: ${assetManifestResponse.status}`);
  }

  const assetPaths = await assetManifestResponse.clone().json();
  if (!Array.isArray(assetPaths)) throw new Error('Invalid asset manifest');
  await cache.put(assetManifestUrl, assetManifestResponse);

  const urls = [
    'manifest.webmanifest',
    'favicon.svg',
    'samples/baseline.docx',
    'samples/revised.docx',
    ...assetPaths.filter((path) => typeof path === 'string')
  ].map((path) => new URL(path, APP_SHELL_URL).href);

  await Promise.all(urls.map(async (url) => {
    const asset = await fetch(url, { cache: 'reload' });
    if (!asset.ok) throw new Error(`Could not cache asset: ${url}`);
    await cache.put(url, asset);
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
