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
    case 'parsing':
      return statusText.parsing;
    case 'ready':
      return statusText.ready;
    case 'error':
      return statusText.error;
    default:
      return statusText.idle;
  }
});

const fileSizeLabel = computed(() => {
  if (props.fileSize <= 0) return '';
  if (props.fileSize < 1024 * 1024) return `${Math.max(1, Math.round(props.fileSize / 1024))} KB`;
  return `${(props.fileSize / 1024 / 1024).toFixed(1)} MB`;
});

const documentMetaLabel = computed(() => {
  const parts = [fileSizeLabel.value];

  if (props.textLength > 0) {
    parts.push(i18n.value.documentPane.textLength(formatCount(props.textLength), props.textLength));
  }

  if (props.imageCount > 0) {
    parts.push(i18n.value.documentPane.imageCount(formatCount(props.imageCount), props.imageCount));
  }

  return parts.filter(Boolean).join(' · ');
});

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value).format(value);
}

function handleFileInput(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;

  const file = input.files?.[0];
  if (file) emit('file-select', file);
  input.value = '';
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (!(event.target instanceof Element)) return;
  // Only activate when a diff highlight itself is focused — leave ordinary
  // document scroll (Space) and any other key targets alone.
  if (!event.target.closest('[data-diff-id]')) return;

  event.preventDefault();
  emit('diff-activate', event);
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
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.02),
    0 8px 24px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(12px);
  transition: box-shadow 0.3s ease, transform 0.3s ease;
  animation: dock-panel-in 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.side-revision {
  animation-delay: 0.05s;
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
  box-shadow:
    0 2px 6px rgba(15, 23, 42, 0.04),
    0 12px 32px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}

.dock-banner {
  padding: 8px 14px;
  background:
    linear-gradient(90deg, var(--pane-soft) 0%, rgba(255, 255, 255, 0) 32%),
    linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 10;
  min-height: 40px;
  box-sizing: border-box;
}

.banner-title-area {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 auto;
}

.dock-banner .bullet {
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
  box-shadow: 0 0 5px currentColor;
  animation: banner-signal 2.6s ease-out infinite;
}

.side-original .bullet {
  background: var(--pane-accent);
  color: var(--pane-accent);
}

.side-revision .bullet {
  background: var(--pane-accent);
  color: var(--pane-accent);
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
  padding: 0;
  border-radius: 0;
  font-size: 0.76rem;
  font-weight: 500;
  border: none;
  min-width: 0;
  max-width: none;
  flex: 1 1 auto;
  transition: color 0.2s;
  margin-left: 8px;
}

.file-badge-inline:hover {
  color: var(--accent);
}

.icon-file {
  flex-shrink: 0;
  opacity: 0.6;
}

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
  font-weight: 400;
  margin-left: 8px;
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
  /* Firefox: thin, themed scrollbar matching the WebKit slate ramp. */
  scrollbar-width: thin;
  scrollbar-color: #94a3b8 transparent;
}

.render-viewport.is-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(241, 245, 249, 0.94) 100%),
    repeating-linear-gradient(90deg, rgba(148, 163, 184, 0.08) 0 1px, transparent 1px 32px);
  padding: 32px;
  position: relative;
  overflow: hidden;
}

.render-viewport.is-dragging {
  outline: 2px solid var(--pane-accent);
  outline-offset: -6px;
}

.render-viewport.is-empty::before {
  content: '';
  position: absolute;
  inset: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  pointer-events: none;
}

.render-viewport::-webkit-scrollbar {
  width: 8px;
}

.render-viewport::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #cbd5e1 0%, #94a3b8 100%);
  border-radius: 10px;
}

.render-viewport::-webkit-scrollbar-track {
  background: transparent;
}

.render-viewport::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #94a3b8 0%, #64748b 100%);
}

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
  max-width: 560px;
  min-height: 224px;
  min-width: 0;
  box-sizing: border-box;
  background:
    linear-gradient(90deg, var(--pane-soft) 0%, rgba(255, 255, 255, 0) 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.98) 100%);
  cursor: pointer;
  transition:
    transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
  text-align: left;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

.pane-upload-zone::before {
  content: '';
  position: absolute;
  inset: 14px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  pointer-events: none;
  transition: border-color 0.2s ease, transform 0.24s ease;
}

.pane-upload-zone:hover {
  border-color: var(--pane-accent);
  transform: translateY(-2px);
  box-shadow:
    0 0 0 3px var(--pane-soft),
    0 12px 32px rgba(15, 23, 42, 0.08);
}

