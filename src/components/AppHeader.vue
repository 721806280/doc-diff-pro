<template>
  <header class="app-toolbar">
    <div class="brand-zone">
      <div class="brand-logo-glow">
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="3" y="3" width="12" height="26" rx="2" fill="#e0e7ff" stroke="#4f46e5" stroke-width="1.5"/>
          <rect x="17" y="3" width="12" height="26" rx="2" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>
          <path d="M6 9h6M6 13h6M6 17h5" stroke="#a5b4fc" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M20 9h6M20 13h6M20 17h5" stroke="#86efac" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M14 16h4" stroke="#4f46e5" stroke-width="2" stroke-linecap="round"/>
          <path d="M16 14v4" stroke="#4f46e5" stroke-width="2" stroke-linecap="round"/>
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
          <select
              id="diff-granularity"
              :value="diffGranularity"
              class="classic-select"
              :title="i18n.header.diffGranularityLabel"
              @change="emitGranularity"
          >
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
            @click="$emit('update:ignoreSpaces', !ignoreSpaces)"
        >
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
          <span>{{ i18n.header.ignoreFullHalfWidth }}</span>
        </button>
        <button
            type="button"
            class="capsule-node"
            :class="{ active: filterLayoutNoise }"
            :title="i18n.header.filterLayoutNoiseTitle"
            :aria-pressed="filterLayoutNoise"
            @click="$emit('update:filterLayoutNoise', !filterLayoutNoise)"
        >
          <span>{{ i18n.header.filterLayoutNoise }}</span>
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

defineProps<{
  diffGranularity: DiffGranularity;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  filterLayoutNoise: boolean;
}>();

const emit = defineEmits<{
  'update:diffGranularity': [value: DiffGranularity];
  'update:ignoreSpaces': [value: boolean];
  'update:ignoreFullHalfWidth': [value: boolean];
  'update:filterLayoutNoise': [value: boolean];
}>();

const { locale, messages: i18n, setLocale } = useI18n();

function emitGranularity(event: Event): void {
  emit('update:diffGranularity', (event.target as HTMLSelectElement).value as DiffGranularity);
}
</script>

<style scoped>
.app-toolbar {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02), 0 4px 16px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 10;
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-logo-glow svg {
  width: 32px;
  height: 32px;
  filter: drop-shadow(0 2px 4px rgba(var(--accent-rgb), 0.18));
}

.brand-text h1 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
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
  box-shadow: 0 2px 6px rgba(var(--accent-rgb), 0.22);
}

.control-core {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  justify-content: flex-end;
  min-width: 0;
}

.granularity-panel {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
}

.panel-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

.premium-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.premium-select-wrapper::after {
  content: '';
  position: absolute;
  right: 12px;
  pointer-events: none;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid var(--text-secondary);
  transition: border-top-color 0.18s ease;
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
  height: 30px;
  padding: 0 26px 0 10px;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-secondary);
  outline: none;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  min-width: 130px;
  max-width: 200px;
}

.classic-select:hover, .classic-select:focus {
  border-color: var(--accent);
  background: #ffffff;
}

.classic-select:focus {
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.compare-settings {
  display: flex;
  background: rgba(241, 245, 249, 0.8);
  border-radius: 7px;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-subtle);
  min-width: 0;
}

.capsule-node {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 5px;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.capsule-node span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.capsule-node:hover:not(.active) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(148, 163, 184, 0.26);
}

.capsule-node:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.capsule-node.active {
  background: #ffffff;
  color: var(--accent);
  border-color: rgba(var(--accent-rgb), 0.14);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(var(--accent-rgb), 0.1);
}

.panel-divider {
  height: 14px;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--border-strong), transparent);
  margin: 0 6px;
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
  transition: color 0.2s ease;
}

.language-control:hover .language-icon {
  color: var(--accent);
}

.lang-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: 8px;
  background: rgba(241, 245, 249, 0.85);
  box-shadow: inset 0 0 0 1px var(--border-subtle);
  min-height: 30px;
  padding: 2px;
}

.lang-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(50% - 2px);
  height: calc(100% - 4px);
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(var(--accent-rgb), 0.12);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.lang-switch__thumb.is-second {
  transform: translateX(100%);
}

.lang-switch__option {
  position: relative;
  z-index: 1;
  min-width: 38px;
  min-height: 26px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 650;
  color: var(--text-secondary);
  padding: 0 6px;
  border-radius: 6px;
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

@media (max-width: 820px) {
  .app-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 6px 8px;
    gap: 8px;
  }

  .control-core {
    grid-column: 1 / -1;
    order: 3;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    gap: 6px;
  }

  .panel-divider {
    display: none;
  }

  .granularity-panel {
    width: 100%;
  }

  .classic-select {
    width: 100%;
    max-width: none;
    font-size: 0.65rem;
  }

  .compare-settings {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }

  .capsule-node {
    font-size: 0.65rem;
    padding: 0 4px;
    min-height: 30px;
  }

  .language-control {
    order: 2;
    margin-left: auto;
  }
}

@media (max-width: 400px) {
  .brand-logo-glow, .language-icon {
    display: none;
  }

  .brand-text h1 {
    font-size: 0.8rem;
  }

  .capsule-node {
    font-size: 0.58rem;
    padding: 0 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-logo-glow svg, .classic-select, .lang-switch__thumb, .capsule-node {
    transition: none !important;
  }
}
</style>
