/**
 * Where each character of the extracted text came from.
 *
 * Two parallel Int32Arrays over a shared node table rather than one
 * `{ node, offset }` object per character. A long document runs to hundreds of
 * thousands of characters and the compare builds this twice per side, so
 * per-character objects cost tens of megabytes and hand the collector millions
 * of short-lived allocations; the columns cost eight bytes a character and
 * none. Read through `mappedNode` / `mappedOffset` rather than indexing.
 */
export type TextMapping = {
  text: string;
  mapping: TextPositionMap;
};

export type TextPositionMap = {
  /** Distinct text nodes, in document order. Shared, never copied. */
  nodes: Text[];
  /** Index into `nodes` per character; NO_TEXT_NODE for synthetic separators. */
  nodeIds: Int32Array;
  /** Offset within the owning text node per character. */
  offsets: Int32Array;
};

/** Marks a character that belongs to no text node: a synthetic block separator. */
const NO_TEXT_NODE = -1;
const INITIAL_MAPPING_CAPACITY = 1024;

/** The text node holding character `index`, or null past the end / for separators. */
export function mappedNode(mapping: TextPositionMap, index: number): Text | null {
  const nodeId = mapping.nodeIds[index];
  if (nodeId === undefined || nodeId === NO_TEXT_NODE) return null;

  return mapping.nodes[nodeId] ?? null;
}

export function mappedOffset(mapping: TextPositionMap, index: number): number {
  return mapping.offsets[index] ?? 0;
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'LI',
  'TR',
  'TD',
  'TH',
  'TABLE',
  'SECTION',
  'PRE',
  'ARTICLE'
]);
const INLINE_WHITESPACE_PATTERN = /[ \t\v\f\r\u00a0\u1680\u180e\u2000-\u200a\u202f\u205f\u3000]/;
const CJK_NUMBER_PATTERN = '零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟萬';

// Converted documents may merge list items into one paragraph, so structural markers
// match both standalone prefixes ("1.2.3.") and suffixes inside merged text.
const STRUCTURAL_LINE_PREFIX_SOURCE =
  `[0-9０-９]+(?:[.．、][0-9０-９]+)*[.．、]?` +
  `|[${CJK_NUMBER_PATTERN}]+[.．、]` +
  `|[（(][0-9０-９${CJK_NUMBER_PATTERN}]+[)）]` +
  `|[（(][A-Za-zＡ-Ｚａ-ｚIVXLCDMivxlcdm]+[)）]` +
  `|[A-Za-zＡ-Ｚａ-ｚ][.．、)]` +
  `|[IVXLCDMivxlcdm]+[.．、)]`;
const STRUCTURAL_LINE_PREFIX_PATTERN = new RegExp(`^(?:${STRUCTURAL_LINE_PREFIX_SOURCE})$`);
const STRUCTURAL_LINE_SUFFIX_PATTERN = new RegExp(
  `(?:^|[^0-9０-９A-Za-zＡ-Ｚａ-ｚ])(?:${STRUCTURAL_LINE_PREFIX_SOURCE})$`
);
const CJK_OR_FULLWIDTH_PUNCT_PATTERN = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
const DIGIT_PATTERN = /[0-9０-９]/;
const JOINABLE_TEXT_PATTERN = /[\u3400-\u9fff\uf900-\ufaffA-Za-z0-9Ａ-Ｚａ-ｚ０-９]/;
const STRUCTURED_TOKEN_CHAR_PATTERN = /[A-Za-z0-9@._%+:/-]/;
const DASH_PATTERN = /[-‐‑‒–—―]/;
const OPENING_PUNCTUATION_PATTERN = /[([{<（【《“‘]/;
const CLOSING_PUNCTUATION_PATTERN = /[)\]}>）】》”’]/;
const CJK_PUNCTUATION_PATTERN = /[，。、：；！？（）【】《》“”‘’]/;
const FIELD_SEPARATOR_PATTERN = /[:,;：，；]/;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;
const EMAIL_PREFIX_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*$/i;
const SHORT_DOMAIN_PATTERN = /(?:^|[.@:/])[A-Za-z0-9-]+\.[A-Za-z]{2,6}(?:[/:-]|$)/i;
const URLISH_PATTERN = /^(?:https?:\/\/|www\.)/i;

