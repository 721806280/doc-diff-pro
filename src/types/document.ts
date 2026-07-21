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
  status: DocumentStatus;
  error: string;
};

export type DocumentPair = Record<PaneSide, DocumentPaneState>;
