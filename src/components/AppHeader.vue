<template>
  <header class="app-toolbar">
    <div class="brand-zone">
      <div class="brand-logo-glow">
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="3" y="3" width="12" height="26" rx="2" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
          <rect x="17" y="3" width="12" height="26" rx="2" fill="#f0fdf4" stroke="#10b981" stroke-width="1.5"/>
          <path d="M6 9h6M6 13h6M6 17h5" stroke="#93c5fd" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M20 9h6M20 13h6M20 17h5" stroke="#86efac" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M14 16h4" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>
          <path d="M16 14v4" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="brand-text">
        <h1>DocDiff <span class="badge-pro">Pro</span></h1>
      </div>
    </div>

    <div class="control-core">
      <div class="granularity-panel">
        <label class="panel-label" for="diff-granularity">{{ i18n.header.diffGranularityLabel }}</label>
        <div class="premium-select-wrapper">
          <select id="diff-granularity" :value="diffGranularity" class="classic-select" @change="emitGranularity">
            <option value="semantic">{{ i18n.header.granularityOptions.semantic }}</option>
            <option value="word">{{ i18n.header.granularityOptions.word }}</option>
            <option value="char">{{ i18n.header.granularityOptions.char }}</option>
          </select>
        </div>
      </div>

      <div class="panel-divider"></div>

      <div class="compare-settings" :aria-label="i18n.header.compareSettingsAria">
        <button
          type="button"
          class="capsule-node"
          :class="{ active: ignoreSpaces }"
          :title="i18n.header.ignoreSpacesTitle"
          :aria-pressed="ignoreSpaces"
          @click="toggleIgnoreSpaces"
        >
          <div class="node-pulse"></div>
          <span>{{ i18n.header.ignoreSpaces }}</span>
        </button>
        <button
          type="button"
          class="capsule-node"
          :class="{ active: ignoreFullHalfWidth }"
          :title="i18n.header.ignoreFullHalfWidthTitle"
          :aria-pressed="ignoreFullHalfWidth"
          @click="$emit('update:ignoreFullHalfWidth', !ignoreFullHalfWidth)"
        >
          <div class="node-pulse"></div>
          <span>{{ i18n.header.ignoreFullHalfWidth }}</span>
        </button>
        <button
          type="button"
          class="capsule-node"
          :class="{ active: ignoreCase }"
          :title="i18n.header.ignoreCaseTitle"
          :aria-pressed="ignoreCase"
          @click="$emit('update:ignoreCase', !ignoreCase)"
        >
          <div class="node-pulse"></div>
          <span>{{ i18n.header.ignoreCase }}</span>
        </button>
      </div>
    </div>

    <div class="language-control" :title="i18n.header.languageLabel">
      <svg class="language-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M2 12h20"></path>
        <path d="M12 2a15.3 15.3 0 0 1 0 20"></path>
        <path d="M12 2a15.3 15.3 0 0 0 0 20"></path>
      </svg>
      <div class="lang-switch" role="radiogroup" :aria-label="i18n.header.languageLabel">
        <span class="lang-switch__thumb" :class="{ 'is-second': locale === 'zh-CN' }" aria-hidden="true"></span>
        <button
          type="button"
          role="radio"
          class="lang-switch__option"
          :class="{ active: locale === 'en' }"
          :aria-checked="locale === 'en'"
          @click="setLocale('en')"
        >{{ i18n.header.english }}</button>
        <button
          type="button"
          role="radio"
          class="lang-switch__option"
          :class="{ active: locale === 'zh-CN' }"
          :aria-checked="locale === 'zh-CN'"
          @click="setLocale('zh-CN')"
        >{{ i18n.header.chinese }}</button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useI18n } from '@/i18n';
import type { DiffGranularity } from '@/types/diff';

const props = defineProps<{
  diffGranularity: DiffGranularity;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  ignoreCase: boolean;
}>();

const emit = defineEmits<{
  'update:diffGranularity': [value: DiffGranularity];
  'update:ignoreSpaces': [value: boolean];
  'update:ignoreFullHalfWidth': [value: boolean];
  'update:ignoreCase': [value: boolean];
}>();

const { locale, messages: i18n, setLocale } = useI18n();

function emitGranularity(event: Event): void {
  emit('update:diffGranularity', (event.target as HTMLSelectElement).value as DiffGranularity);
}

function toggleIgnoreSpaces(): void {
  emit('update:ignoreSpaces', !props.ignoreSpaces);
}
</script>

