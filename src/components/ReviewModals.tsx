import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
import type { IgnoredDiffItem, LayoutNoiseItem, SimilarDiffItem } from '@/types/diff';
import { createBodyScrollLock } from '@/utils/bodyScrollLock';
import { createFocusTrap } from '@/utils/focusTrap';

function useDialog(open: boolean, panelRef: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  const bodyLock = useMemo(createBodyScrollLock, []);
  const focusTrap = useMemo(createFocusTrap, []);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    bodyLock.lock();
    focusTrap.activate(panelRef.current);
    return () => {
      focusTrap.deactivate();
      bodyLock.release();
    };
  }, [bodyLock, focusTrap, open, panelRef]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      focusTrap.handleKeydown(event);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusTrap, open]);
}

function CloseIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}

function Preview({ item, className }: { item: IgnoredDiffItem; className: string }) {
  const { messages: i18n } = useI18n();
  return (
    <div className={className}>
      <p><span>{i18n.diffNavigator.tableHintSides.original}</span><strong>{item.originalPreview || i18n.diffNavigator.emptyDiffPreview}</strong></p>
      <p><span>{i18n.diffNavigator.tableHintSides.revised}</span><strong>{item.revisedPreview || i18n.diffNavigator.emptyDiffPreview}</strong></p>
    </div>
  );
}

export function IgnoredDiffModal({ open, items, onClose, onLocate, onRestore, onRestoreAll }: { open: boolean; items: IgnoredDiffItem[]; onClose: () => void; onLocate: (id: string) => void; onRestore: (id: string) => void; onRestoreAll: () => void }) {
  const { messages: i18n } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const visible = open && items.length > 0;
  useDialog(visible, panelRef, onClose);
  if (!visible) return null;
  return createPortal(
    <div className="ignored-diff-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="ignored-diff-panel" role="dialog" aria-modal="true" aria-labelledby="ignored-diff-dialog-title">
        <div className="ignored-diff-panel__head">
          <div className="ignored-diff-panel__title"><strong id="ignored-diff-dialog-title">{i18n.diffNavigator.ignoredDetailsTitle}</strong><span>{i18n.diffNavigator.ignoredDiffs(items.length)}</span></div>
          <button type="button" className="ignored-diff-close" aria-label={i18n.diffNavigator.closeDetails} title={i18n.diffNavigator.closeDetails} onClick={onClose}><CloseIcon /></button>
        </div>
        <ul className="ignored-diff-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="ignored-diff-meta"><span className="ignored-diff-index">#{item.index}</span><span className={`ignored-diff-kind kind-${item.kind}`}>{i18n.diffNavigator.ignoredDiffKind[item.kind]}</span></div>
              <Preview item={item} className="ignored-diff-preview" />
              <div className="ignored-diff-row-actions"><button type="button" onClick={() => onLocate(item.id)}>{i18n.diffNavigator.viewSimilarDiff}</button><button type="button" className="restore" onClick={() => onRestore(item.id)}>{i18n.diffNavigator.unignoreHere}</button></div>
            </li>
          ))}
        </ul>
        <div className="ignored-diff-footer"><span>{i18n.diffNavigator.ignoredSelectedCount(items.length)}</span><button type="button" className="ignored-diff-restore-all" onClick={onRestoreAll}>{i18n.diffNavigator.restoreIgnored}</button></div>
      </section>
    </div>,
    document.body
  );
}

export function LayoutNoiseModal({ open, total, items, onClose }: { open: boolean; total: number; items: LayoutNoiseItem[]; onClose: () => void }) {
  const { messages: i18n } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const visible = open && items.length > 0;
  useDialog(visible, panelRef, onClose);
  if (!visible) return null;
  return createPortal(
    <div className="layout-noise-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="layout-noise-panel" role="dialog" aria-modal="true" aria-labelledby="layout-noise-dialog-title">
        <div className="layout-noise-panel__head">
          <div className="layout-noise-panel__title-group"><strong id="layout-noise-dialog-title">{i18n.diffNavigator.layoutNoiseDetailsTitle}</strong><span className="layout-noise-total">{i18n.diffNavigator.layoutNoiseDetailsCount(total)}</span></div>
          <button type="button" className="layout-noise-panel__close" aria-label={i18n.diffNavigator.closeDetails} title={i18n.diffNavigator.closeDetails} onClick={onClose}><CloseIcon /></button>
        </div>
        <ul className="layout-noise-list">
          {items.map((item, index) => <li key={`${item.side}-${item.reason}-${index}`} className={`is-${item.side}`}><div className="layout-noise-meta"><span className={`layout-noise-badge layout-noise-side side-${item.side}`}>{i18n.diffNavigator.layoutNoiseSide[item.side]}</span><span className={`layout-noise-badge layout-noise-reason reason-${item.reason}`}>{i18n.diffNavigator.layoutNoiseReason[item.reason]}</span>{item.source === 'native' && <span className="layout-noise-badge layout-noise-source">{i18n.diffNavigator.layoutNoiseSource.native}</span>}{item.count > 1 && <span className="layout-noise-badge layout-noise-count">x{item.count}</span>}</div><p className="layout-noise-text">{item.text}</p></li>)}
        </ul>
      </section>
    </div>,
    document.body
  );
}

