import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

export function createRenderRegistry() {
  const mounts: Array<{ host: HTMLDivElement; root: Root }> = [];

  return {
    render(node: ReactNode) {
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      act(() => root.render(node));
      mounts.push({ host, root });
      return {
        host,
        rerender(nextNode: ReactNode) {
          act(() => root.render(nextNode));
        }
      };
    },
    cleanup() {
      for (const mount of mounts.splice(0)) {
        act(() => mount.root.unmount());
        mount.host.remove();
      }
    }
  };
}