<style scoped>
.app-toolbar {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.02),
    0 4px 16px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 10;
  animation: toolbar-rise 0.36s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.brand-zone {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.brand-logo-glow {
  width: 36px;
  height: 36px;
  background: transparent;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.brand-logo-glow svg {
  width: 32px;
  height: 32px;
  filter: drop-shadow(0 2px 4px rgba(37, 99, 235, 0.18));
  transition: transform 0.3s ease;
  transform-origin: center;
}

.brand-logo-glow:hover svg {
  transform: translateY(-1px) scale(1.05);
}

.brand-text h1 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
}

.badge-pro {
  font-size: 0.55rem;
  background: var(--gradient-accent);
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 800;
  letter-spacing: 0;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.22);
}

.control-core {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
  justify-content: flex-end;
}

.granularity-panel {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 0 1 auto;
}

.panel-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.premium-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}

.premium-select-wrapper::after {
  content: '';
  position: absolute;
  right: 12px;
  pointer-events: none;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid var(--text-secondary);
  transition: all 0.2s;
}

.premium-select-wrapper:hover::after {
  border-top-color: var(--accent);
}

.classic-select {
  appearance: none;
  -webkit-appearance: none;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 5px 26px 5px 10px;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-secondary);
  outline: none;
  cursor: pointer;
  transition: all 0.25s ease;
  min-width: 140px;
  max-width: 240px;
}

.classic-select:hover {
  border-color: var(--accent);
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);
}

.classic-select:focus {
  border-color: var(--accent);
  background: #ffffff;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.compare-settings {
  display: flex;
  min-width: 0;
  background: rgba(241, 245, 249, 0.8);
  border-radius: 7px;
  gap: 2px;
  border: 1px solid var(--border-subtle);
}

.language-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.language-icon {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.language-control:hover .language-icon,
.language-control:focus-within .language-icon {
  color: var(--accent);
}

/* Segmented language toggle. The container intentionally has no border:
   the sliding thumb is sized at calc(50% - 3px) so it lands exactly on each
   half of the padded content box, and a border would offset that math. */
.lang-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: 8px;
  background: rgba(241, 245, 249, 0.85);
  box-shadow: inset 0 0 0 1px var(--border-subtle);
}

.lang-switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(50% - 3px);
  height: calc(100% - 6px);
  border-radius: 6px;
  background: #ffffff;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(37, 99, 235, 0.12);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.lang-switch__thumb.is-second {
  transform: translateX(100%);
}

.lang-switch__option {
  position: relative;
  z-index: 1;
  min-width: 38px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 650;
  color: var(--text-secondary);
  padding: 4px 6px;
  border-radius: 6px;
  text-align: center;
  white-space: nowrap;
  transition: color 0.2s ease;
}

.lang-switch__option:hover:not(.active) {
  color: var(--text-primary);
}

.lang-switch__option.active {
  color: var(--accent);
}

.lang-switch__option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.capsule-node {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  cursor: pointer;
  user-select: none;
  padding: 4px 10px;
  border-radius: 5px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  position: relative;
  overflow: hidden;
}

.capsule-node span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
  z-index: 1;
}

.capsule-node .node-pulse {
  position: relative;
  z-index: 1;
}

.capsule-node:hover:not(.active) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.6);
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);
}

.capsule-node:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.capsule-node:active {
  transform: translateY(0);
}

.capsule-node.active {
  background: #ffffff;
  color: var(--accent);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(37, 99, 235, 0.1);
}

.capsule-node.active::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 0%, rgba(37, 99, 235, 0.08) 45%, transparent 70%);
  transform: translateX(-120%);
  animation: button-sheen 2.4s ease-in-out infinite;
  pointer-events: none;
}

.node-pulse {
  width: 5px;
  height: 5px;
  background: var(--text-tertiary);
  border-radius: 50%;
  transition: all 0.2s ease;
}

.capsule-node.active .node-pulse {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
  animation: node-signal 1.8s ease-out infinite;
}

.panel-divider {
  height: 14px;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--border-strong), transparent);
  margin: 0 6px;
}