/**
 * Flattens a document to the text the diff runs on, recording where every
 * character came from.
 *
 * Block elements contribute a newline on the way in and out, so the diff sees
 * paragraph boundaries as boundaries rather than running two paragraphs
 * together. Those newlines belong to no text node, which is what NO_TEXT_NODE
 * marks: markup cannot be applied to them, and the mapping has to say so.
 *
 * Text nodes are normalized in place as they are visited — zero-width
 * characters dropped, hard line breaks turned into spaces — so that the
 * offsets recorded here stay valid against the live DOM the markup pass will
 * mutate.
 */
export function buildTextMapping(rootDom: HTMLElement): TextMapping {
  const textBuffer: string[] = [];
  const mapping = createMappingBuilder();
  const orderedListCounters = new WeakMap<HTMLElement, number>();

  const endsWithNewline = (): boolean => textBuffer.at(-1)?.at(-1) === '\n';

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node.nodeValue ?? '').replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/[\r\n]/g, ' ');

      node.nodeValue = value;
      if (value.length === 0) return;

      const nodeId = mapping.nodes.push(node as Text) - 1;
      for (let index = 0; index < value.length; index++) {
        appendMapping(mapping, nodeId, index);
      }
      textBuffer.push(value);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    const isBlock = BLOCK_TAGS.has(element.tagName.toUpperCase());

    if (isBlock && textBuffer.length > 0 && !endsWithNewline()) {
      textBuffer.push('\n');
      appendMapping(mapping, NO_TEXT_NODE, 0);
    }

    ensureSyntheticListMarkerElement(element, orderedListCounters);
    Array.from(element.childNodes).forEach(walk);

    if (isBlock && textBuffer.length > 0 && !endsWithNewline()) {
      textBuffer.push('\n');
      appendMapping(mapping, NO_TEXT_NODE, 0);
    }
  }

  walk(rootDom);
  return { text: textBuffer.join(''), mapping: finishMapping(mapping) };
}

type MappingBuilder = {
  nodes: Text[];
  nodeIds: Int32Array;
  offsets: Int32Array;
  size: number;
};

function createMappingBuilder(nodes: Text[] = [], capacity = INITIAL_MAPPING_CAPACITY): MappingBuilder {
  const size = Math.max(capacity, 1);
  return { nodes, nodeIds: new Int32Array(size), offsets: new Int32Array(size), size: 0 };
}

/**
 * Grows the columns by doubling, which is the usual bargain: a document whose
 * length is not known up front pays a handful of reallocations rather than
 * either one per character or a guess large enough to waste.
 *
 * `collapseWhitespace` sizes its builder exactly and never reaches the growth
 * path at all.
 */
function appendMapping(builder: MappingBuilder, nodeId: number, offset: number): void {
  if (builder.size === builder.nodeIds.length) {
    const nodeIds = new Int32Array(builder.size * 2);
    const offsets = new Int32Array(builder.size * 2);

    nodeIds.set(builder.nodeIds);
    offsets.set(builder.offsets);
    builder.nodeIds = nodeIds;
    builder.offsets = offsets;
  }

  builder.nodeIds[builder.size] = nodeId;
  builder.offsets[builder.size] = offset;
  builder.size++;
}

function finishMapping(builder: MappingBuilder): TextPositionMap {
  // Views, not copies: the trailing capacity stays allocated but is never read,
  // and trimming it would mean memcpying the whole mapping for no benefit.
  return {
    nodes: builder.nodes,
    nodeIds: builder.nodeIds.subarray(0, builder.size),
    offsets: builder.offsets.subarray(0, builder.size)
  };
}

