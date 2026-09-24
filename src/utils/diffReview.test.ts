import { describe, expect, it } from 'vitest';
import {
  activeReviewPosition,
  buildReviewSignatures,
  createReviewItem,
  diffReviewId,
  findActiveReviewIndex,
  findSimilarReviewItems,
  focusReviewElement,
  resolveReviewShortcut,
  selectReviewElement
} from './diffReview';
import type { DiffElementGroup } from './diffElementIndex';

function similarItemsFor(options: {
  groups: Map<number, DiffElementGroup>;
  total: number;
  currentIndex: number;
  level: 'strict' | 'balanced' | 'loose';
  ignoredIds?: Set<string>;
}) {
  return findSimilarReviewItems({
    currentIndex: options.currentIndex,
    signatures: buildReviewSignatures(options.total, (index) => options.groups.get(index)),
    ignoredIds: options.ignoredIds ?? new Set(),
    level: options.level
  });
}

describe('diffReview', () => {
  it('counts active differences while skipping reviewed items', () => {
    const ignoredIds = new Set([diffReviewId(2), diffReviewId(4)]);

    expect(activeReviewPosition(3, 5, ignoredIds)).toBe(2);
    expect(findActiveReviewIndex(2, 1, 5, ignoredIds)).toBe(3);
    expect(findActiveReviewIndex(4, -1, 5, ignoredIds)).toBe(3);
  });

  it('builds review items from original and revised diff elements', () => {
    const item = createReviewItem(1, {
      A: [textElement('旧条款')],
      B: [textElement('新条款')]
    });

    expect(item).toMatchObject({
      id: diffReviewId(1),
      index: 1,
      kind: 'modified',
      originalPreview: '旧条款',
      revisedPreview: '新条款'
    });
  });

  it('builds complete review items for one-sided differences', () => {
    expect(createReviewItem(1, { A: [textElement('删除内容')], B: [] })).toMatchObject({
      kind: 'deleted',
      revisedPreview: ''
    });
    expect(createReviewItem(2, { A: [], B: [textElement('新增内容')] })).toMatchObject({
      kind: 'inserted',
      originalPreview: ''
    });
  });

  it('previews an image difference by its label, since it has no text', () => {
    // Without this an image difference would appear in the review list as a
    // blank row, indistinguishable from every other image difference.
    const item = createReviewItem(1, {
      A: [imageElement('图片 1024×768')],
      B: [imageElement('图片 800×600')]
    });

    expect(item).toMatchObject({
      kind: 'modified',
      context: 'image',
      originalPreview: '图片 1024×768',
      revisedPreview: '图片 800×600'
    });
  });

  it('keeps an image difference in a table out of the table context', () => {
    // Contexts are what stop the similar-difference scan offering to batch a
    // figure together with a paragraph, so a figure in a cell is still a figure.
    const cell = document.createElement('td');
    const table = document.createElement('table');
    const image = imageElement('图片 400×300');
    cell.appendChild(image);
    table.appendChild(cell);

    expect(createReviewItem(1, { A: [image], B: [] })?.context).toBe('image');
    expect(createReviewItem(2, { A: [textElement('单元格文本')], B: [] })?.context).toBe('body');
  });

  it('finds similar inserted differences by configured threshold', () => {
    const groups = new Map<number, DiffElementGroup>([
      [1, insertedGroup('abcdefghij')],
      [2, insertedGroup('abcdefghxy')],
      [3, insertedGroup('abcdefghij')],
      [4, { A: [textElement('abcdefghij')], B: [] }]
    ]);

    const balanced = similarItemsFor({ groups, total: 4, currentIndex: 1, level: 'balanced' });
    const strict = similarItemsFor({ groups, total: 4, currentIndex: 1, level: 'strict' });

    expect(balanced.map((item) => item.index)).toEqual([3, 2]);
    expect(strict.map((item) => item.index)).toEqual([3]);
  });

  it('does not recommend ignored differences', () => {
    const groups = new Map<number, DiffElementGroup>([
      [1, insertedGroup('abcdefghij')],
      [2, insertedGroup('abcdefghij')]
    ]);

    expect(
      similarItemsFor({
        groups,
        total: 2,
        currentIndex: 1,
        level: 'loose',
        ignoredIds: new Set([diffReviewId(2)])
      })
    ).toEqual([]);
  });

  it('does not recommend body differences as similar to table differences', () => {
    const table = document.createElement('table');
    const cell = document.createElement('td');
    cell.appendChild(textElement('abcdefghij'));
    table.appendChild(cell);
    document.body.appendChild(table);

    const groups = new Map<number, DiffElementGroup>([
      [1, insertedGroupFrom(cell.firstElementChild as HTMLElement)],
      [2, insertedGroup('abcdefghij')]
    ]);

    expect(similarItemsFor({ groups, total: 2, currentIndex: 1, level: 'loose' })).toEqual([]);

    table.remove();
  });

  it('skips differences that are no longer in the index when building signatures', () => {
    const groups = new Map<number, DiffElementGroup>([
      [1, insertedGroup('abcdefghij')],
      [3, insertedGroup('abcdefghij')]
    ]);

    const signatures = buildReviewSignatures(3, (index) => groups.get(index));

    expect(signatures.map((entry) => entry.item.index)).toEqual([1, 3]);
    expect(similarItemsFor({ groups, total: 3, currentIndex: 1, level: 'loose' }).map((item) => item.index)).toEqual([
      3
    ]);
  });

  it('positions review actions on the exact difference selected by the user', () => {
    const original = textElement('旧内容');
    const revisedFirst = textElement('新内容一');
    const revisedSecond = textElement('新内容二');
    const unrelated = textElement('其他内容');
    const group = { A: [original], B: [revisedFirst, revisedSecond] };

    expect(selectReviewElement(group, revisedSecond, () => true)).toBe(revisedSecond);
    expect(selectReviewElement(group, unrelated, () => true)).toBe(original);
    expect(selectReviewElement(group, revisedSecond, (element) => element === original)).toBe(original);
  });

  it('moves keyboard focus onto the difference, preferring a side that is on screen', () => {
    const original = focusableElement('旧内容');
    const revised = focusableElement('新内容');
    // jsdom lays nothing out, so `offsetParent` is declared: the revised pane
    // is hidden, as a narrow layout showing one pane at a time would hide it.
    Object.defineProperty(original, 'offsetParent', { configurable: true, value: document.body });
    Object.defineProperty(revised, 'offsetParent', { configurable: true, value: null });

    focusReviewElement({ A: [original], B: [revised] });
    expect(document.activeElement).toBe(original);

    // A pure deletion has no revised side to prefer; the only side wins.
    focusReviewElement({ A: [focusableElement('删除内容')], B: [] });
    expect(document.activeElement?.textContent).toBe('删除内容');

    // Nothing to focus leaves focus where it was.
    focusReviewElement(undefined);
    expect(document.activeElement?.textContent).toBe('删除内容');

    document.body.innerHTML = '';
  });

  it('retries without preventScroll when the browser refuses to focus an off-screen difference', () => {
    // WebKit will not move focus to a difference still below the fold while the
    // scroll is suppressed, so the first attempt no-ops. The element is only
    // reachable once focus is allowed to bring it into view.
    const revised = focusableElement('新内容');
    const attempts: (boolean | undefined)[] = [];
    const nativeFocus = revised.focus.bind(revised);
    revised.focus = (options?: FocusOptions) => {
      attempts.push(options?.preventScroll);
      if (options?.preventScroll) return;
      nativeFocus(options);
    };

    focusReviewElement({ A: [], B: [revised] });

    expect(attempts).toEqual([true, undefined]);
    expect(document.activeElement).toBe(revised);

    document.body.innerHTML = '';
  });

  it('maps review keyboard shortcuts without intercepting modified input', () => {
    expect(resolveReviewShortcut(keyboardEvent('ArrowUp', { altKey: true }))).toBe('previous');
    expect(resolveReviewShortcut(keyboardEvent('ArrowDown', { altKey: true }))).toBe('next');
    expect(resolveReviewShortcut(keyboardEvent('i'))).toBe('toggle-ignore');
    expect(resolveReviewShortcut(keyboardEvent('i', { ctrlKey: true }))).toBeNull();
  });
});

function keyboardEvent(
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}
): Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers
  };
}

function insertedGroup(text: string): DiffElementGroup {
  return {
    A: [],
    B: [textElement(text)]
  };
}

function insertedGroupFrom(element: HTMLElement): DiffElementGroup {
  return { A: [], B: [element] };
}

function textElement(text: string): HTMLElement {
  const element = document.createElement('span');
  element.textContent = text;
  return element;
}

/** An attached, focusable diff element, as the index rebuild leaves it. */
function focusableElement(text: string): HTMLElement {
  const element = textElement(text);
  element.tabIndex = 0;
  document.body.append(element);
  return element;
}

/** A `<del>` around an image, as the image pass leaves it. */
function imageElement(label: string): HTMLElement {
  const element = document.createElement('del');
  element.setAttribute('data-diff-image', label);
  element.appendChild(document.createElement('img'));
  return element;
}
