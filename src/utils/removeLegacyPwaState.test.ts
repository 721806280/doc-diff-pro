import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeLegacyPwaState } from './removeLegacyPwaState';

describe('removeLegacyPwaState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes only this app service worker and legacy caches', async () => {
    const unregisterApp = vi.fn().mockResolvedValue(true);
    const unregisterOther = vi.fn().mockResolvedValue(true);
    const deleteCache = vi.fn().mockResolvedValue(true);

    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([
          { scope: 'http://localhost:3000/doc-diff-pro/', unregister: unregisterApp },
          { scope: 'http://localhost:3000/other-app/', unregister: unregisterOther }
        ])
      }
    });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['doc-diff-pro-old', 'other-app-cache']),
      delete: deleteCache
    });

    await removeLegacyPwaState('/doc-diff-pro/');

    expect(unregisterApp).toHaveBeenCalledOnce();
    expect(unregisterOther).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith('doc-diff-pro-old');
  });
});
