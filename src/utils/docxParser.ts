import type * as MammothModule from 'mammoth';
import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';

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
  textLength: number;
  imageCount: number;
  warnings: string[];
};

export async function parseDocx(file: File): Promise<ParsedDocx> {
  const mammoth: MammothApi = await import('mammoth');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const convertImage = mammoth.images.imgElement(async (image) => ({
      src: `data:${image.contentType};base64,${await image.read('base64')}`,
      alt: '文档嵌入图片'
    }));
    const result = await mammoth.convertToHtml({ arrayBuffer }, { convertImage });
    const html = result.value ? result.value.trim() : '<p>（空文档）</p>';
    const sanitizedHtml = await sanitizeDocumentHtml(html);

    return {
      html: sanitizedHtml,
      ...collectDocxMetadata(sanitizedHtml),
      warnings: collectMammothWarnings((result as MammothResultWithMessages).messages)
    };
  } catch (error) {
    console.error('[DOCX解析错误]', error);
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