.pane-upload-zone:hover::before {
  border-color: var(--pane-line);
  transform: scale(0.985);
}

.pane-upload-zone.dragging {
  border-color: var(--pane-accent);
  background: #ffffff;
  transform: translateY(-2px) scale(1.01);
  box-shadow:
    0 12px 32px rgba(15, 23, 42, 0.08),
    0 0 0 4px var(--pane-soft);
}

.pane-upload-zone.dragging .upload-icon-box {
  animation: upload-breathe 0.9s ease-in-out infinite;
}

.pane-upload-zone:focus-within {
  outline: 3px solid var(--pane-soft);
  outline-offset: 3px;
}

.pane-upload-zone input[type="file"],
.reupload-trigger input[type="file"] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

.upload-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid var(--pane-line);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pane-accent);
  margin-bottom: 18px;
  transition: all 0.3s ease;
  position: relative;
  z-index: 1;
}

.upload-icon-box svg {
  width: 24px;
  height: 24px;
  transition: transform 0.24s ease;
}

.pane-upload-zone:hover .upload-icon-box {
  background: var(--pane-accent);
  color: white;
  box-shadow: 0 8px 18px var(--pane-soft);
  transform: translateY(-2px);
}

.pane-upload-zone:hover .upload-icon-box svg {
  transform: translateY(-1px) scale(1.04);
}

.pane-upload-zone h3 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  position: relative;
  z-index: 1;
}

.pane-upload-zone p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  position: relative;
  z-index: 1;
}

.pane-upload-zone small {
  margin-top: 10px;
  font-size: 0.72rem;
  color: var(--text-secondary);
  position: relative;
  z-index: 1;
}

.pane-waiting-zone {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  z-index: 1;
}

.waiting-card {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.98) 100%);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 20px 28px;
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 400px;
  width: 90%;
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.03),
    0 8px 24px rgba(15, 23, 42, 0.04);
  animation: state-soft-in 0.28s ease both;
}

.waiting-card p {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.waiting-card small {
  color: var(--text-tertiary);
  font-size: 0.72rem;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  animation: inline-pulse 1.5s infinite;
  flex-shrink: 0;
  box-shadow: 0 0 12px var(--accent-glow);
}

.reupload-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 23px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-secondary);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  border: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.reupload-trigger:hover {
  background: var(--pane-soft);
  color: var(--pane-accent);
  border-color: var(--pane-line);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
  transform: translateY(-1px);
}

.reupload-trigger svg {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  opacity: 0.82;
}

.reupload-trigger:focus-within {
  outline: none;
}

.reupload-trigger:has(input[type="file"]:focus-visible) {
  border-color: var(--pane-line);
  box-shadow: 0 0 0 2px var(--pane-soft);
}

.status-chip {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  background: #f1f5f9;
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}

.status-chip.ready {
  background: rgba(var(--ins-rgb), 0.1);
  color: var(--ins-text);
  border-color: var(--ins-border);
}

.status-chip.parsing {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
  border-color: rgba(var(--accent-rgb), 0.2);
}

.status-chip.error {
  background: rgba(var(--del-rgb), 0.1);
  color: var(--del-text);
  border-color: var(--del-border);
}

.warning-chip {
  position: relative;
  display: inline-flex;
  outline: none;
}

.status-chip.warning {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.3);
  cursor: default;
}

.warning-chip:focus-visible .status-chip.warning {
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.4);
}

.warning-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  width: max-content;
  max-width: 260px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 10px;
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  background: #ffffff;
  box-shadow:
    0 4px 12px rgba(15, 23, 42, 0.08),
    0 8px 24px rgba(15, 23, 42, 0.1);
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
  pointer-events: none;
}

.warning-chip:hover .warning-popover,
.warning-chip:focus-within .warning-popover {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}

.warning-popover strong {
  display: block;
  margin-bottom: 5px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #b45309;
}

.warning-popover ul {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.warning-popover li {
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--text-secondary);
  word-break: break-word;
}

.state-card {
  border-radius: 8px;
  padding: 16px 18px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 420px;
  width: 90%;
  background: #ffffff;
  border: 1px solid var(--border-subtle);
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.03),
    0 8px 24px rgba(15, 23, 42, 0.04);
  animation: state-soft-in 0.28s ease both;
}

