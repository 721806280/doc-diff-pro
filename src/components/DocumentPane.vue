<template>
  <section class="view-dock-panel" :class="sideClass">
    <div class="dock-banner">
      <div class="banner-title-area">
        <span class="bullet"></span>
        <span class="main-title">{{ title }}</span>
        <div class="file-badge-inline" v-if="fileName" :title="fileName">
          <svg class="icon-file" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          <span class="file-name-text">{{ fileName }}</span>
        </div>
        <span class="file-badge-empty" v-else>{{ emptyLabel }}</span>
      </div>
      <div class="indicator-group" v-if="fileName">
        <span class="status-chip" :class="status">{{ statusLabel }}</span>
        <div v-if="warnings.length" class="warning-chip" tabindex="0">
          <span class="status-chip warning">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            {{ warnings.length }}
          </span>
          <div class="warning-popover" role="tooltip">
            <strong>{{ i18n.documentPane.conversionWarnings }}</strong>
            <ul>
              <li v-for="(warning, index) in warnings" :key="index">{{ warning }}</li>
            </ul>
          </div>
        </div>
        <label class="reupload-trigger" :title="reuploadTitle" :aria-label="reuploadTitle">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span>{{ i18n.documentPane.changeDocument }}</span>
          <input type="file" accept=".docx" @change="handleFileInput">
        </label>
      </div>
    </div>

    <div
        class="render-viewport"
        :class="{ 'is-empty': !hasResult, 'is-dragging': dragging }"
        ref="viewport"
        @scroll="$emit('pane-scroll')"
        @click="$emit('diff-click', $event)"
        @keydown="handleKeydown"
        @mouseenter="$emit('activate')"
        @wheel.passive="$emit('activate')"
        @pointerdown="$emit('activate')"
        @touchstart.passive="$emit('activate')"
        @dragenter.prevent="setDragging(true)"
        @dragover.prevent="setDragging(true)"
        @dragleave.prevent="setDragging(false)"
        @drop.prevent="handleDrop"
    >
      <label v-if="!fileName" class="pane-upload-zone" :class="{ dragging }" :aria-label="uploadTitle">
        <div class="upload-icon-box">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <h3>{{ uploadTitle }}</h3>
        <p>{{ uploadHint }}</p>
        <small>{{ i18n.documentPane.uploadSupport }}</small>
        <input type="file" accept=".docx" @change="handleFileInput">
      </label>

      <div v-else-if="!hasResult" class="pane-waiting-zone">
        <div v-if="status === 'parsing' || comparing" class="loading-spinner-wrapper">
          <div class="spinner-large"></div>
          <p>{{ status === 'parsing' ? i18n.documentPane.parsing : i18n.documentPane.comparing }}</p>
        </div>
        <div v-else-if="status === 'error'" class="state-card error" role="alert">
          <div class="state-icon">!</div>
          <div>
            <strong>{{ i18n.documentPane.failedTitle }}</strong>
            <p>{{ errorMessage }}</p>
          </div>
        </div>
        <div v-else class="waiting-card">
          <div class="pulse-dot"></div>
          <p>
            <span>{{ waitingText }}</span>
            <small v-if="documentMetaLabel">{{ documentMetaLabel }}</small>
          </p>
        </div>
      </div>

      <div v-else class="docx-render-content" v-html="highlightedHtml"></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';

type DocumentPaneStatus = 'idle' | 'parsing' | 'ready' | 'error';

const props = defineProps<{
  sideClass: 'side-original' | 'side-revision';
  title: string;
  fileName: string;
  fileSize: number;
  textLength: number;
  imageCount: number;
  warnings: string[];
  emptyLabel: string;
  reuploadTitle: string;
  uploadTitle: string;
  uploadHint: string;
  waitingText: string;
  status: DocumentPaneStatus;
  errorMessage: string;
  hasResult: boolean;
  comparing: boolean;
  highlightedHtml: string;
}>();

const emit = defineEmits<{
  'file-select': [file: File];
  'pane-scroll': [];
  'diff-click': [event: MouseEvent];
  'diff-activate': [event: KeyboardEvent];
  activate: [];
}>();

const viewport = ref<HTMLElement | null>(null);
const dragging = ref(false);
const { locale, messages: i18n } = useI18n();

