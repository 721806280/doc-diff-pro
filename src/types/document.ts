import type { LayoutNoiseData } from '@/utils/layoutNoise';
import type { ImageDescriptorTable } from '@/utils/imageDescriptor';

/**
 * Figures a .docx carries that the converter emits nothing for. Declared here
 * rather than beside the scanner so that holding the shape does not mean loading
 * the zip reader that produces it.
 */
export type DocxGraphicsReport = {
  /** Charts, SmartArt, shapes and text boxes Word drew itself. */
  nativeGraphics: number;
  /** Embedded objects and VML images, which usually means EMF or WMF. */
  embeddedObjects: number;
  /** Formulas, dropped without leaving an element behind. */
  formulas: number;
};

export type PaneSide = 'A' | 'B';
export type DocumentStatus = 'idle' | 'parsing' | 'ready' | 'error';

export type DocumentPaneState = {
  name: string;
  size: number;
  originalHtml: string;
  highlightedHtml: string;
  textLength: number;
  imageCount: number;
  /** Images the sanitizer refused, which take no part in the comparison. */
  droppedImageCount: number;
  /** Figures the converter never emitted: Word's own graphics, and formulas. */
  graphics: DocxGraphicsReport;
  warnings: string[];
  layoutNoise: LayoutNoiseData;
  /**
   * Object URLs backing the <img> elements in this document's markup. They
   * stay alive until the pane is replaced or cleared, so whoever drops a
   * DocumentPaneState owns revoking these.
   */
  imageUrls: string[];
  /**
   * Image fingerprints taken while parsing, keyed by the `src` in the markup.
   * Travels with the pane because a comparison cannot recompute it: by then the
   * markup holds object URLs and the pixels are gone.
   */
  imageDescriptors: ImageDescriptorTable;
  status: DocumentStatus;
  error: string;
};

export type DocumentPair = Record<PaneSide, DocumentPaneState>;
