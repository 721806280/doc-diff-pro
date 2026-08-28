import type * as MammothModule from 'mammoth';
import { revokeDocumentImageUrls } from '@/services/documentFile';
import type { ImageSourceEntry } from '@/services/imageFingerprint';
import { extractLayoutNoise, type LayoutNoiseData } from '@/utils/layoutNoise';
import type { ImageDescriptorTable } from '@/utils/imageDescriptor';
import type { DocxGraphicsReport } from '@/types/document';
import { sanitizeDocumentBody } from '@/utils/sanitizeDocumentHtml';

type MammothImage = {
  read(format: 'base64'): Promise<string>;
  contentType: string;
};

type MammothMessage = {
  type?: string;
  message?: string;
};

type MammothResultWithMessages = {
  messages?: unknown;
};

type MammothApi = typeof MammothModule & {
  images: {
    imgElement(callback: (image: MammothImage) => Promise<{ src: string; alt: string }>): unknown;
  };
};

export type ParsedDocx = {
  html: string;
  layoutNoise: LayoutNoiseData;
  textLength: number;
  imageCount: number;
  /**
   * Images the sanitizer refused, counted because they are otherwise invisible:
   * a vector graphic Word supplied as EMF arrives with a content type no browser
   * renders, loses its source, and would leave no trace at all. A comparison that
   * silently ignores part of a document is worse than one that says it did.
   */
  droppedImageCount: number;
  /**
   * Figures the converter never emitted at all — Word's own charts, shapes and
   * text boxes, embedded objects, and formulas. Unlike a dropped image these
   * leave no element behind, so counting them here is the only trace of them.
   */
  graphics: DocxGraphicsReport;
  imageUrls: string[];
  /** Fingerprints keyed by the `src` each `<img>` carries in `html`. */
  imageDescriptors: ImageDescriptorTable;
  warnings: string[];
};

export type ParseDocxOptions = {
  embeddedImageAlt?: string;
  emptyDocumentHtml?: string;
};

export async function parseDocx(file: File, options: ParseDocxOptions = {}): Promise<ParsedDocx> {
  let imageUrls: string[] = [];

  try {
    const [mammoth, arrayBuffer] = await Promise.all([import('mammoth') as Promise<MammothApi>, file.arrayBuffer()]);
    const convertImage = mammoth.images.imgElement(async (image) => ({
      src: `data:${image.contentType};base64,${await image.read('base64')}`,
      alt: options.embeddedImageAlt ?? 'Embedded document image'
    }));
    const result = await mammoth.convertToHtml({ arrayBuffer }, { convertImage, includeHeadersAndFooters: true });
    const html = result.value ? result.value.trim() : (options.emptyDocumentHtml ?? '<p>(Empty document)</p>');
    // One parse, mutated in place through every stage, serialized once at the
    // end: the markup is large enough that each extra round trip shows up.
    const body = await sanitizeDocumentBody(html);
    const layoutNoise = extractLayoutNoise(body);
    const adopted = adoptInlineImages(body);
    imageUrls = adopted.map((entry) => entry.src);

    return {
      html: body.innerHTML,
      layoutNoise,
      imageUrls,
      // Awaited here rather than handed on as a promise: parsing is already the
      // slow phase the reader is waiting through, and every image is hashed
      // without being decoded, which is the part that would have cost.
      imageDescriptors: await fingerprintImages(adopted),
      // The same buffer mammoth was handed, read again for what it discarded.
      graphics: await scanGraphics(arrayBuffer),
      ...collectDocxMetadata(body),
      warnings: collectMammothWarnings((result as MammothResultWithMessages).messages)
    };
  } catch (error) {
    // Nobody downstream ever saw these, so this function owns releasing them.
    revokeDocumentImageUrls(imageUrls);
    console.error('[DOCX parse error]', error);
    throw error;
  }
}

/**
 * Loaded on demand: a zip reader is of no use until there is a package to read,
 * and this module is reachable from the landing screen.
 */
async function scanGraphics(archive: ArrayBuffer): Promise<DocxGraphicsReport> {
  const { scanDocxGraphics } = await import('@/services/docxGraphics');
  return scanDocxGraphics(archive);
}

/**
 * Loaded on demand, and not at all for a document with no images.
 *
 * The fingerprinter carries the descriptor arithmetic and the container-header
 * reader behind it, none of which a text-only document has any use for — and
 * this module is reachable from the landing screen, so anything static here is
 * paid for before the reader has chosen a file.
 */
async function fingerprintImages(entries: ImageSourceEntry[]): Promise<ImageDescriptorTable> {
  if (entries.length === 0) return new Map();

  const { fingerprintDocumentImages } = await import('@/services/imageFingerprint');
  return fingerprintDocumentImages(entries);
}

/**
 * Swaps each inlined `data:` image for an object URL, and hands back the blobs
 * behind them.
 *
 * Base64 inflates the bytes by a third and then rides along inside the
 * document string — through React state, through the comparison DOM, through
 * every copy either makes. An object URL is a few dozen characters pointing at
 * the same bytes held once. Runs after sanitizing so the payload has already
 * been checked to be a raster image.
 *
 * The blobs go to the fingerprinter directly rather than by their URL. A pane
 * replaced mid-parse revokes its URLs, and a fingerprinter holding one would
 * fail exactly then; holding the blob keeps the bytes alive for as long as it
 * needs them and no longer.
 */
function adoptInlineImages(body: HTMLElement): ImageSourceEntry[] {
  const adopted: ImageSourceEntry[] = [];

  body.querySelectorAll<HTMLImageElement>('img[src^="data:"]').forEach((image) => {
    const blob = dataUrlToBlob(image.getAttribute('src') ?? '');
    if (!blob) {
      image.removeAttribute('src');
      return;
    }

    const url = URL.createObjectURL(blob);
    adopted.push({ src: url, blob });
    image.setAttribute('src', url);
  });

  return adopted;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const marker = ';base64,';
  const separator = dataUrl.indexOf(marker);
  if (separator < 0) return null;

  try {
    const binary = atob(dataUrl.slice(separator + marker.length));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);

    return new Blob([bytes], { type: dataUrl.slice('data:'.length, separator) });
  } catch {
    // Truncated or otherwise unreadable payload; the caller drops the source.
    return null;
  }
}

export function collectDocxMetadata(
  body: HTMLElement
): Pick<ParsedDocx, 'textLength' | 'imageCount' | 'droppedImageCount'> {
  const textLength = (body.textContent ?? '').replace(/\s+/g, '').length;

  return {
    textLength,
    imageCount: body.querySelectorAll('img[src]').length,
    droppedImageCount: body.querySelectorAll('img:not([src])').length
  };
}

export function collectMammothWarnings(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message) => formatMammothMessage(message as MammothMessage))
    .filter((message): message is string => message.length > 0);
}

function formatMammothMessage(message: MammothMessage): string {
  const content = message.message?.trim();
  if (!content) return '';

  return message.type ? `${message.type}: ${content}` : content;
}
