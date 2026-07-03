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

const SAFE_IMAGE_SOURCE_PATTERN = /^data:image\/(?:bmp|gif|jpeg|png|webp);base64,/i;

type DOMPurifyModule = typeof import('dompurify');
type DOMPurifyInstance = ReturnType<DOMPurifyModule['default']>;

let purifierPromise: Promise<DOMPurifyInstance> | null = null;

export async function sanitizeDocumentHtml(html: string): Promise<string> {
  const purifier = await getPurifier();
  const sanitized = purifier.sanitize(html, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    USE_PROFILES: { html: true }
  });
  const body = new DOMParser().parseFromString(sanitized, 'text/html').body;

  body.querySelectorAll<HTMLAnchorElement>('a').forEach((anchor) => {
    anchor.rel = 'noopener noreferrer';
  });

  body.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    if (!SAFE_IMAGE_SOURCE_PATTERN.test(image.src)) {
      image.removeAttribute('src');
    }
  });

  return body.innerHTML;
}

function getPurifier(): Promise<DOMPurifyInstance> {
  purifierPromise ??= import('dompurify')
    .then(({ default: createDOMPurify }) => createDOMPurify(window));

  return purifierPromise;
}
