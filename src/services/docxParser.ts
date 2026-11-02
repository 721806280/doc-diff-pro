import type * as MammothModule from 'mammoth';
import { revokeDocumentImageUrls } from '@/services/documentFile';
import type { ImageSourceEntry } from '@/services/imageFingerprint';
import { extractLayoutNoise, type LayoutNoiseData } from '@/utils/layoutNoise';
import type { ImageDescriptorTable } from '@/utils/imageDescriptor';
import { IMAGE_ID_ATTRIBUTE } from '@/utils/textDiffCore';
import {
  createImageResourceBudget,
  IMAGE_RESOURCE_LIMIT_ATTRIBUTE,
  type ImageResourceLimit
} from '@/utils/imageResourceBudget';
import type { DocxGraphicsReport, DocxRevisionReport, DocxScanReport, DocumentParsePhase } from '@/types/document';
import { sanitizeDocumentBody, UNRENDERABLE_IMAGE_ATTRIBUTE } from '@/utils/sanitizeDocumentHtml';
import { throwIfAborted, yieldToBrowser } from '@/utils/comparisonScheduling';

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
  /** Images kept for byte comparison but blocked from all rendering. */
  limitedImageCount?: number;
  /**
   * Figures the converter never emitted at all — Word's own charts, shapes and
   * text boxes, embedded objects, and formulas. Unlike a dropped image these
   * leave no element behind, so counting them here is the only trace of them.
   */
  graphics: DocxGraphicsReport;
  /**
   * Tracked changes the package still carries. The conversion renders them as
   * accepted, so a reader comparing two documents is comparing accepted states —
   * true and worth saying, since nothing else in the output reveals it.
   */
  revisions: DocxRevisionReport;
  imageUrls: string[];
  /** Fingerprints keyed by the stable ID stamped on each image in `html`. */
  imageDescriptors: ImageDescriptorTable;
  warnings: string[];
};

export type ParseDocxOptions = {
  embeddedImageAlt?: string;
  imagePreviewUnavailableLabel?: string;
  signal?: AbortSignal;
  onProgress?: (phase: DocumentParsePhase) => void;
};

export async function parseDocx(file: File, options: ParseDocxOptions = {}): Promise<ParsedDocx> {
  const imageUrls: string[] = [];

  try {
    throwIfAborted(options.signal);
    options.onProgress?.('reading');
    await yieldToBrowser(options.signal);
    const [mammoth, arrayBuffer] = await Promise.all([import('mammoth') as Promise<MammothApi>, file.arrayBuffer()]);
    throwIfAborted(options.signal);
    options.onProgress?.('converting');
    await yieldToBrowser(options.signal);
    const convertImage = mammoth.images.imgElement(async (image) => {
      throwIfAborted(options.signal);
      const data = await image.read('base64');
      throwIfAborted(options.signal);
      return {
        src: `data:${image.contentType};base64,${data}`,
        alt: options.embeddedImageAlt ?? 'Embedded document image'
      };
    });
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      { convertImage, includeHeadersAndFooters: true, preserveAlignment: true }
    );
    throwIfAborted(options.signal);
    // Empty-body messaging belongs to the viewer, never to comparison input.
    const html = result.value?.trim() ?? '';
    // One parse, mutated in place through every stage, serialized once at the
    // end: the markup is large enough that each extra round trip shows up.
    const body = await sanitizeDocumentBody(html);
    throwIfAborted(options.signal);
    const renderedFormulas = body.querySelectorAll('math').length;
    const layoutNoise = extractLayoutNoise(body);
    const images = collectInlineImages(body);
    const scan = await scanParts(arrayBuffer);
    throwIfAborted(options.signal);
    // Source equations retained by the sanitizer are no longer missing figures.
    scan.graphics.formulas = Math.max(0, scan.graphics.formulas - renderedFormulas);
    if (images.length > 0) {
      options.onProgress?.('images');
      await yieldToBrowser(options.signal);
    }
    const imageDescriptors = await fingerprintImages(images, options.signal);
    throwIfAborted(options.signal);
    adoptImageSources(
      images,
      imageDescriptors,
      imageUrls,
      options.imagePreviewUnavailableLabel ?? 'Preview unavailable; original bytes are still compared.'
    );
    // The dimensions the fingerprinter already read from each header are what
    // lets the browser reserve the image's box before its bytes decode.
    reserveImageLayout(body, imageDescriptors);

    return {
      html: body.innerHTML,
      layoutNoise,
      imageUrls,
      imageDescriptors,
      // The same buffer mammoth was handed, read again for what it discarded.
      ...scan,
      ...collectDocxMetadata(body),
      warnings: collectMammothWarnings((result as MammothResultWithMessages).messages)
    };
  } catch (error) {
    // Nobody downstream ever saw these, so this function owns releasing them.
    revokeDocumentImageUrls(imageUrls);
    if (!options.signal?.aborted) console.error('[DOCX parse error]', error);
    throw error;
  }
}

/**
 * Loaded on demand: a zip reader is of no use until there is a package to read,
 * and this module is reachable from the landing screen.
 */
async function scanParts(archive: ArrayBuffer): Promise<DocxScanReport> {
  const { scanDocxParts } = await import('@/services/docxGraphics');
  return scanDocxParts(archive);
}

/**
 * Loaded on demand, and not at all for a document with no images.
 *
 * The fingerprinter carries the descriptor arithmetic and the container-header
 * reader behind it, none of which a text-only document has any use for — and
 * this module is reachable from the landing screen, so anything static here is
 * paid for before the reader has chosen a file.
 */
