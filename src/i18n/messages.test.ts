import { describe, expect, it } from 'vitest';
import { messages, SUPPORTED_LOCALES, type I18nMessages } from './messages';

type Shape = { plain: string[]; formatters: string[] };

/**
 * Walks a message tree into a sorted description of its keys, splitting plain
 * strings from the formatter functions so a locale cannot quietly turn one
 * into the other.
 */
function describeShape(node: unknown, path = ''): Shape {
  if (typeof node === 'function') return { plain: [], formatters: [path] };
  if (typeof node === 'string') return { plain: [path], formatters: [] };
  if (node === null || typeof node !== 'object') return { plain: [], formatters: [] };

  const shape: Shape = { plain: [], formatters: [] };
  for (const [key, value] of Object.entries(node)) {
    const child = describeShape(value, path ? `${path}.${key}` : key);
    shape.plain.push(...child.plain);
    shape.formatters.push(...child.formatters);
  }
  shape.plain.sort();
  shape.formatters.sort();
  return shape;
}

function collectValues(node: unknown, out: Array<{ path: string; value: unknown }> = [], path = '') {
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) collectValues(value, out, path ? `${path}.${key}` : key);
    return out;
  }
  out.push({ path, value: node });
  return out;
}

// Sample arguments broad enough that every formatter gets something usable:
// they take counts, file names, byte limits or already-formatted row labels.
const SAMPLE_ARGUMENTS = [2, 'sample.docx', 'detail'];

describe('message catalogue', () => {
  it('offers the same keys, in the same form, for every locale', () => {
    const [reference, ...others] = SUPPORTED_LOCALES;
    const referenceShape = describeShape(messages[reference]);

    expect(referenceShape.plain.length).toBeGreaterThan(0);
    for (const locale of others) {
      expect({ locale, ...describeShape(messages[locale]) }).toEqual({ locale, ...referenceShape });
    }
  });

  it('leaves no message blank in any locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const blank = collectValues(messages[locale])
        .filter((entry) => typeof entry.value === 'string' && entry.value.trim().length === 0)
        .map((entry) => entry.path);

      expect({ locale, blank }).toEqual({ locale, blank: [] });
    }
  });

  it('produces non-empty text from every formatter in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const broken = collectValues(messages[locale])
        .filter((entry) => typeof entry.value === 'function')
        .filter((entry) => {
          const format = entry.value as (...args: unknown[]) => unknown;
          const result = format(...SAMPLE_ARGUMENTS.slice(0, Math.max(format.length, 1)));
          return typeof result !== 'string' || result.trim().length === 0;
        })
        .map((entry) => entry.path);

      expect({ locale, broken }).toEqual({ locale, broken: [] });
    }
  });

  it('interpolates its arguments rather than dropping them', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const i18n: I18nMessages = messages[locale];

      expect(i18n.app.errors.fileTooLarge(25)).toContain('25');
      expect(i18n.app.notices.parseCompleteWithWarnings('contract.docx', 3)).toContain('contract.docx');
      expect(i18n.app.notices.parseCompleteWithWarnings('contract.docx', 3)).toContain('3');
    }
  });

  it('produces non-empty text for singular and zero counts in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const count of [1, 0]) {
        const broken = collectValues(messages[locale])
          .filter((entry) => typeof entry.value === 'function')
          .filter((entry) => {
            const format = entry.value as (...args: unknown[]) => unknown;
            const args = new Array<number>(Math.max(format.length, 1)).fill(count);
            const result = format(...args);
            return typeof result !== 'string' || result.trim().length === 0;
          })
          .map((entry) => entry.path);

        expect({ locale, count, broken }).toEqual({ locale, count, broken: [] });
      }
    }
  });

  it('uses singular English forms for a count of one', () => {
    const en = messages.en;

    expect(en.app.notices.parseCompleteWithWarnings('contract.docx', 1)).toContain('1 conversion warning.');
    expect(en.diffNavigator.differenceCount(1)).toBe('1 diff');
    expect(en.diffNavigator.layoutNoiseDetailsCount(1)).toBe('1 item');
    expect(en.diffNavigator.similarDiffsTitle(1)).toContain('1 similar difference.');
    expect(en.documentPane.textLength('Length', 1)).toBe('Length char');
    expect(en.documentPane.imageCount('Images', 1)).toBe('Images image');
    expect(en.diffNavigator.ignoreSelectedSimilar(0)).toBe('Ignore');
    expect(en.diffNavigator.ignoreSelectedSimilar(3)).toBe('Ignore 3');
  });
});