const statusLabel = computed(() => {
  const statusText = i18n.value.documentPane.status;
  switch (props.status) {
    case 'parsing': return statusText.parsing;
    case 'ready': return statusText.ready;
    case 'error': return statusText.error;
    default: return statusText.idle;
  }
});

const fileSizeLabel = computed(() => {
  if (props.fileSize <= 0) return '';
  if (props.fileSize < 1024 * 1024) return `${Math.max(1, Math.round(props.fileSize / 1024))} KB`;
  return `${(props.fileSize / 1024 / 1024).toFixed(1)} MB`;
});

const documentMetaLabel = computed(() => {
  const parts = [fileSizeLabel.value];
  if (props.textLength > 0) parts.push(i18n.value.documentPane.textLength(formatCount(props.textLength), props.textLength));
  if (props.imageCount > 0) parts.push(i18n.value.documentPane.imageCount(formatCount(props.imageCount), props.imageCount));
  return parts.filter(Boolean).join(' · ');
});

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value).format(value);
}

function handleFileInput(event: Event): void {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.files?.[0]) {
    emit('file-select', input.files[0]);
    input.value = '';
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.closest('[data-diff-id]')) {
    event.preventDefault();
    emit('diff-activate', event);
  }
}

function handleDrop(event: DragEvent): void {
  setDragging(false);
  const file = event.dataTransfer?.files?.[0];
  if (file) emit('file-select', file);
}

function setDragging(value: boolean): void {
  dragging.value = value;
}

defineExpose({ viewport });
</script>

<style scoped>
.view-dock-panel {
  --pane-accent: var(--accent);
  --pane-soft: rgba(var(--accent-rgb), 0.08);
  --pane-line: rgba(var(--accent-rgb), 0.28);

  flex: 1;
  background: var(--bg-panel);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  min-width: 0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02), 0 8px 24px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(12px);
  transition: box-shadow 0.18s ease;
}

.side-original {
  --pane-accent: var(--del-focus);
  --pane-soft: rgba(var(--del-rgb), 0.07);
  --pane-line: rgba(var(--del-rgb), 0.28);
}

.side-revision {
  --pane-accent: var(--ins-focus);
  --pane-soft: rgba(var(--ins-rgb), 0.07);
  --pane-line: rgba(var(--ins-rgb), 0.28);
}

.view-dock-panel:hover {
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.06);
}

.dock-banner {
  padding: 8px 14px;
  background: linear-gradient(90deg, var(--pane-soft) 0%, rgba(255, 255, 255, 0) 32%), linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 10;
  min-height: 42px;
  box-sizing: border-box;
}

.banner-title-area {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.dock-banner .bullet {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  flex-shrink: 0;
  background: var(--pane-accent);
}

.dock-banner .main-title {
  font-weight: 700;
  font-size: 0.75rem;
  color: var(--text-primary);
  flex-shrink: 0;
}

.file-badge-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 500;
  min-width: 0;
  flex: 1 1 auto;
  margin-left: 4px;
  transition: color 0.2s;
}

.file-badge-inline:hover { color: var(--accent); }
.icon-file { flex-shrink: 0; opacity: 0.6; }

.file-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.file-badge-empty {
  font-size: 0.76rem;
  color: var(--text-tertiary);
  margin-left: 4px;
}

.indicator-group {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
}

.render-viewport {
  overflow-y: scroll;
  overflow-x: hidden;
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
  line-height: 1.7;
  color: #1e293b;
  scroll-behavior: smooth;
  background: linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
  padding: 16px 24px;
  scrollbar-width: thin;
  scrollbar-color: #94a3b8 transparent;
}

.render-viewport::-webkit-scrollbar { width: 8px; }
.render-viewport::-webkit-scrollbar-track { background: transparent; }
.render-viewport::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #cbd5e1 0%, #94a3b8 100%); border-radius: 10px; }
.render-viewport::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #94a3b8 0%, #64748b 100%); }

.render-viewport.is-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(241, 245, 249, 0.94) 100%);
  padding: 32px;
  position: relative;
  overflow: hidden;
}

.render-viewport.is-empty::before {
  content: ''; position: absolute; inset: 18px; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 8px; pointer-events: none;
}