async function fingerprintImages(entries: ImageSourceEntry[], signal?: AbortSignal): Promise<ImageDescriptorTable> {
  if (entries.length === 0) return new Map();

  const { fingerprintDocumentImages } = await import('@/services/imageFingerprint');
  return fingerprintDocumentImages(entries, signal);
}

/**
 * Takes the bytes out of each inlined `data:` image and stamps the element with
 * the id its fingerprint will be filed under.
 *
 * Base64 inflates the bytes by a third and then rides along inside the document
 * string — through React state, through the comparison DOM, through every copy
 * either makes. An object URL is a few dozen characters pointing at the same
 * bytes held once.
 *
 * A figure no browser can draw gets no URL at all: its source is removed, so
 * nothing tries to load it, and only the stamped id remains to tie it to its
 * fingerprint. That is the whole point of the id — an EMF equation still has
 * bytes worth comparing after there is nothing left to show.
 *
 * The blobs go to the fingerprinter directly rather than by their URL. A pane
 * replaced mid-parse revokes its URLs, and a fingerprinter holding one would
 * fail exactly then; holding the blob keeps the bytes alive for as long as it
 * needs them and no longer.
 */
type InlineImageEntry = ImageSourceEntry & { image: HTMLImageElement };

function collectInlineImages(body: HTMLElement): InlineImageEntry[] {
  const entries: InlineImageEntry[] = [];

  body.querySelectorAll<HTMLImageElement>('img[src^="data:"]').forEach((image, index) => {
    const blob = dataUrlToBlob(image.getAttribute('src') ?? '');
    // No loadable source survives until dimensions and budgets are verified.
    image.removeAttribute('src');
    if (!blob) {
      return;
    }

    const id = `figure-${index}`;
    image.setAttribute(IMAGE_ID_ATTRIBUTE, id);
    entries.push({ id, blob, image });
  });

  return entries;
}

/** Admit distinct images in the same order as fingerprinting and share their URLs. */
function adoptImageSources(
  entries: InlineImageEntry[],
  descriptors: ImageDescriptorTable,
  urls: string[],
  unavailableLabel: string
): void {
  const admit = createImageResourceBudget();
  const sources = new Map<string, { url: string } | { limit: ImageResourceLimit }>();
  for (const { id, blob, image } of entries) {
    if (image.hasAttribute(UNRENDERABLE_IMAGE_ATTRIBUTE)) continue;
    const descriptor = descriptors.get(id)!;
    let source = sources.get(descriptor.hash);
    if (!source) {
      const limit = admit(descriptor);
      if (limit) source = { limit };
      else {
        const url = URL.createObjectURL(blob);
        // Keep ownership even if a later DOM mutation or URL allocation fails.
        urls.push(url);
        source = { url };
      }
      sources.set(descriptor.hash, source);
    }
    if ('limit' in source) {
      image.setAttribute(UNRENDERABLE_IMAGE_ATTRIBUTE, '');
      image.setAttribute(IMAGE_RESOURCE_LIMIT_ATTRIBUTE, source.limit);
      image.alt = [image.alt, unavailableLabel].filter(Boolean).join(' — ');
      image.removeAttribute('width');
      image.removeAttribute('height');
      image.style.removeProperty('width');
      image.style.removeProperty('height');
    } else {
      image.setAttribute('src', source.url);
      image.setAttribute('loading', 'lazy');
      image.setAttribute('decoding', 'async');
    }
  }
}

/**
 * Stamps each rendered image with the pixel dimensions read from its container
 * header, so the browser reserves the box before the bytes decode.
 *
 * Object-URL images decode asynchronously. With no width/height the element is
 * zero-tall until then, so every image the reader scrolls into grows from
 * nothing as it decodes — reflowing everything below, shifting scroll position,
 * and (through the pane's ResizeObserver and the viewport-fixed diff popover)
 * jittering regions outside the pane. The attributes give the browser the
 * aspect ratio up front; CSS (`max-width:100%; height:auto`) still scales the
 * real size responsively, so the picture looks identical — it just no longer
 * appears out of nowhere.
 *
 * Dimensions come from the fingerprinter's header read, which never decodes the
 * image. Sources that exceeded the shared budget have already been removed.
 */
function reserveImageLayout(body: HTMLElement, descriptors: ImageDescriptorTable): void {
  body.querySelectorAll<HTMLImageElement>(`img[${IMAGE_ID_ATTRIBUTE}]`).forEach((image) => {
    // A figure nothing can draw kept no source; nothing will load or reflow.
    if (!image.getAttribute('src')) return;
    // Respect any dimensions the document itself authored.
    if (image.hasAttribute('width') || image.hasAttribute('height')) return;

    const id = image.getAttribute(IMAGE_ID_ATTRIBUTE);
    const descriptor = id ? descriptors.get(id) : undefined;
    if (!descriptor || descriptor.width <= 0 || descriptor.height <= 0) return;

    image.setAttribute('width', String(descriptor.width));
    image.setAttribute('height', String(descriptor.height));
  });
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
): Pick<ParsedDocx, 'textLength' | 'imageCount' | 'droppedImageCount' | 'limitedImageCount'> {
  const textLength = (body.textContent ?? '').replace(/\s+/g, '').length;

  return {
    textLength,
    imageCount: body.querySelectorAll('img[src]').length,
    droppedImageCount: body.querySelectorAll(`img:not([src]):not([${IMAGE_RESOURCE_LIMIT_ATTRIBUTE}])`).length,
    limitedImageCount: body.querySelectorAll(`img[${IMAGE_RESOURCE_LIMIT_ATTRIBUTE}]`).length
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