export function collapseWhitespace({ text, mapping }: TextMapping): TextMapping {
  const resultTextChunks: string[] = [];
  // Collapsing only ever drops characters, so the source length is an exact
  // ceiling and the columns never have to grow. The node table is shared: the
  // surviving characters point at the very same text nodes.
  const resultMapping = createMappingBuilder(mapping.nodes, text.length);
  let lastChar = '';
  let currentLine = '';

  const appendResult = (ch: string, sourceIndex: number, resetLine = false): void => {
    resultTextChunks.push(ch);
    appendMapping(resultMapping, mapping.nodeIds[sourceIndex] ?? NO_TEXT_NODE, mapping.offsets[sourceIndex] ?? 0);
    lastChar = ch;
    currentLine = resetLine ? '' : currentLine + ch;
  };

  for (let index = 0; index < text.length; index++) {
    let ch = text[index];
    if (ch === undefined || index >= mapping.nodeIds.length) continue;
    if (isTextWhitespace(ch)) {
      const nextChar = nextNonTextWhitespace(text, index + 1);
      if (
        isStructuralMarkerBeforeWhitespace(currentLine) ||
        lastChar === ' ' ||
        lastChar === '' ||
        shouldDropWhitespaceBetween(resultTextChunks, text, index, lastChar, nextChar)
      ) {
        if (ch === '\n') currentLine = '';
        continue;
      }
      ch = ' ';
    }

    appendResult(ch, index, text[index] === '\n');
  }

  while (resultTextChunks.at(-1) === ' ') {
    resultTextChunks.pop();
    resultMapping.size--;
  }

  return { text: resultTextChunks.join(''), mapping: finishMapping(resultMapping) };
}

export function normalizeText(text: string, ignoreFullHalf: boolean, ignoreCase: boolean): string {
  const normalizedCase = ignoreCase ? text.toLowerCase() : text;
  if (!ignoreFullHalf) return normalizedCase;

  // Copied in runs rather than character by character: most documents replace
  // a handful of wide forms and leave the rest untouched, so this allocates a
  // few slices instead of one single-character string per character.
  let result = '';
  let runStart = 0;

  for (let index = 0; index < normalizedCase.length; index++) {
    const replacement = narrowVariantOf(normalizedCase, index);
    if (replacement === null) continue;

    result += normalizedCase.slice(runStart, index) + replacement;
    runStart = index + 1;
  }

  return result + normalizedCase.slice(runStart);
}

/** The half-width form of the character at `index`, or null if it already is one. */
function narrowVariantOf(text: string, index: number): string | null {
  const code = text.charCodeAt(index);
  if (code === 12288) return ' ';
  if (code >= 65281 && code <= 65374) return String.fromCharCode(code - 65248);

  const ch = text[index];
  const narrowed = normalizePunctuationVariant(ch);
  return narrowed === ch ? null : narrowed;
}

function ensureSyntheticListMarkerElement(
  element: HTMLElement,
  orderedListCounters: WeakMap<HTMLElement, number>
): void {
  if (element.tagName.toUpperCase() !== 'LI') return;

  const parent = element.parentElement;
  if (!parent || parent.tagName.toUpperCase() !== 'OL') return;

  const itemValue = takeOrderedListItemValue(element, parent, orderedListCounters);
  if (hasDirectListNumberElement(element)) return;

  const marker = element.ownerDocument.createElement('span');
  marker.className = 'mammoth-list-number';
  marker.dataset.ddvSyntheticListNumber = 'true';
  marker.textContent = `${formatOrderedListMarker(itemValue, parent)} `;

  element.style.listStyleType = 'none';
  element.insertBefore(marker, element.firstChild);
}

function hasDirectListNumberElement(element: HTMLElement): boolean {
  return Array.from(element.children).some(
    (child) =>
      child instanceof HTMLElement &&
      (child.dataset.mammothListNumber === 'true' || child.dataset.ddvSyntheticListNumber === 'true')
  );
}

function takeOrderedListItemValue(
  element: HTMLElement,
  parent: HTMLElement,
  orderedListCounters: WeakMap<HTMLElement, number>
): number {
  const explicitValue = Number(element.getAttribute('value'));
  const nextValue = orderedListCounters.get(parent) ?? getOrderedListStart(parent);
  const currentValue = Number.isFinite(explicitValue) && explicitValue > 0 ? explicitValue : nextValue;

  orderedListCounters.set(parent, currentValue + 1);
  return currentValue;
}

function getOrderedListStart(parent: HTMLElement): number {
  const start = Number(parent.getAttribute('start'));
  return Number.isFinite(start) && start > 0 ? start : 1;
}

