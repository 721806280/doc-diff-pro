import { describe, expect, it } from 'vitest';
import {
  activeReviewPosition,
  createReviewItem,
  diffReviewId,
  findActiveReviewIndex,
  findSimilarReviewItems,
  resolveReviewShortcut,
  selectReviewElement
} from './diffReview';
import type { DiffElementGroup } from './diffElementIndex';

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
    expect(createReviewItem(1, { A: [textElement('删除内容')], B: [] })).toMatchObject({ kind: 'deleted', revisedPreview: '' });
    expect(createReviewItem(2, { A: [], B: [textElement('新增内容')] })).toMatchObject({ kind: 'inserted', originalPreview: '' });
  });

  it('finds similar inserted differences by configured threshold', () => {
    const groups = new Map<number, DiffElementGroup>([
      [1, insertedGroup('abcdefghij')],
      [2, insertedGroup('abcdefghxy')],
      [3, insertedGroup('abcdefghij')],
      [4, { A: [textElement('abcdefghij')], B: [] }]
    ]);

    const balanced = findSimilarReviewItems({
      currentIndex: 1,
      total: 4,
      ignoredIds: new Set(),
      level: 'balanced',
      getGroup: (index) => groups.get(index)
    });
    const strict = findSimilarReviewItems({
      currentIndex: 1,
      total: 4,
      ignoredIds: new Set(),
      level: 'strict',
      getGroup: (index) => groups.get(index)
    });

    expect(balanced.map((item) => item.index)).toEqual([3, 2]);
    expect(strict.map((item) => item.index)).toEqual([3]);
  });

  it('does not recommend ignored differences', () => {
    const groups = new Map<number, DiffElementGroup>([
      [1, insertedGroup('abcdefghij')],
      [2, insertedGroup('abcdefghij')]
    ]);

    expect(findSimilarReviewItems({
      currentIndex: 1,
      total: 2,
      ignoredIds: new Set([diffReviewId(2)]),
      level: 'loose',
      getGroup: (index) => groups.get(index)
    })).toEqual([]);
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

    expect(findSimilarReviewItems({
      currentIndex: 1,
      total: 2,
      ignoredIds: new Set(),
      level: 'loose',
      getGroup: (index) => groups.get(index)
    })).toEqual([]);

    table.remove();
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