.state-card.error {
  border-color: var(--del-border);
  background: rgba(255, 241, 242, 0.92);
}

.state-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--del-focus);
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 800;
}

.state-card strong {
  color: var(--text-primary);
  font-size: 0.82rem;
}

.state-card p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.5;
}

.loading-spinner-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  backdrop-filter: blur(1px);
  animation: state-soft-in 0.28s ease both;
}

.loading-spinner-wrapper p {
  margin: 0;
  font-size: 0.78rem;
  color: var(--accent);
  font-weight: 600;
  letter-spacing: 0;
}

.spinner-large {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(var(--accent-rgb), 0.12);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  box-shadow: 0 0 12px var(--accent-glow);
}

.render-viewport:not(.is-empty) {
  padding: 24px 32px 140px;
}

.docx-render-content {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  color: #1e293b;
  overflow-wrap: anywhere;
}

.docx-render-content :deep(p) {
  margin: 0 0 0.85rem 0;
  overflow-wrap: break-word;
  line-height: 1.75;
}

.docx-render-content :deep(h1),
.docx-render-content :deep(h2),
.docx-render-content :deep(h3),
.docx-render-content :deep(h4),
.docx-render-content :deep(h5),
.docx-render-content :deep(h6) {
  margin: 1.2em 0 0.7em;
  line-height: 1.35;
}

.docx-render-content :deep(ul),
.docx-render-content :deep(ol) {
  margin: 0 0 1rem 1.5rem;
  padding-left: 1.2rem;
}

.docx-render-content :deep(li) {
  margin: 0.25rem 0;
}

.docx-render-content :deep(table) {
  border-collapse: collapse;
  margin: 1.2rem 0;
  max-width: 100%;
  width: 100%;
}

