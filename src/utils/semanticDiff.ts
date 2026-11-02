import type { DiffTuple } from '@/types/diff';
import { mappedNode, type TextPositionMap } from './documentText';
import { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from './textDiffCore';

export type SemanticDifferenceLabels = {
  hyperlink: string;
  noHyperlink: string;
  superscript: string;
  subscript: string;
  normalText: string;
  lineBreak: string;
};

export const DEFAULT_SEMANTIC_LABELS: SemanticDifferenceLabels = {
  hyperlink: 'Link',
  noHyperlink: 'No link',
  superscript: 'Superscript',
  subscript: 'Subscript',
  normalText: 'Normal text',
  lineBreak: 'Line break'
};

type TextSemantics = { href: string; script: string };
const PLAIN_TEXT: TextSemantics = { href: '', script: '' };

/**
 * Equal characters can still change meaning through their link or script.
 * Split only those equal runs, using the original text alignment, before DOM
 * markup replaces the owning nodes. Text similarity keeps the raw text diff.
 */
export function enrichSemanticDiffs(
  diffs: readonly DiffTuple[],
  original: TextPositionMap,
  revised: TextPositionMap,
  labels: SemanticDifferenceLabels = DEFAULT_SEMANTIC_LABELS,
  compareInlineBreaks = true
): DiffTuple[] {
  const result: DiffTuple[] = [];
  const cache = new WeakMap<Text, TextSemantics>();
  const semanticsAt = (mapping: TextPositionMap, index: number): TextSemantics => {
    const node = mappedNode(mapping, index);
    if (!node) return PLAIN_TEXT;
    let semantics = cache.get(node);
    if (!semantics) {
      const parent = node.parentElement;
      semantics = {
        href: parent?.closest('a[href]')?.getAttribute('href')?.trim() ?? '',
        script: parent?.closest('sup, sub')?.tagName.toLowerCase() ?? ''
      };
      cache.set(node, semantics);
    }
    return semantics;
  };
  let originalOffset = 0;
  let revisedOffset = 0;

  for (const diff of diffs) {
    const [operation, text] = diff;
    if (operation !== DIFF_EQUAL) {
      result.push([...diff] as DiffTuple);
    } else {
      let start = 0;
      let previousLeft = '';
      let previousRight = '';
      const flush = (end: number): void => {
        if (end === start) return;
        const chunk = text.slice(start, end);
        if (previousLeft || previousRight) {
          result.push(Object.assign([DIFF_DELETE, chunk] as DiffTuple, { semanticLabel: previousLeft }));
          result.push(Object.assign([DIFF_INSERT, chunk] as DiffTuple, { semanticLabel: previousRight }));
        } else result.push([DIFF_EQUAL, chunk]);
        start = end;
      };

      for (let index = 0; index < text.length; index++) {
        const left = semanticsAt(original, originalOffset + index);
        const right = semanticsAt(revised, revisedOffset + index);
        let leftLabel = '';
        let rightLabel = '';
        const leftBreak = original.breaks?.has(originalOffset + index) ?? false;
        const rightBreak = revised.breaks?.has(revisedOffset + index) ?? false;
        if (compareInlineBreaks && leftBreak !== rightBreak) {
          if (leftBreak) leftLabel = labels.lineBreak;
          if (rightBreak) rightLabel = labels.lineBreak;
        }
        if (left.href !== right.href) {
          leftLabel = `${labels.hyperlink}: ${left.href || labels.noHyperlink}`;
          rightLabel = `${labels.hyperlink}: ${right.href || labels.noHyperlink}`;
        }
        if (left.script !== right.script) {
          const scriptLabel = (script: string) =>
            script === 'sup' ? labels.superscript : script === 'sub' ? labels.subscript : labels.normalText;
          leftLabel = [leftLabel, scriptLabel(left.script)].filter(Boolean).join('; ');
          rightLabel = [rightLabel, scriptLabel(right.script)].filter(Boolean).join('; ');
        }
        if (leftLabel !== previousLeft || rightLabel !== previousRight) flush(index);
        previousLeft = leftLabel;
        previousRight = rightLabel;
      }
      flush(text.length);
    }
    if (operation !== DIFF_INSERT) originalOffset += text.length;
    if (operation !== DIFF_DELETE) revisedOffset += text.length;
  }
  return result;
}