.render-viewport.is-dragging { outline: 2px solid var(--pane-accent); outline-offset: -6px; }
.render-viewport:not(.is-empty) { padding: 24px 32px 140px; }

.pane-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  border: 1px dashed var(--pane-line);
  border-left: 4px solid var(--pane-accent);
  border-radius: 8px;
  padding: 34px 38px;
  width: 100%;
  max-width: 600px;
  min-height: 224px;
  box-sizing: border-box;
  background: linear-gradient(90deg, var(--pane-soft) 0%, rgba(255, 255, 255, 0) 42%), linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.98) 100%);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  z-index: 1;
}

.pane-upload-zone:hover, .pane-upload-zone.dragging {
  border-color: var(--pane-accent);
  box-shadow: 0 0 0 3px var(--pane-soft), 0 8px 20px rgba(15, 23, 42, 0.06);
}
.pane-upload-zone.dragging { background: #ffffff; }
.pane-upload-zone:focus-within { outline: 3px solid var(--pane-soft); outline-offset: 3px; }

.pane-upload-zone input[type="file"], .reupload-trigger input[type="file"] {
  position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; pointer-events: none;
}

.upload-icon-box {
  width: 44px; height: 44px; border-radius: 8px; background: #ffffff; border: 1px solid var(--pane-line);
  display: flex; align-items: center; justify-content: center; color: var(--pane-accent); margin-bottom: 18px; transition: all 0.2s ease;
}

.pane-upload-zone:hover .upload-icon-box { background: var(--pane-accent); color: white; border-color: var(--pane-accent); }
.pane-upload-zone h3 { margin: 0 0 8px 0; font-size: 1rem; font-weight: 700; color: var(--text-primary); }
.pane-upload-zone p, .pane-upload-zone small { margin: 0; font-size: 0.8rem; color: var(--text-secondary); }
.pane-upload-zone small { margin-top: 10px; font-size: 0.72rem; }

.pane-waiting-zone { display: flex; justify-content: center; align-items: center; width: 100%; z-index: 1; }

.waiting-card, .state-card {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.98) 100%);
  border: 1px solid var(--border-subtle); border-radius: 8px; padding: 20px 28px;
  display: flex; align-items: center; gap: 14px; max-width: 400px; width: 90%;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03), 0 8px 24px rgba(15, 23, 42, 0.04);
}

.waiting-card p { margin: 0; font-size: 0.82rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px; }
.waiting-card small { color: var(--text-tertiary); font-size: 0.72rem; }
.pulse-dot { width: 8px; height: 8px; background: var(--accent); border-radius: 50%; flex-shrink: 0; }

.reupload-trigger {
  display: inline-flex; align-items: center; gap: 4px; min-height: 24px; box-sizing: border-box;
  background: rgba(255, 255, 255, 0.72); color: var(--text-secondary); padding: 3px 8px; border-radius: 6px;
  font-size: 0.68rem; font-weight: 700; cursor: pointer; border: 1px solid var(--border-subtle); white-space: nowrap; transition: all 0.18s ease;
}

.reupload-trigger:hover { background: var(--pane-soft); color: var(--pane-accent); border-color: var(--pane-line); box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05); }
.reupload-trigger:has(input[type="file"]:focus-visible) { border-color: var(--pane-line); box-shadow: 0 0 0 2px var(--pane-soft); }

.status-chip {
  border-radius: 999px; padding: 3px 8px; font-size: 0.68rem; font-weight: 700; white-space: nowrap;
  min-height: 24px; display: inline-flex; align-items: center; background: #f1f5f9; color: var(--text-secondary); border: 1px solid var(--border-subtle);
}
.status-chip.ready { background: rgba(var(--ins-rgb), 0.1); color: var(--ins-text); border-color: var(--ins-border); }
.status-chip.parsing { background: rgba(var(--accent-rgb), 0.1); color: var(--accent); border-color: rgba(var(--accent-rgb), 0.2); }
.status-chip.error { background: rgba(var(--del-rgb), 0.1); color: var(--del-text); border-color: var(--del-border); }

