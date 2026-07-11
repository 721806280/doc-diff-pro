import type * as MammothModule from 'mammoth';
import { extractLayoutNoise, type LayoutNoiseData } from '@/utils/layoutNoise';
import { sanitizeDocumentHtml } from '@/utils/sanitizeDocumentHtml';

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
  warnings: string[];
};

export type ParseDocxOptions = {
  embeddedImageAlt?: string;
  emptyDocumentHtml?: string;
};

export async function parseDocx(file: File, options: ParseDocxOptions = {}): Promise<ParsedDocx> {
  try {
    const [mammoth, arrayBuffer] = await Promise.all([
      import('mammoth') as Promise<MammothApi>,
      file.arrayBuffer()
    ]);
    const convertImage = mammoth.images.imgElement(async (image) => ({
      src: `data:${image.contentType};base64,${await image.read('base64')}`,
      alt: options.embeddedImageAlt ?? 'Embedded document image'
    }));
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      { convertImage, includeHeadersAndFooters: true }
    );
    const html = result.value ? result.value.trim() : options.emptyDocumentHtml ?? '<p>(Empty document)</p>';
    const sanitizedHtml = await sanitizeDocumentHtml(html);
    const { html: contentHtml, layoutNoise } = extractLayoutNoise(sanitizedHtml);

    return {
      html: contentHtml,
      layoutNoise,
      ...collectDocxMetadata(contentHtml),
      warnings: collectMammothWarnings((result as MammothResultWithMessages).messages)
    };
  } catch (error) {
    console.error('[DOCX parse error]', error);
    throw error;
  }
}

export function collectDocxMetadata(html: string): Pick<ParsedDocx, 'textLength' | 'imageCount'> {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
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
