import type * as MammothModule from 'mammoth';
import { revokeDocumentImageUrls } from '@/services/documentFile';
import { extractLayoutNoise, type LayoutNoiseData } from '@/utils/layoutNoise';
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
  imageUrls: string[];
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
    imageUrls = adoptInlineImages(body);

    return {
      html: body.innerHTML,
      layoutNoise,
      imageUrls,
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
 * Swaps each inlined `data:` image for an object URL.
 *
 * Base64 inflates the bytes by a third and then rides along inside the
 * document string — through React state, through the comparison DOM, through
 * every copy either makes. An object URL is a few dozen characters pointing at
 * the same bytes held once. Runs after sanitizing so the payload has already
 * been checked to be a raster image.
 */
function adoptInlineImages(body: HTMLElement): string[] {
  const urls: string[] = [];

  body.querySelectorAll<HTMLImageElement>('img[src^="data:"]').forEach((image) => {
    const blob = dataUrlToBlob(image.getAttribute('src') ?? '');
    if (!blob) {
      image.removeAttribute('src');
      return;
    }

    const url = URL.createObjectURL(blob);
    urls.push(url);
    image.setAttribute('src', url);
  });

  return urls;
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

export function collectDocxMetadata(body: HTMLElement): Pick<ParsedDocx, 'textLength' | 'imageCount'> {
  const textLength = (body.textContent ?? '').replace(/\s+/g, '').length;
  const imageCount = body.querySelectorAll('img[src]').length;

  return { textLength, imageCount };
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
