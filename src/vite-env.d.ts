/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'mammoth' {
  export const images: {
    imgElement: (callback: (image: {
      read: (format: 'base64') => Promise<string>;
      contentType: string;
    }) => Promise<{ src: string; alt: string }>) => unknown;
  };

  export function convertToHtml(
    options: { arrayBuffer: ArrayBuffer },
    config?: { convertImage?: unknown; includeHeadersAndFooters?: boolean }
  ): Promise<{ value?: string }>;
}

declare module 'diff-match-patch' {
  export default class DiffMatchPatch {
    Diff_Timeout: number;
    diff_main(text1: string, text2: string): Array<[number, string]>;
    diff_cleanupSemantic(diffs: Array<[number, string]>): void;
    diff_cleanupEfficiency(diffs: Array<[number, string]>): void;
  }
}