.warning-chip { position: relative; display: inline-flex; outline: none; }
.status-chip.warning { gap: 3px; background: var(--warning-soft); color: var(--warning-strong); border-color: var(--warning-border-strong); }
.warning-chip:focus-visible .status-chip.warning { box-shadow: 0 0 0 2px var(--warning-glow); }

.warning-popover {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; width: max-content; max-width: min(300px, calc(100vw - 28px)); max-height: 200px;
  overflow-y: auto; padding: 10px 12px; border: 1px solid var(--warning-border); border-radius: var(--popup-radius);
  background: rgba(255, 255, 255, 0.94); box-shadow: var(--popup-shadow-sm); opacity: 0; visibility: hidden; transform: translateY(6px);
  transition: all var(--popup-motion); pointer-events: none; backdrop-filter: blur(16px);
}

.warning-chip:hover .warning-popover, .warning-chip:focus-within .warning-popover { opacity: 1; visibility: visible; transform: translateY(0); pointer-events: auto; }
.warning-popover strong { display: block; margin-bottom: 6px; font-size: 0.76rem; font-weight: 600; color: var(--warning-strong); }
.warning-popover ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.warning-popover li { font-size: 0.72rem; line-height: 1.5; color: var(--text-secondary); word-break: break-word; position: relative; padding-left: 10px; }
.warning-popover li::before { content: "•"; color: var(--warning); position: absolute; left: 0; top: 0; font-weight: bold; }

.state-card.error { border-color: var(--del-border); background: rgba(255, 241, 242, 0.92); padding: 16px 18px; max-width: 420px; }
.state-icon { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--del-focus); color: #ffffff; font-size: 0.8rem; font-weight: 800; }
.state-card strong { color: var(--text-primary); font-size: 0.82rem; }
.state-card p { margin: 4px 0 0; color: var(--text-secondary); font-size: 0.78rem; line-height: 1.5; }