.docx-render-content :deep(th),
.docx-render-content :deep(td) {
  border: 1px solid var(--border-strong);
  padding: 8px 12px;
  vertical-align: top;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.docx-render-content :deep(td p),
.docx-render-content :deep(th p) {
  margin: 0;
  line-height: 1.5;
}

.docx-render-content :deep(img) {
  max-width: 100%;
  height: auto;
}

.docx-render-content :deep(ins) {
  background: var(--gradient-ins);
  color: var(--ins-text);
  text-decoration: none;
  border-bottom: 2px solid var(--ins-border);
  padding: 1px 2px;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.2s ease;
}

.docx-render-content :deep(ins:hover) {
  background: linear-gradient(135deg, rgba(var(--ins-rgb), 0.2) 0%, rgba(var(--ins-rgb), 0.12) 100%);
  box-shadow: 0 2px 6px rgba(var(--ins-rgb), 0.26);
}

.docx-render-content :deep(del) {
  background: var(--gradient-del);
  color: var(--del-text);
  text-decoration: none;
  border-bottom: 2px dashed var(--del-border);
  padding: 1px 2px;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.2s ease;
}

.docx-render-content :deep(del:hover) {
  background: linear-gradient(135deg, rgba(var(--del-rgb), 0.2) 0%, rgba(var(--del-rgb), 0.12) 100%);
  box-shadow: 0 2px 6px rgba(var(--del-rgb), 0.26);
}

/* Keyboard focus ring for highlights that can receive focus. Most highlights
   are reached via the navigator's prev/next buttons (see .focus-diff below);
   table-structure highlights are independently focusable (tabindex=0). */
.docx-render-content :deep(ins:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 2px var(--ins-focus);
}

.docx-render-content :deep(del:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 2px var(--del-focus);
}

.docx-render-content :deep(ins.focus-diff) {
  background: linear-gradient(135deg, rgba(var(--ins-rgb), 0.28) 0%, rgba(var(--ins-rgb), 0.18) 100%) !important;
  box-shadow: 0 0 0 2px var(--ins-focus), 0 4px 16px rgba(var(--ins-rgb), 0.3);
  font-weight: 600;
  border-bottom: none;
  border-radius: 4px;
  animation: focus-pulse 0.5s ease;
}

.docx-render-content :deep(del.focus-diff) {
  background: linear-gradient(135deg, rgba(var(--del-rgb), 0.25) 0%, rgba(var(--del-rgb), 0.16) 100%) !important;
  box-shadow: 0 0 0 2px var(--del-focus), 0 4px 16px rgba(var(--del-rgb), 0.3);
  font-weight: 600;
  border-bottom: none;
  border-radius: 4px;
  animation: focus-pulse 0.5s ease;
}

.docx-render-content :deep(ins.table-structure-diff),
.docx-render-content :deep(del.table-structure-diff) {
  position: relative;
  background: rgba(255, 251, 235, 0.86) !important;
  color: #78350f;
  border-bottom: 2px solid rgba(217, 119, 6, 0.72);
  box-shadow: inset 0 0 0 1px rgba(217, 119, 6, 0.16);
  cursor: pointer;
}

.docx-render-content :deep(ins.focus-diff.table-structure-diff),
.docx-render-content :deep(del.focus-diff.table-structure-diff) {
  background: rgba(255, 251, 235, 0.95) !important;
  box-shadow:
    0 0 0 2px rgba(217, 119, 6, 0.28),
    0 5px 14px rgba(120, 53, 15, 0.12);
  color: #78350f;
  border-bottom: 2px solid rgba(217, 119, 6, 0.8);
}

.docx-render-content :deep(ins.table-structure-diff[data-table-hint])::before,
.docx-render-content :deep(del.table-structure-diff[data-table-hint])::before {
  content: '?';
  position: absolute;
  top: -9px;
  right: -8px;
  z-index: 22;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: #78350f;
  background: #fef3c7;
  border: 1px solid rgba(217, 119, 6, 0.54);
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 2px 6px rgba(120, 53, 15, 0.14);
  pointer-events: none;
}

@keyframes inline-pulse {
  0% { box-shadow: 0 0 0 0 var(--accent-glow); }
  70% { box-shadow: 0 0 0 10px rgba(var(--accent-rgb), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes focus-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}

@keyframes dock-panel-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes banner-signal {
  0% { box-shadow: 0 0 0 0 currentColor; }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

@keyframes upload-breathe {
  0%, 100% {
    transform: translateY(-2px) scale(1);
  }
  50% {
    transform: translateY(-5px) scale(1.04);
  }
}

@keyframes state-soft-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 820px) {
  .view-dock-panel {
    height: 50%;
  }

  .render-viewport {
    padding: 12px 16px;
    overflow-x: hidden;
  }

  .render-viewport.is-empty {
    padding: 18px;
  }

  .render-viewport.is-empty::before {
    inset: 10px;
  }

  .pane-upload-zone {
    min-height: 176px;
    padding: 22px;
    width: 100%;
    max-width: 100%;
  }

  .upload-icon-box {
    width: 38px;
    height: 38px;
  }

  .pane-upload-zone h3 {
    font-size: 0.8rem;
  }

  .pane-upload-zone p {
    font-size: 0.68rem;
  }

  .render-viewport:not(.is-empty) {
    padding: 14px 14px 96px;
  }

  .docx-render-content :deep(table) {
    table-layout: fixed;
    margin: 0.85rem 0;
  }

  .docx-render-content :deep(th),
  .docx-render-content :deep(td) {
    padding: 6px 7px;
  }
}

@media (max-width: 640px) {
  .docx-render-content :deep(ins.table-structure-diff),
  .docx-render-content :deep(del.table-structure-diff) {
    border-bottom-width: 1px;
    box-shadow: none;
  }

  .docx-render-content :deep(ins.table-structure-diff[data-table-hint])::before,
  .docx-render-content :deep(del.table-structure-diff[data-table-hint])::before {
    top: -7px;
    right: -6px;
    width: 12px;
    height: 12px;
    font-size: 0.56rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .view-dock-panel,
  .dock-banner .bullet,
  .pane-upload-zone.dragging .upload-icon-box,
  .waiting-card,
  .state-card,
  .loading-spinner-wrapper,
  .pulse-dot,
  .spinner-large,
  .docx-render-content :deep(ins.focus-diff),
  .docx-render-content :deep(del.focus-diff) {
    animation: none;
  }

  .view-dock-panel,
  .file-badge-inline,
  .pane-upload-zone,
  .pane-upload-zone::before,
  .upload-icon-box,
  .upload-icon-box svg,
  .reupload-trigger,
  .warning-popover,
  .docx-render-content :deep(ins),
  .docx-render-content :deep(del) {
    transition: none;
  }

  .view-dock-panel:hover,
  .pane-upload-zone:hover,
  .pane-upload-zone.dragging,
  .pane-upload-zone:hover::before,
  .pane-upload-zone:hover .upload-icon-box,
  .pane-upload-zone:hover .upload-icon-box svg,
  .reupload-trigger:hover {
    transform: none;
  }
}
</style>
