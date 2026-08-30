const FORBIDDEN_TAGS = [
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'meta',
  'object',
  'option',
  'script',
  'select',
  'textarea'
];

/**
 * Inline image payloads a browser can draw. SVG is included because the
 * converter renders OLE object icons (embedded spreadsheets, documents and the
 * like) as `data:image/svg+xml` carrying an embedded bitmap and a text label —
 * without it those icons vanish and an embedded file leaves no visible trace.
 *
 * A `data:image/svg+xml` src is safe to render as an `<img>`: browsers load
 * image-context SVG without executing any script it might contain, and inline
 * `<svg>` elements never reach this point because DOMPurify strips them.
 */
const RENDERABLE_IMAGE_SOURCE_PATTERN = /^data:image\/(?:bmp|gif|jpeg|png|webp|svg\+xml);base64,/i;

/**
 * Image formats a .docx legitimately carries that no browser draws: the
 * metafiles Word uses for OLE previews and equations, and the occasional TIFF
 * from a scanner.
 *
 * Kept apart from the renderable list because these are worth comparing even
 * though they cannot be shown. Their bytes say whether the figure changed, and
 * a figure whose change goes unreported is worse than one that cannot be drawn.
 */
const COMPARABLE_ONLY_IMAGE_SOURCE_PATTERN = /^data:image\/(?:x-emf|emf|x-wmf|wmf|tiff|x-tiff);base64,/i;

/** Marks an image kept for comparison that must never be rendered. */
export const UNRENDERABLE_IMAGE_ATTRIBUTE = 'data-ddv-unrenderable';

/**
 * Inline declarations kept from a converted document.
 *
 * DOMPurify allows `style` through, and for a .docx that is mostly welcome —
 * it is how the converter carries fonts, colors and cell borders. But a .docx
 * is untrusted input, and CSS alone is enough to cover the app's own controls
 * with a fixed-position block or to phone home through a `url()` reference, so
 * anything outside document formatting is dropped.
 *
 * Matching is prefix-based (`margin`, not `margin-top`) because whether the
 * CSSOM hands back shorthands or expanded longhands varies by engine.
 */
const ALLOWED_STYLE_PROPERTIES = new Set([
  'background-color',
  'color',
  'height',
  'letter-spacing',
  'line-height',
  'overflow-wrap',
  'vertical-align',
  'white-space',
  'width',
  'word-break'
]);
const ALLOWED_STYLE_PREFIXES = ['border', 'font', 'list-style', 'margin', 'padding', 'text'];
const UNSAFE_STYLE_VALUE_PATTERN = /url\(|expression\(|javascript:|@import/i;

type DOMPurifyModule = typeof import('dompurify');
type DOMPurifyInstance = ReturnType<DOMPurifyModule['default']>;

let purifierPromise: Promise<DOMPurifyInstance> | null = null;

/**
 * Sanitizes converted document markup and hands back the live DOM.
 *
 * The DOM is the useful shape: everything downstream — layout-noise removal,
 * metadata, the diff itself — wants a tree, and serializing here only to have
 * the next stage parse it again costs a full round trip over what can be
 * megabytes of markup once images are inlined.
 */
export async function sanitizeDocumentBody(html: string): Promise<HTMLElement> {
  const purifier = await getPurifier();
  // DOMPurify types RETURN_DOM as a bare `Node`, but with WHOLE_DOCUMENT off
  // it is documented to hand back the <body> element it built.
  const body = purifier.sanitize(html, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    USE_PROFILES: { html: true },
    RETURN_DOM: true
  }) as HTMLElement;

  body.querySelectorAll<HTMLAnchorElement>('a').forEach((anchor) => {
    anchor.rel = 'noopener noreferrer';
  });

  body.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const source = image.getAttribute('src') ?? '';
    if (RENDERABLE_IMAGE_SOURCE_PATTERN.test(source)) return;

    if (COMPARABLE_ONLY_IMAGE_SOURCE_PATTERN.test(source)) {
      // The payload survives only as far as `adoptInlineImages`, which takes the
      // bytes for the fingerprint and then removes the source, so nothing ever
      // asks the browser to draw it.
      image.setAttribute(UNRENDERABLE_IMAGE_ATTRIBUTE, '');
      return;
    }

    image.removeAttribute('src');
  });

  filterInlineStyles(body);

  return body;
}

/** String-returning form, for callers that only need the markup. */
export async function sanitizeDocumentHtml(html: string): Promise<string> {
  return (await sanitizeDocumentBody(html)).innerHTML;
}

function filterInlineStyles(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const style = element.style;

    // Backwards: removeProperty renumbers the declarations behind the cursor.
    for (let index = style.length - 1; index >= 0; index--) {
      const property = style.item(index);
      if (isAllowedStyleDeclaration(property, style.getPropertyValue(property))) continue;

      style.removeProperty(property);
    }

    if (style.length === 0) element.removeAttribute('style');
  });
}

function isAllowedStyleDeclaration(property: string, value: string): boolean {
  if (UNSAFE_STYLE_VALUE_PATTERN.test(value)) return false;
  if (ALLOWED_STYLE_PROPERTIES.has(property)) return true;

  return ALLOWED_STYLE_PREFIXES.some((prefix) => property.startsWith(prefix));
}

function getPurifier(): Promise<DOMPurifyInstance> {
  purifierPromise ??= import('dompurify').then(({ default: createDOMPurify }) => createDOMPurify(window));

  return purifierPromise;
}
