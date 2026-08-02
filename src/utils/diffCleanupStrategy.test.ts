import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { compareDocuments, type LayoutNoiseBySide } from '@/services/diffEngine';
import { extractLayoutNoise, type LayoutNoiseData } from '@/utils/layoutNoise';
import { sanitizeDocumentHtml } from '@/utils/sanitizeDocumentHtml';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

type Sample = { html: string; noise: LayoutNoiseData };

/**
 * Guards the cleanup strategy in textDiffCore against the bundled samples.
 *
 * The misalignment this covers only appears with whole-document context —
 * diff-match-patch bisects long inputs, and the bad boundary does not
 * reproduce on a hand-written pair of strings. So the fixture has to be the
 * real documents.
 *
 * Converts from the Node buffer rather than going through parseDocx, because
 * jsdom's File.arrayBuffer does not give mammoth something it can open.
 */
async function loadSample(name: string): Promise<Sample> {
  const buffer = readFileSync(`${process.cwd()}/public/samples/${name}`);
  const result: { value?: string } = await mammoth.convertToHtml({ buffer }, { includeHeadersAndFooters: true });
  const sanitized = await sanitizeDocumentHtml(String(result.value ?? '').trim());
  const { html, layoutNoise } = extractLayoutNoise(sanitized);
  return { html, noise: layoutNoise };
}

function noiseOf(original: Sample, revised: Sample): LayoutNoiseBySide {
  return { original: original.noise, revised: revised.noise };
}

describe('diff cleanup strategy on the bundled samples', () => {
  it('keeps an inserted table row within its own row boundaries', async () => {
    const [original, revised] = await Promise.all([loadSample('baseline.docx'), loadSample('revised.docx')]);

    const result = await compareDocuments(original.html, revised.html, {
      granularity: 'char',
      ignoreSpaces: true,
      ignoreFullHalfWidth: true,
      filterLayoutNoise: false,
      layoutNoise: noiseOf(original, revised)
    });

    const dom = new DOMParser().parseFromString(result.revisedHtml, 'text/html').body;
    const insertedText = Array.from(dom.querySelectorAll('ins')).map((node) => node.textContent ?? '');

    // The contacts row is inserted whole. Without diff_cleanupSemanticLossless
    // the boundary slid one email to the left: the insertion opened with
    // "@example.com" borrowed from the preceding row and closed early on
    // "陈卓 · chenzhuo", leaving a stray marker on the row above.
    expect(insertedText.some((text) => text.startsWith('@example.com'))).toBe(false);
    expect(insertedText).toContain('王璐 · wanglu@example.com');
    expect(insertedText).toContain('陈卓 · chenzhuo@example.com');
  });

  it('leaves the semantic level on its own cleanup path', async () => {
    const [original, revised] = await Promise.all([loadSample('baseline.docx'), loadSample('revised.docx')]);

    const result = await compareDocuments(original.html, revised.html, {
      granularity: 'semantic',
      ignoreSpaces: true,
      ignoreFullHalfWidth: true,
      filterLayoutNoise: false,
      layoutNoise: noiseOf(original, revised)
    });

    expect(result.summary.total).toBeGreaterThan(0);
  });
});
