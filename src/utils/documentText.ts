export type TextMappingEntry = { node: Text; offset: number } | null;

export type TextMapping = { text: string; mapping: TextMappingEntry[] };

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'LI',
  'TR', 'TD', 'TH', 'TABLE', 'SECTION', 'PRE', 'ARTICLE'
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
const STRUCTURAL_LINE_SUFFIX_PATTERN = new RegExp(`(?:^|[^0-9０-９A-Za-zＡ-Ｚａ-ｚ])(?:${STRUCTURAL_LINE_PREFIX_SOURCE})$`);
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

export function buildTextMapping(rootDom: HTMLElement): TextMapping {
  const textBuffer: string[] = [];
  const mapping: TextMappingEntry[] = [];
  const orderedListCounters = new WeakMap<HTMLElement, number>();

  const endsWithNewline = (): boolean => {
    if (textBuffer.length === 0) return false;
    const lastChunk = textBuffer[textBuffer.length - 1];
    return lastChunk[lastChunk.length - 1] === '\n';
  };

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node.nodeValue ?? '')
        .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
        .replace(/[\r\n]/g, ' ');

      node.nodeValue = value;
      if (value.length === 0) return;

      for (let index = 0; index < value.length; index++) {
        mapping.push({ node: node as Text, offset: index });
      }
      textBuffer.push(value);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    const isBlock = BLOCK_TAGS.has(element.tagName.toUpperCase());

    if (isBlock && textBuffer.length > 0 && !endsWithNewline()) {
      textBuffer.push('\n');
      mapping.push(null);
    }

    ensureSyntheticListMarkerElement(element, orderedListCounters);
    Array.from(element.childNodes).forEach(walk);

    if (isBlock && textBuffer.length > 0 && !endsWithNewline()) {
      textBuffer.push('\n');
      mapping.push(null);
    }
  }

  walk(rootDom);
  return { text: textBuffer.join(''), mapping };
}

export function collapseWhitespace({ text, mapping }: TextMapping): TextMapping {
  const resultTextChunks: string[] = [];
  const resultMapping: TextMappingEntry[] = [];
  let lastChar = '';
  let currentLine = '';

  const appendResult = (ch: string, mapped: TextMappingEntry, resetLine = false): void => {
    resultTextChunks.push(ch);
    resultMapping.push(mapped);
    lastChar = ch;
    currentLine = resetLine ? '' : currentLine + ch;
  };

  for (let index = 0; index < text.length; index++) {
    let ch = text[index];

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

    appendResult(ch, mapping[index], text[index] === '\n');
  }

  while (resultTextChunks.at(-1) === ' ') {
    resultTextChunks.pop();
    resultMapping.pop();
  }

  return { text: resultTextChunks.join(''), mapping: resultMapping };
}

export function normalizeText(text: string, ignoreFullHalf: boolean, ignoreCase: boolean): string {
  const normalizedCase = ignoreCase ? text.toLowerCase() : text;
  if (!ignoreFullHalf) return normalizedCase;

  const resultBuffer: string[] = [];
  for (let index = 0; index < normalizedCase.length; index++) {
    const code = normalizedCase.charCodeAt(index);
    if (code === 12288) {
      resultBuffer.push(' ');
    } else if (code >= 65281 && code <= 65374) {
      resultBuffer.push(String.fromCharCode(code - 65248));
    } else {
      resultBuffer.push(normalizePunctuationVariant(normalizedCase[index]));
    }
  }
  return resultBuffer.join('');
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
  return Array.from(element.children).some((child) =>
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
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
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

function isInlineWhitespace(ch: string): boolean {
  return INLINE_WHITESPACE_PATTERN.test(ch);
}

function isTextWhitespace(ch: string): boolean {
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
    (CJK_PUNCTUATION_PATTERN.test(previous) && (JOINABLE_TEXT_PATTERN.test(next) || CJK_PUNCTUATION_PATTERN.test(next))) ||
    (CJK_PUNCTUATION_PATTERN.test(next) && (JOINABLE_TEXT_PATTERN.test(previous) || CJK_PUNCTUATION_PATTERN.test(previous))) ||
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

function normalizeCharForWhitespaceBoundary(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code === 12288) return ' ';
  if (code >= 65281 && code <= 65374) return String.fromCharCode(code - 65248);
  return normalizePunctuationVariant(ch);
}

function normalizePunctuationVariant(ch: string): string {
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
      return ch;
  }
}
