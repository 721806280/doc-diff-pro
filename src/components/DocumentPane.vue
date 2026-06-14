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
            <strong>转换提示</strong>
            <ul>
              <li v-for="(warning, index) in warnings" :key="index">{{ warning }}</li>
            </ul>
          </div>
        </div>
        <label class="reupload-trigger" :title="reuploadTitle" :aria-label="reuploadTitle">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span>更换文档</span>
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
      @mouseenter="$emit('activate')"
      @wheel.passive="$emit('activate')"
      @pointerdown="$emit('activate')"
      @touchstart.passive="$emit('activate')"
      @dragenter.prevent="setDragging(true)"
      @dragover.prevent="setDragging(true)"
      @dragleave.prevent="setDragging(false)"
      @drop.prevent="handleDrop"
    >
      <label v-if="!fileName" class="pane-upload-zone" :class="{ dragging }">
        <div class="upload-icon-box">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <h3>{{ uploadTitle }}</h3>
        <p>{{ uploadHint }}</p>
        <small>支持点击选择或拖拽上传</small>
        <input type="file" accept=".docx" @change="handleFileInput">
      </label>

      <div v-else-if="!hasResult" class="pane-waiting-zone">
        <div v-if="status === 'parsing' || comparing" class="loading-spinner-wrapper">
          <div class="spinner-large"></div>
          <p>{{ status === 'parsing' ? '正在解析文档...' : '正在分析文档差异...' }}</p>
        </div>
        <div v-else-if="status === 'error'" class="state-card error" role="alert">
          <div class="state-icon">!</div>
          <div>
            <strong>文档处理失败</strong>
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
  activate: [];
}>();

const viewport = ref<HTMLElement | null>(null);
const dragging = ref(false);

const statusLabel = computed(() => {
  switch (props.status) {
    case 'parsing':
      return '解析中';
    case 'ready':
      return '已就绪';
    case 'error':
      return '处理失败';
    default:
      return '待上传';
  }
});

const fileSizeLabel = computed(() => {
  if (props.fileSize <= 0) return '';
  if (props.fileSize < 1024 * 1024) return `${Math.max(1, Math.round(props.fileSize / 1024))} KB`;
  return `${(props.fileSize / 1024 / 1024).toFixed(1)} MB`;
});

const documentMetaLabel = computed(() => {
  const parts = [fileSizeLabel.value];

  if (props.textLength > 0) parts.push(`${formatCount(props.textLength)} 字`);
  if (props.imageCount > 0) parts.push(`${props.imageCount} 张图`);
  return parts.filter(Boolean).join(' · ');
});

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function handleFileInput(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;

  const file = input.files?.[0];
  if (file) emit('file-select', file);
  input.value = '';
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
  transition: box-shadow 0.3s ease;
}

.view-dock-panel:hover {
  box-shadow:
    0 2px 6px rgba(15, 23, 42, 0.04),
    0 12px 32px rgba(15, 23, 42, 0.06);
}

.dock-banner {
  padding: 8px 14px;
  background: linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
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
}

.side-original .bullet {
  background: var(--del-focus);
  color: var(--del-focus);
}

.side-revision .bullet {
  background: var(--ins-focus);
  color: var(--ins-focus);
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
  overflow-x: auto;
  flex: 1;
  font-size: 0.88rem;
  line-height: 1.7;
  color: #1e293b;
  scroll-behavior: smooth;
  background: linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
  padding: 16px 24px;
}

.render-viewport.is-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #fafbfc 0%, #f1f5f9 100%);
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.render-viewport.is-dragging {
  outline: 2px solid var(--accent);
  outline-offset: -6px;
}

.render-viewport.is-empty::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(ellipse 60% 40% at 50% 30%, rgba(99, 102, 241, 0.04) 0%, transparent 70%),
    radial-gradient(ellipse 50% 30% at 30% 70%, rgba(139, 92, 246, 0.03) 0%, transparent 60%);
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
  align-items: center;
  justify-content: center;
  border: 2px dashed rgba(99, 102, 241, 0.25);
  border-radius: 16px;
  padding: 40px 48px;
  width: 100%;
  max-width: 340px;
  box-sizing: border-box;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.95) 100%);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