@media (max-width: 1200px) {
  .app-toolbar {
    padding: 6px 10px;
    gap: 8px;
    flex-wrap: wrap;
  }

  .brand-logo-glow {
    width: 32px;
    height: 32px;
  }

  .brand-logo-glow svg {
    width: 28px;
    height: 28px;
  }

  .brand-text h1 {
    font-size: 0.88rem;
  }

  .control-core {
    justify-content: flex-end;
    flex: 1 1 460px;
    width: auto;
    gap: 6px;
  }

  .granularity-panel {
    gap: 5px;
  }

  .panel-label {
    font-size: 0.65rem;
  }

  .classic-select {
    min-width: 118px;
    max-width: 180px;
    font-size: 0.65rem;
    padding: 4px 22px 4px 8px;
  }

  .capsule-node {
    padding: 3px 8px;
    font-size: 0.65rem;
    gap: 4px;
  }

  .language-icon {
    width: 13px;
    height: 13px;
  }

  .lang-switch__option {
    min-width: 40px;
    font-size: 0.65rem;
    padding: 3px 5px;
  }
}

@media (max-width: 820px) {
  .app-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 6px 8px 7px;
    gap: 6px 8px;
    align-items: center;
    max-width: 100%;
    overflow: hidden;
  }

  .brand-logo-glow {
    width: 28px;
    height: 28px;
  }

  .brand-logo-glow svg {
    width: 24px;
    height: 24px;
  }

  .brand-text h1 {
    font-size: 0.8rem;
  }

  .badge-pro {
    font-size: 0.5rem;
    padding: 1px 5px;
  }

  .control-core {
    grid-column: 1 / -1;
    order: 3;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    flex: none;
    width: 100%;
    max-width: 100%;
    gap: 6px;
    justify-content: stretch;
    overflow: hidden;
    justify-self: stretch;
  }

  .panel-divider {
    display: none;
  }

  .granularity-panel {
    justify-content: space-between;
    flex: none;
    min-width: 0;
    width: 100%;
  }

  .compare-settings {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    min-width: 0;
    justify-content: stretch;
    margin-left: 0;
  }

  .classic-select {
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  .language-control {
    order: 2;
    margin-left: auto;
  }

  .capsule-node {
    flex: none;
    justify-content: center;
    min-width: 0;
    min-height: 28px;
  }
}

@media (max-width: 520px) {
  .brand-zone {
    gap: 8px;
  }

  .control-core {
    width: 100%;
    max-width: 100%;
    justify-self: start;
  }

  .granularity-panel {
    align-items: center;
    gap: 6px;
    width: 100%;
    max-width: 100%;
  }

  .premium-select-wrapper {
    flex: 1 1 auto;
    max-width: 100%;
  }

  .compare-settings {
    gap: 1px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    max-width: 100%;
  }

  .panel-label {
    display: inline;
    font-size: 0.62rem;
  }

  .classic-select {
    width: 100%;
    min-width: 0;
    max-width: none;
    font-size: 0.62rem;
    padding: 4px 18px 4px 8px;
  }

  .premium-select-wrapper::after {
    right: 8px;
  }

  .lang-switch__option {
    min-width: 38px;
    font-size: 0.62rem;
    padding: 3px 4px;
  }

  .language-icon {
    width: 12px;
    height: 12px;
  }

  .capsule-node {
    padding: 4px 5px;
    font-size: 0.58rem;
    gap: 3px;
  }

  .node-pulse {
    width: 4px;
    height: 4px;
  }
}

@media (max-width: 380px) {
  .app-toolbar {
    padding: 5px 6px;
  }

  .brand-logo-glow {
    display: none;
  }

  .brand-text h1 {
    font-size: 0.78rem;
  }

  .language-icon {
    display: none;
  }

  .lang-switch__option {
    min-width: 34px;
    font-size: 0.6rem;
    padding: 3px 4px;
  }

  .capsule-node {
    font-size: 0.56rem;
    padding: 4px 2px;
  }

  .classic-select {
    width: 100%;
    min-width: 0;
    max-width: none;
  }
}

@keyframes toolbar-rise {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes button-sheen {
  0%, 45% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(120%);
  }
}

@keyframes node-signal {
  0% {
    box-shadow: 0 0 0 0 var(--accent-glow);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(37, 99, 235, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-toolbar,
  .capsule-node.active::after,
  .capsule-node.active .node-pulse {
    animation: none;
  }

  .brand-logo-glow svg,
  .classic-select,
  .lang-switch__thumb,
  .capsule-node,
  .node-pulse {
    transition: none;
  }

  .brand-logo-glow:hover svg,
  .capsule-node:hover:not(.active),
  .capsule-node:active {
    transform: none;
  }
}
</style>
