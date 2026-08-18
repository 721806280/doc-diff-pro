/**
 * External integration API installed on `window.DocDiffPro` when the app runs
 * in `external` (or `both`) document-input mode.
 *
 * v2 adds:
 * - a `ready` flag plus a `doc-diff-pro:ready` window event so integrators no
 *   longer need to poll for `window.DocDiffPro`;
 * - `on(event, handler)` to subscribe to lifecycle/comparison events;
 * - `getState()` to query the current app state;
 * - an optional `meta` payload on `loadDocuments` for business correlation.
 *
 * The API is intended for same-page or same-origin iframe embedding.
 * Cross-origin embedding requires an integrator-owned `postMessage` adapter
 * with explicit origin validation; this module deliberately does not open an
 * unrestricted message listener.
 */

import type { DiffSummary } from '@/types/diff';

export type ExternalDocumentMeta = {
  /** Integrator business identifier, echoed back in events for correlation. */
  bizId?: string;
  /** Free-form source label for the documents (e.g. "contract-ms"). */
  source?: string;
};

export type ExternalDocumentSet = {
  baseline?: File;
  revised?: File;
  meta?: ExternalDocumentMeta;
};

export type DocDiffProState = {
  ready: boolean;
  comparing: boolean;
  hasDocuments: boolean;
  hasResult: boolean;
  error: string;
};

export type DocDiffProEventMap = {
  ready: Record<string, never>;
  result: { summary: DiffSummary; meta?: ExternalDocumentMeta };
  error: { message: string; meta?: ExternalDocumentMeta };
  cleared: { meta?: ExternalDocumentMeta };
};

export type DocDiffProEventName = keyof DocDiffProEventMap;

export type DocDiffProApi = {
  /** True once the app has mounted and the API is callable. */
  readonly ready: boolean;
  /**
   * Load one or both documents. Either side may be omitted to update only the
   * supplied side without blocking on the other.
   */
  loadDocuments(documents: ExternalDocumentSet): Promise<{ sequence: number }>;
  /** Subscribe to a lifecycle/comparison event. Returns an unsubscribe function. */
  on<E extends DocDiffProEventName>(event: E, handler: (payload: DocDiffProEventMap[E]) => void): () => void;
  /** Query the current app state. */
  getState(): DocDiffProState;
};

type Emit = <E extends DocDiffProEventName>(event: E, payload: DocDiffProEventMap[E]) => void;

export type ExternalDocumentApiHost = {
  /** Installs `window.DocDiffPro`; returns a cleanup that removes it. */
  install: () => () => void;
  /** Emits an event to subscribers (no-op when API is not installed). */
  emit: Emit;
};

/**
 * Creates the external API host. `loadDocuments` performs the actual file
 * adoption (owned by `useDocumentSession`); `getState` reads live app state
 * (owned by `App` via a ref).
 */
export function createExternalDocumentApi(
  loadDocuments: (documents: ExternalDocumentSet) => Promise<void>,
  getState: () => DocDiffProState
): ExternalDocumentApiHost {
  const listeners = new Map<DocDiffProEventName, Set<(payload: unknown) => void>>();
  let sequenceCounter = 0;
  let installed = false;
  let readyFired = false;

  const emit: Emit = (event, payload) => {
    if (!installed) return;
    const set = listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch {
        // An integrator handler throwing must not break the app.
      }
    }
  };

  const api: DocDiffProApi = {
    get ready() {
      return readyFired;
    },
    loadDocuments: async (documents) => {
      const sequence = ++sequenceCounter;
      await loadDocuments(documents);
      return { sequence };
    },
    on: (event, handler) => {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler as (payload: unknown) => void);
      return () => {
        set?.delete(handler as (payload: unknown) => void);
      };
    },
    getState
  };

  const fireReady = () => {
    if (readyFired || !installed) return;
    readyFired = true;
    emit('ready', {});
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('doc-diff-pro:ready'));
    }
  };

  const install = () => {
    if (typeof window === 'undefined') return () => undefined;
    window.DocDiffPro = Object.freeze(api);
    installed = true;
    // Fire ready on the next microtask so installers that synchronously
    // subscribe during the same tick still receive it.
    queueMicrotask(fireReady);
    return () => {
      if (window.DocDiffPro === api) delete window.DocDiffPro;
      installed = false;
      listeners.clear();
      readyFired = false;
    };
  };

  return { install, emit };
}

declare global {
  interface Window {
    DocDiffPro?: DocDiffProApi;
  }
}

export type { DiffSummary } from '@/types/diff';
