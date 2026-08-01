import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSettings } from '@/config/userSettings';
import type { DocumentPair } from '@/types/document';
import { createEmptyDocument } from '@/services/documentFile';
import { useRecompareOnSettingsChange } from './useRecompareOnSettingsChange';

type Rules = Pick<UserSettings, 'diffGranularity' | 'filterLayoutNoise' | 'ignoreFullHalfWidth' | 'ignoreSpaces'>;

const BASE_RULES: Rules = {
  diffGranularity: 'semantic',
  filterLayoutNoise: false,
  ignoreFullHalfWidth: true,
  ignoreSpaces: true
};

function documentsWith(name: string): DocumentPair {
  return {
    A: { ...createEmptyDocument(), name, status: 'ready' },
    B: { ...createEmptyDocument(), name, status: 'ready' }
  };
}

function mountRecompare(initial: { rules?: Rules; ready?: boolean; documents?: DocumentPair } = {}) {
  const onCompare = vi.fn().mockResolvedValue(undefined);
  const onNotice = vi.fn();
  const view = renderHook(
    (props: { rules: Rules; ready: boolean; documents: DocumentPair }) =>
      useRecompareOnSettingsChange({
        documents: props.documents,
        ready: props.ready,
        rules: props.rules,
        notice: 'settings updated',
        onCompare,
        onNotice
      }),
    {
      initialProps: {
        rules: initial.rules ?? BASE_RULES,
        ready: initial.ready ?? true,
        documents: initial.documents ?? documentsWith('a.docx')
      }
    }
  );
  return { ...view, onCompare, onNotice };
}

describe('useRecompareOnSettingsChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not compare on the first render', () => {
    const { onCompare, onNotice } = mountRecompare();

    act(() => { vi.advanceTimersByTime(1000); });

    expect(onCompare).not.toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('announces immediately but debounces the comparison', () => {
    const view = mountRecompare();

    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: true, documents: documentsWith('a.docx') });

    expect(view.onNotice).toHaveBeenCalledWith('settings updated');
    expect(view.onCompare).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(180); });

    expect(view.onCompare).toHaveBeenCalledTimes(1);
    expect(view.onCompare).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('collapses rapid setting changes into one comparison', () => {
    const view = mountRecompare();

    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: true, documents: documentsWith('a.docx') });
    act(() => { vi.advanceTimersByTime(100); });
    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'word' }, ready: true, documents: documentsWith('a.docx') });
    act(() => { vi.advanceTimersByTime(100); });
    view.rerender({ rules: { ...BASE_RULES, ignoreSpaces: false }, ready: true, documents: documentsWith('a.docx') });
    act(() => { vi.advanceTimersByTime(180); });

    expect(view.onCompare).toHaveBeenCalledTimes(1);
  });

  it('ignores a re-render that leaves the rules untouched', () => {
    const view = mountRecompare();

    view.rerender({ rules: { ...BASE_RULES }, ready: true, documents: documentsWith('b.docx') });
    act(() => { vi.advanceTimersByTime(500); });

    expect(view.onCompare).not.toHaveBeenCalled();
    expect(view.onNotice).not.toHaveBeenCalled();
  });

  it('stays quiet while the documents are not ready', () => {
    const view = mountRecompare({ ready: false });

    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: false, documents: documentsWith('a.docx') });
    act(() => { vi.advanceTimersByTime(500); });

    expect(view.onCompare).not.toHaveBeenCalled();
    expect(view.onNotice).not.toHaveBeenCalled();
  });

  // A rules change made before the documents are ready is absorbed rather than
  // queued: the first comparison useComparisonSession runs on readiness already
  // uses the new rules, so replaying it here would compare twice.
  it('does not replay a rules change that happened before readiness', () => {
    const view = mountRecompare({ ready: false });

    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: false, documents: documentsWith('a.docx') });
    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: true, documents: documentsWith('a.docx') });
    act(() => { vi.advanceTimersByTime(500); });

    expect(view.onCompare).not.toHaveBeenCalled();
  });

  it('compares on the first rules change made after readiness', () => {
    const view = mountRecompare({ ready: false });

    view.rerender({ rules: { ...BASE_RULES }, ready: true, documents: documentsWith('a.docx') });
    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: true, documents: documentsWith('a.docx') });
    act(() => { vi.advanceTimersByTime(180); });

    expect(view.onCompare).toHaveBeenCalledTimes(1);
  });

  // The hook reads documents through a ref so the debounce always submits the
  // newest pair, not the one captured when the setting changed.
  it('compares the newest documents rather than the ones captured at change time', () => {
    const view = mountRecompare({ documents: documentsWith('old.docx') });

    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: true, documents: documentsWith('old.docx') });
    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: true, documents: documentsWith('new.docx') });
    act(() => { vi.advanceTimersByTime(180); });

    expect(view.onCompare).toHaveBeenCalledTimes(1);
    const [submitted] = view.onCompare.mock.calls[0] as [DocumentPair, boolean];
    expect(submitted.A.name).toBe('new.docx');
  });

  it('cancels the pending comparison on unmount', () => {
    const view = mountRecompare();

    view.rerender({ rules: { ...BASE_RULES, diffGranularity: 'char' }, ready: true, documents: documentsWith('a.docx') });
    view.unmount();
    act(() => { vi.advanceTimersByTime(500); });

    expect(view.onCompare).not.toHaveBeenCalled();
  });
});