export function SimilarDiffModal({ open, current, items, onClose, onLocate, onIgnore }: { open: boolean; current: IgnoredDiffItem | null; items: SimilarDiffItem[]; onClose: () => void; onLocate: (id: string) => void; onIgnore: (ids: string[]) => void }) {
  const { locale, messages: i18n } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const allIds = useMemo(() => current ? [current.id, ...items.map((item) => item.id)] : [], [current, items]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = open && current !== null && items.length > 0;
  useDialog(visible, panelRef, onClose);

  useEffect(() => {
    setSelected(visible ? new Set(allIds) : new Set());
  }, [allIds, visible]);

  if (!visible || !current) return null;
  const toggle = (id: string) => setSelected((selection) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allSelected = selected.size === allIds.length;
  const formatter = new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return createPortal(
    <div className="similar-diff-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="similar-diff-panel" role="dialog" aria-modal="true" aria-labelledby="similar-diff-dialog-title">
        <div className="similar-diff-panel__head"><div className="similar-diff-panel__title"><strong id="similar-diff-dialog-title">{i18n.diffNavigator.batchProcessTitle}</strong><span>{i18n.diffNavigator.similarDiffs(items.length)}</span></div><button type="button" className="similar-diff-close" aria-label={i18n.diffNavigator.closeDetails} title={i18n.diffNavigator.closeDetails} onClick={onClose}><CloseIcon /></button></div>
        <div className="similar-diff-current"><label className="similar-diff-check"><input type="checkbox" aria-label={i18n.diffNavigator.selectCurrentDiff} checked={selected.has(current.id)} onChange={() => toggle(current.id)} /><span /></label><div className="similar-diff-body"><div className="similar-diff-meta"><span className="similar-diff-current-label">{i18n.diffNavigator.similarCurrentLabel}</span><span className="similar-diff-index">#{current.index}</span></div><Preview item={current} className="similar-diff-preview" /></div></div>
        <ul className="similar-diff-list">
          {items.map((item) => <li key={item.id}><label className="similar-diff-check"><input type="checkbox" aria-label={i18n.diffNavigator.selectSimilarDiff(item.index)} checked={selected.has(item.id)} onChange={() => toggle(item.id)} /><span /></label><div className="similar-diff-body"><div className="similar-diff-meta"><span className="similar-diff-index">#{item.index}</span><span className={`similar-diff-kind kind-${item.kind}`}>{i18n.diffNavigator.ignoredDiffKind[item.kind]}</span><span className="similar-diff-score">{i18n.diffNavigator.similarScore(formatter.format(item.similarity))}</span></div><Preview item={item} className="similar-diff-preview" /></div><button type="button" className="similar-diff-locate" onClick={() => onLocate(item.id)}>{i18n.diffNavigator.viewSimilarDiff}</button></li>)}
        </ul>
        <div className="similar-diff-footer"><span className="similar-diff-selected">{i18n.diffNavigator.selectedSimilar(selected.size, allIds.length)}</span><button type="button" className="secondary" onClick={() => setSelected(allSelected ? new Set() : new Set(allIds))}>{allSelected ? i18n.diffNavigator.clearSimilarSelection : i18n.diffNavigator.selectAllSimilar}</button><button type="button" className="primary" disabled={selected.size === 0} onClick={() => onIgnore(Array.from(selected))}>{i18n.diffNavigator.ignoreSelectedSimilar(selected.size)}</button></div>
      </section>
    </div>,
    document.body
  );
}