function formatOrderedListMarker(value: number, parent: HTMLElement): string {
  switch (parent.getAttribute('type')) {
    case 'A':
      return `${formatAlphaListMarker(value).toUpperCase()}.`;
    case 'a':
      return `${formatAlphaListMarker(value)}.`;
    case 'I':
      return `${formatRomanListMarker(value).toUpperCase()}.`;
    case 'i':
      return `${formatRomanListMarker(value)}.`;
    default:
      return `${value}.`;
  }
}

function formatAlphaListMarker(value: number): string {
  let current = Math.max(1, value);
  let marker = '';

  while (current > 0) {
    current -= 1;
    marker = String.fromCharCode(97 + (current % 26)) + marker;
    current = Math.floor(current / 26);
  }
  return marker;
}

function formatRomanListMarker(value: number): string {
  const pairs: Array<[number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i']
  ];
  let current = Math.max(1, Math.min(value, 3999));
  let marker = '';

  for (const [amount, roman] of pairs) {
    while (current >= amount) {
      marker += roman;
      current -= amount;
    }
  }
  return marker;
}

function isInlineWhitespace(ch: string | undefined): boolean {
  return ch !== undefined && INLINE_WHITESPACE_PATTERN.test(ch);
}

function isTextWhitespace(ch: string | undefined): boolean {
  return ch === '\n' || isInlineWhitespace(ch);
}

function isCjkOrFullwidthPunctuation(ch: string | undefined): boolean {
  return !!ch && CJK_OR_FULLWIDTH_PUNCT_PATTERN.test(ch);
}

function nextNonTextWhitespace(text: string, startIndex: number): string | undefined {
  for (let index = startIndex; index < text.length; index++) {
    if (!isTextWhitespace(text[index])) return text[index];
  }
  return undefined;
}

function previousTextChar(textChunks: string[]): string | undefined {
  for (let index = textChunks.length - 2; index >= 0; index--) {
    const ch = textChunks[index];
    if (!isTextWhitespace(ch)) return ch;
  }
  return undefined;
}

function shouldDropWhitespaceBetween(
  textChunks: string[],
  text: string,
  whitespaceIndex: number,
  previous: string,
  next: string | undefined
): boolean {
  if (!next) return true;

  const beforePrevious = previousTextChar(textChunks);
  // Whitespace is collapsed before the final compare normalization. Normalize only the
  // neighboring boundary chars here so full-width and half-width punctuation behave alike
  // without changing the original DOM mapping length.
  const normalizedBeforePrevious = beforePrevious ? normalizeCharForWhitespaceBoundary(beforePrevious) : undefined;
  const normalizedPrevious = normalizeCharForWhitespaceBoundary(previous);
  const normalizedNext = normalizeCharForWhitespaceBoundary(next);

  if (isCjkOrFullwidthPunctuation(normalizedPrevious) && isCjkOrFullwidthPunctuation(normalizedNext)) return true;
  if (DIGIT_PATTERN.test(normalizedPrevious) && DIGIT_PATTERN.test(normalizedNext)) return true;
  if (isStructuredTokenWhitespace(textChunks, text, whitespaceIndex)) return true;
  if (isTightPunctuationBoundary(normalizedBeforePrevious, normalizedPrevious, normalizedNext)) return true;
  if (isMixedCjkWordBoundary(normalizedPrevious, normalizedNext)) return true;

  return false;
}