.loading-spinner-wrapper { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.loading-spinner-wrapper p { margin: 0; font-size: 0.78rem; color: var(--accent); font-weight: 600; }
.spinner-large { width: 24px; height: 24px; border: 2px solid rgba(var(--accent-rgb), 0.12); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; box-shadow: 0 0 12px var(--accent-glow); }

.docx-render-content { width: 100%; max-width: 100%; min-width: 0; color: #1e293b; overflow-wrap: anywhere; }
.docx-render-content :deep(p) { margin: 0 0 0.85rem 0; overflow-wrap: break-word; line-height: 1.75; }
.docx-render-content :deep(h1), .docx-render-content :deep(h2), .docx-render-content :deep(h3),
.docx-render-content :deep(h4), .docx-render-content :deep(h5), .docx-render-content :deep(h6) { margin: 1.2em 0 0.7em; line-height: 1.35; }
.docx-render-content :deep(ul), .docx-render-content :deep(ol) { margin: 0 0 1rem 1.5rem; padding-left: 1.2rem; }
.docx-render-content :deep(li) { margin: 0.25rem 0; }
.docx-render-content :deep(table) { border-collapse: collapse; margin: 1.2rem 0; max-width: 100%; width: 100%; }
.docx-render-content :deep(th), .docx-render-content :deep(td) { border: 1px solid var(--border-strong); padding: 8px 12px; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
.docx-render-content :deep(td p), .docx-render-content :deep(th p) { margin: 0; line-height: 1.5; }
.docx-render-content :deep(img) { max-width: 100%; height: auto; }

.docx-render-content :deep(ins), .docx-render-content :deep(del) { text-decoration: none; padding: 1px 2px; cursor: pointer; border-radius: 3px; border-bottom: 2px solid; transition: all 0.18s ease; }
.docx-render-content :deep(ins) { background: var(--gradient-ins); color: var(--ins-text); border-bottom-color: var(--ins-border); }
.docx-render-content :deep(del) { background: var(--gradient-del); color: var(--del-text); border-bottom-style: dashed; border-bottom-color: var(--del-border); }

.docx-render-content :deep(ins:hover) { background: rgba(var(--ins-rgb), 0.2); box-shadow: 0 2px 6px rgba(var(--ins-rgb), 0.26); }
.docx-render-content :deep(del:hover) { background: rgba(var(--del-rgb), 0.2); box-shadow: 0 2px 6px rgba(var(--del-rgb), 0.26); }

.docx-render-content :deep(ins:focus-visible) { outline: none; box-shadow: 0 0 0 2px var(--ins-focus); }
.docx-render-content :deep(del:focus-visible) { outline: none; box-shadow: 0 0 0 2px var(--del-focus); }

.docx-render-content :deep(ins.focus-diff), .docx-render-content :deep(del.focus-diff) { font-weight: 600; border-bottom: none; border-radius: 4px; }
.docx-render-content :deep(ins.focus-diff) { background: rgba(var(--ins-rgb), 0.24) !important; box-shadow: 0 0 0 2px var(--ins-focus), 0 4px 16px rgba(var(--ins-rgb), 0.3); }
.docx-render-content :deep(del.focus-diff) { background: rgba(var(--del-rgb), 0.22) !important; box-shadow: 0 0 0 2px var(--del-focus), 0 4px 16px rgba(var(--del-rgb), 0.3); }
.docx-render-content :deep(ins.ignored-diff), .docx-render-content :deep(del.ignored-diff) {
  opacity: 0.46; color: #64748b !important; background: rgba(241, 245, 249, 0.66) !important; border-bottom-color: rgba(100, 116, 139, 0.22) !important; box-shadow: none !important;
}
.docx-render-content :deep(ins.ignored-diff.focus-diff), .docx-render-content :deep(del.ignored-diff.focus-diff) {
  opacity: 0.76; box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.38), 0 4px 12px rgba(15, 23, 42, 0.1) !important;
}

.docx-render-content :deep(ins.table-structure-diff), .docx-render-content :deep(del.table-structure-diff) {
  position: relative; background: var(--warning-soft) !important; color: var(--warning-ink); border-bottom: 2px solid var(--warning-border-strong); cursor: pointer;
}
.docx-render-content :deep(ins.focus-diff.table-structure-diff), .docx-render-content :deep(del.focus-diff.table-structure-diff) {
  background: var(--warning-soft-strong) !important; box-shadow: 0 0 0 2px var(--warning-border), 0 5px 14px rgba(120, 53, 15, 0.12); border-bottom-color: var(--warning-border-strong);
}
.docx-render-content :deep(ins.table-structure-diff[data-table-hint])::before, .docx-render-content :deep(del.table-structure-diff[data-table-hint])::before {
  content: '?'; position: absolute; top: -9px; right: -8px; z-index: 22; display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; border-radius: 50%; color: var(--warning-ink); background: var(--warning-surface); border: 1px solid var(--warning-border-strong); font-size: 0.62rem; font-weight: 800;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 820px) {
  .view-dock-panel { height: 50%; }
  .render-viewport { padding: 12px 16px; }
  .render-viewport.is-empty { align-items: stretch; padding: 18px; }
  .render-viewport.is-empty::before { inset: 10px; }

  .pane-upload-zone { min-height: 176px; padding: 22px; }
  .upload-icon-box { width: 38px; height: 38px; }
  .pane-upload-zone h3 { font-size: 0.8rem; }
  .pane-upload-zone p { font-size: 0.68rem; }

  .render-viewport:not(.is-empty) { padding: 14px 14px 96px; }
  .docx-render-content :deep(table) { table-layout: fixed; margin: 0.85rem 0; }
  .docx-render-content :deep(th), .docx-render-content :deep(td) { padding: 6px 7px; }
}

@media (max-width: 440px) {
  .file-badge-empty, .indicator-group span:not(.warning) { display: none; }
  .docx-render-content :deep(ins.table-structure-diff), .docx-render-content :deep(del.table-structure-diff) { border-bottom-width: 1px; }
  .docx-render-content :deep(ins.table-structure-diff[data-table-hint])::before, .docx-render-content :deep(del.table-structure-diff[data-table-hint])::before {
    top: -7px; right: -6px; width: 12px; height: 12px; font-size: 0.56rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner-large { animation: none; }
  .view-dock-panel, .file-badge-inline, .pane-upload-zone, .upload-icon-box, .reupload-trigger, .warning-popover, .docx-render-content :deep(ins), .docx-render-content :deep(del) {
    transition: none !important;
  }
}
</style>