.pane-upload-zone::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: var(--gradient-accent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.pane-upload-zone:hover {
  border-color: transparent;
  transform: translateY(-4px);
  box-shadow:
    0 12px 32px rgba(99, 102, 241, 0.15),
    0 4px 12px rgba(99, 102, 241, 0.1);
}

.pane-upload-zone.dragging {
  border-color: var(--accent);
  background: #ffffff;
  box-shadow:
    0 12px 32px rgba(99, 102, 241, 0.16),
    0 0 0 4px var(--accent-glow);
}

.pane-upload-zone:hover::before {
  opacity: 0.06;
}

.pane-upload-zone input[type="file"] {
  display: none;
}

.upload-icon-box {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(180deg, #eef2ff 0%, #e0e7ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  margin-bottom: 18px;
  transition: all 0.3s ease;
  position: relative;
  z-index: 1;
}

.upload-icon-box svg {
  width: 28px;
  height: 28px;
}

.pane-upload-zone:hover .upload-icon-box {
  background: var(--gradient-accent);
  color: white;
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
  transform: scale(1.1);
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
  color: var(--text-tertiary);
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: linear-gradient(180deg, #f1f5f9 0%, #e8ecf0 100%);
  color: var(--text-secondary);
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  border: 1px solid transparent;
  white-space: nowrap;
}

.reupload-trigger:hover {
  background: linear-gradient(180deg, #eef2ff 0%, #e0e7ff 100%);
  color: var(--accent);
  border-color: rgba(99, 102, 241, 0.25);
  box-shadow: 0 2px 8px var(--accent-glow);
}

.reupload-trigger span {
  display: none;
}

.reupload-trigger input[type="file"] {
  display: none;
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
  background: rgba(16, 185, 129, 0.1);
  color: var(--ins-text);
  border-color: var(--ins-border);
}

.status-chip.parsing {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent);
  border-color: rgba(99, 102, 241, 0.2);
}

.status-chip.error {
  background: rgba(244, 63, 94, 0.1);
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
  border: 2px solid rgba(99, 102, 241, 0.12);
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
  color: #1e293b;
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
  width: 100% !important;
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
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(52, 211, 153, 0.15) 100%);
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
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
  background: linear-gradient(135deg, rgba(244, 63, 94, 0.2) 0%, rgba(251, 113, 133, 0.15) 100%);
  box-shadow: 0 2px 6px rgba(244, 63, 94, 0.3);
}

.docx-render-content :deep(ins.focus-diff) {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.28) 0%, rgba(52, 211, 153, 0.22) 100%) !important;
  box-shadow: 0 0 0 2px var(--ins-focus), 0 4px 16px rgba(16, 185, 129, 0.35);
  font-weight: 600;
  border-bottom: none;
  border-radius: 4px;
  animation: focus-pulse 0.5s ease;
}

.docx-render-content :deep(del.focus-diff) {
  background: linear-gradient(135deg, rgba(244, 63, 94, 0.25) 0%, rgba(251, 113, 133, 0.2) 100%) !important;
  box-shadow: 0 0 0 2px var(--del-focus), 0 4px 16px rgba(244, 63, 94, 0.35);
  font-weight: 600;
  border-bottom: none;
  border-radius: 4px;
  animation: focus-pulse 0.5s ease;
}

@keyframes inline-pulse {
  0% { box-shadow: 0 0 0 0 var(--accent-glow); }
  70% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
  100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes focus-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}

@media (max-width: 820px) {
  .view-dock-panel {
    height: 50%;
  }

  .render-viewport {
    padding: 12px 16px;
  }

  .pane-upload-zone {
    padding: 18px;
    max-width: 100%;
  }

  .upload-icon-box {
    width: 40px;
    height: 40px;
  }

  .pane-upload-zone h3 {
    font-size: 0.8rem;
  }

  .pane-upload-zone p {
    font-size: 0.68rem;
  }
}
</style>