function isTightPunctuationBoundary(beforePrevious: string | undefined, previous: string, next: string): boolean {
  const hasCjkContext = CJK_PATTERN.test(previous) || CJK_PATTERN.test(next) || CJK_PATTERN.test(beforePrevious ?? '');

  // Keep ASCII punctuation conservative: remove spaces around ":" or brackets only in
  // Chinese legal-text context, so ordinary English sentences keep their spacing.
  return (
    (CJK_PUNCTUATION_PATTERN.test(previous) &&
      (JOINABLE_TEXT_PATTERN.test(next) || CJK_PUNCTUATION_PATTERN.test(next))) ||
    (CJK_PUNCTUATION_PATTERN.test(next) &&
      (JOINABLE_TEXT_PATTERN.test(previous) || CJK_PUNCTUATION_PATTERN.test(previous))) ||
    (hasCjkContext && FIELD_SEPARATOR_PATTERN.test(previous) && JOINABLE_TEXT_PATTERN.test(next)) ||
    (hasCjkContext && FIELD_SEPARATOR_PATTERN.test(next) && JOINABLE_TEXT_PATTERN.test(previous)) ||
    (hasCjkContext && OPENING_PUNCTUATION_PATTERN.test(previous) && JOINABLE_TEXT_PATTERN.test(next)) ||
    (hasCjkContext && OPENING_PUNCTUATION_PATTERN.test(next) && JOINABLE_TEXT_PATTERN.test(previous)) ||
    (hasCjkContext && CLOSING_PUNCTUATION_PATTERN.test(previous) && JOINABLE_TEXT_PATTERN.test(next)) ||
    (hasCjkContext && CLOSING_PUNCTUATION_PATTERN.test(next) && JOINABLE_TEXT_PATTERN.test(previous)) ||
    (DASH_PATTERN.test(previous) && JOINABLE_TEXT_PATTERN.test(next)) ||
    (DASH_PATTERN.test(next) && JOINABLE_TEXT_PATTERN.test(previous))
  );
}

function isStructuredTokenWhitespace(textChunks: string[], text: string, whitespaceIndex: number): boolean {
  const leftToken = readStructuredTokenLeft(textChunks);
  const rightToken = readStructuredTokenRight(text, whitespaceIndex + 1);
  if (!leftToken || !rightToken) return false;
  if (EMAIL_PATTERN.test(leftToken)) return false;

  const joined = `${leftToken}${rightToken}`;
  if (EMAIL_PATTERN.test(joined)) return true;
  if (joined.includes('@') && EMAIL_PREFIX_PATTERN.test(joined)) return true;
  if (URLISH_PATTERN.test(joined)) return true;
  if (SHORT_DOMAIN_PATTERN.test(joined)) return true;

  return false;
}

function readStructuredTokenLeft(textChunks: string[]): string {
  let token = '';
  for (let index = textChunks.length - 1; index >= 0; index--) {
    const ch = normalizeCharForWhitespaceBoundary(textChunks[index]);
    if (!STRUCTURED_TOKEN_CHAR_PATTERN.test(ch)) break;
    token = ch + token;
  }
  return token;
}

function readStructuredTokenRight(text: string, startIndex: number): string {
  let token = '';
  for (let index = startIndex; index < text.length; index++) {
    const ch = text[index];
    if (isTextWhitespace(ch)) {
      if (token.length === 0) continue;
      break;
    }

    const normalized = normalizeCharForWhitespaceBoundary(ch);
    if (!STRUCTURED_TOKEN_CHAR_PATTERN.test(normalized)) break;
    token += normalized;
  }
  return token;
}

function isMixedCjkWordBoundary(previous: string, next: string): boolean {
  return (
    JOINABLE_TEXT_PATTERN.test(previous) &&
    JOINABLE_TEXT_PATTERN.test(next) &&
    (CJK_PATTERN.test(previous) || CJK_PATTERN.test(next))
  );
}

function isStructuralLinePrefix(lineText: string): boolean {
  return STRUCTURAL_LINE_PREFIX_PATTERN.test(lineText);
}

function isStructuralMarkerBeforeWhitespace(lineText: string): boolean {
  return isStructuralLinePrefix(lineText) || STRUCTURAL_LINE_SUFFIX_PATTERN.test(lineText);
}

function normalizeCharForWhitespaceBoundary(ch: string | undefined): string {
  if (ch === undefined) return '';
  const code = ch.charCodeAt(0);
  if (code === 12288) return ' ';
  if (code >= 65281 && code <= 65374) return String.fromCharCode(code - 65248);
  return normalizePunctuationVariant(ch);
}

function normalizePunctuationVariant(ch: string | undefined): string {
  switch (ch) {
    case '“':
    case '”':
    case '„':
    case '‟':
      return '"';
    case '‘':
    case '’':
    case '‚':
    case '‛':
      return "'";
    case '‐':
    case '‑':
    case '‒':
    case '–':
    case '—':
    case '―':
      return '-';
    default:
      return ch ?? '';
  }
}
