const LEGACY_CACHE_PREFIX = 'doc-diff-pro-';

export async function removeLegacyPwaState(baseUrl: string): Promise<void> {
  const appScope = new URL(baseUrl, window.location.href).href;
  const registrations = 'serviceWorker' in navigator
    ? await navigator.serviceWorker.getRegistrations()
    : [];
  const cacheNames = 'caches' in window ? await caches.keys() : [];

  await Promise.all([
    ...registrations
      .filter((registration) => registration.scope === appScope)
      .map((registration) => registration.unregister()),
    ...cacheNames
      .filter((name) => name.startsWith(LEGACY_CACHE_PREFIX))
      .map((name) => caches.delete(name))
  ]);
}
