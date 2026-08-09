import type { LayoutNoiseData } from '@/utils/layoutNoise';

export type PaneSide = 'A' | 'B';
export type DocumentStatus = 'idle' | 'parsing' | 'ready' | 'error';

export type DocumentPaneState = {
  name: string;
  size: number;
  originalHtml: string;
  highlightedHtml: string;
  textLength: number;
  imageCount: number;
  warnings: string[];
  layoutNoise: LayoutNoiseData;
  /**
   * Object URLs backing the <img> elements in this document's markup. They
   * stay alive until the pane is replaced or cleared, so whoever drops a
   * DocumentPaneState owns revoking these.
   */
  imageUrls: string[];
  status: DocumentStatus;
  error: string;
};

export type DocumentPair = Record<PaneSide, DocumentPaneState>;
