<template>
  <header class="app-toolbar" :class="{ 'app-toolbar--settings-open': isSettingsPanelOpen }">
    <h1 class="visually-hidden">DocDiff Pro</h1>
    <button
        type="button"
        class="brand-zone"
        :class="{ 'is-resetting': brandResetting }"
        :disabled="!canResetDocuments"
        :aria-label="canResetDocuments ? i18n.header.newComparisonTitle : 'DocDiff Pro'"
        :title="canResetDocuments ? i18n.header.newComparisonTitle : undefined"
        @click="resetFromBrand"
    >
      <span class="brand-logo-glow" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <g class="brand-logo__document brand-logo__document--accent">
            <rect class="brand-logo__page brand-logo__page--accent" x="3" y="3" width="12" height="26" rx="2" stroke-width="1.5"/>
            <path class="brand-logo__line brand-logo__line--accent" d="M6 9h6M6 13h6M6 17h5" stroke-width="1.5" stroke-linecap="round"/>
          </g>
          <g class="brand-logo__document brand-logo__document--revision">
            <rect class="brand-logo__page brand-logo__page--revision" x="17" y="3" width="12" height="26" rx="2" stroke-width="1.5"/>
            <path class="brand-logo__line brand-logo__line--revision" d="M20 9h6M20 13h6M20 17h5" stroke-width="1.5" stroke-linecap="round"/>
          </g>
          <g class="brand-logo__plus">
            <path d="M14 16h4" stroke-width="2" stroke-linecap="round"/>
            <path d="M16 14v4" stroke-width="2" stroke-linecap="round"/>
          </g>
        </svg>
      </span>
      <span class="brand-text" aria-hidden="true">
        <span class="brand-title">DocDiff <span class="badge-pro">Pro</span></span>
      </span>
    </button>

    <div ref="settingsControlRef" class="header-actions">
      <button
          v-if="canSwapDocuments"
          type="button"
          class="toolbar-icon-button swap-documents-trigger"
          :aria-label="i18n.header.swapDocumentsTitle"
          :title="i18n.header.swapDocumentsTitle"
          @click="$emit('swap-documents')"
      >
        <svg class="session-action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9">
          <path d="M7 7h11"></path>
          <path d="M15 4l3 3-3 3"></path>
          <path d="M17 17H6"></path>
          <path d="M9 14l-3 3 3 3"></path>
        </svg>
      </button>

      <div class="settings-control" :class="{ 'settings-control--open': isSettingsPanelOpen }">
        <button
            type="button"
            class="toolbar-icon-button settings-trigger"
            :class="{ active: isSettingsPanelOpen }"
            :aria-label="i18n.header.compareSettingsAria"
            :aria-expanded="isSettingsPanelOpen"
            aria-haspopup="dialog"
            :title="i18n.header.compareSettingsAria"
            @click="toggleSettingsPanel"
        >
          <svg class="settings-sliders-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.05">
            <path d="M4.5 8h15"></path>
            <circle cx="9" cy="8" r="2.4" fill="var(--bg-panel-solid)"></circle>
            <path d="M4.5 16h15"></path>
            <circle cx="15" cy="16" r="2.4" fill="var(--bg-panel-solid)"></circle>
          </svg>
        </button>

        <div
            v-if="isSettingsPanelOpen"
            ref="settingsPopoverRef"
            class="settings-popover"
            role="dialog"
            aria-labelledby="compare-settings-title"
        >
          <div class="settings-popover__header">
            <div class="settings-popover__title">
              <span class="settings-popover__mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 4l5 5"></path>
                  <path d="M13 6l5 5"></path>
                  <path d="M4 20l10.5-10.5"></path>
                </svg>
              </span>
              <span id="compare-settings-title">{{ i18n.header.compareSettingsAria }}</span>
            </div>
            <button
                v-if="!isUsingDefaultSettings"
                type="button"
                class="settings-reset-button"
                :aria-label="i18n.header.resetSettingsTitle"
                :title="i18n.header.resetSettingsTitle"
                @click="resetSettings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25">
                <path d="M7.2 7.8A6.9 6.9 0 1 1 5.9 13"></path>
                <path d="M7.2 4.7v3.2H4"></path>
                <path d="M12 8.9v3.8l2.5 1.5"></path>
              </svg>
              <span>{{ i18n.header.resetSettingsLabel }}</span>
            </button>
          </div>

          <div class="settings-section">
            <div class="settings-section__title">{{ i18n.header.diffGranularityLabel }}</div>
            <div class="granularity-segmented" role="radiogroup" :aria-label="i18n.header.diffGranularityLabel">
              <button
                  type="button"
                  role="radio"
                  class="granularity-segmented__option"
                  :class="{ active: diffGranularity === 'semantic' }"
                  :aria-checked="diffGranularity === 'semantic'"
                  :title="i18n.header.granularityOptions.semantic"
                  @click="updateGranularity('semantic')"
              >
                {{ i18n.header.granularityCompactOptions.semantic }}
              </button>
              <button
                  type="button"
                  role="radio"
                  class="granularity-segmented__option"
                  :class="{ active: diffGranularity === 'word' }"
                  :aria-checked="diffGranularity === 'word'"
                  :title="i18n.header.granularityOptions.word"
                  @click="updateGranularity('word')"
              >
                {{ i18n.header.granularityCompactOptions.word }}
              </button>
              <button
                  type="button"
                  role="radio"
                  class="granularity-segmented__option"
                  :class="{ active: diffGranularity === 'char' }"
                  :aria-checked="diffGranularity === 'char'"
                  :title="i18n.header.granularityOptions.char"
                  @click="updateGranularity('char')"
              >
                {{ i18n.header.granularityCompactOptions.char }}
              </button>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section__title">{{ i18n.header.compareRulesLabel }}</div>
            <div class="settings-toggle-list settings-toggle-list--primary" :aria-label="i18n.header.compareRulesLabel">
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: ignoreSpaces }"
                  :title="i18n.header.ignoreSpacesTitle"
                  :aria-pressed="ignoreSpaces"
                  @click="$emit('update:ignoreSpaces', !ignoreSpaces)"
              >
                <span class="settings-toggle__label">{{ i18n.header.ignoreSpaces }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: ignoreFullHalfWidth }"
                  :title="i18n.header.ignoreFullHalfWidthTitle"
                  :aria-pressed="ignoreFullHalfWidth"
                  @click="$emit('update:ignoreFullHalfWidth', !ignoreFullHalfWidth)"
              >
                <span class="settings-toggle__label">{{ i18n.header.ignoreFullHalfWidth }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: filterLayoutNoise }"
                  :title="i18n.header.filterLayoutNoiseTitle"
                  :aria-pressed="filterLayoutNoise"
                  @click="$emit('update:filterLayoutNoise', !filterLayoutNoise)"
              >
                <span class="settings-toggle__label">{{ i18n.header.filterLayoutNoise }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
            </div>
          </div>

          <div class="settings-section settings-section--view">
            <div class="settings-section__title">{{ i18n.header.viewOptionsLabel }}</div>
            <div
                class="theme-color-control"
                role="radiogroup"
                :aria-label="i18n.header.themeColorLabel"
            >
              <span>{{ i18n.header.themeColorLabel }}</span>
              <div class="theme-color-swatches">
                <button
                    v-for="option in themeColorOptions"
                    :key="option"
                    type="button"
                    role="radio"
                    class="theme-color-swatch"
                    :class="{ active: themeColor === option }"
                    :style="getThemeSwatchStyle(option)"
                    :aria-checked="themeColor === option"
                    :aria-label="i18n.header.themeColorOptions[option]"
                    :title="i18n.header.themeColorOptions[option]"
                    @click="updateThemeColor(option)"
                >
                  <span class="theme-color-swatch__dot" aria-hidden="true"></span>
                </button>
              </div>
            </div>
            <div class="settings-toggle-list settings-toggle-list--plain" :aria-label="i18n.header.viewOptionsLabel">
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: syncScroll }"
                  :title="i18n.header.syncScrollTitle"
                  :aria-pressed="syncScroll"
                  @click="$emit('update:syncScroll', !syncScroll)"
              >
                <span class="settings-toggle__label">{{ i18n.header.syncScroll }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: showReportExport }"
                  :title="i18n.header.showReportExportTitle"
                  :aria-pressed="showReportExport"
                  @click="$emit('update:showReportExport', !showReportExport)"
              >
                <span class="settings-toggle__label">{{ i18n.header.showReportExport }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: showTableHints }"
                  :title="i18n.header.showTableHintsTitle"
                  :aria-pressed="showTableHints"
                  @click="$emit('update:showTableHints', !showTableHints)"
              >
                <span class="settings-toggle__label">{{ i18n.header.showTableHints }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: enableDiffIgnore }"
                  :title="i18n.header.enableDiffIgnoreTitle"
                  :aria-pressed="enableDiffIgnore"
                  @click="$emit('update:enableDiffIgnore', !enableDiffIgnore)"
              >
                <span class="settings-toggle__label">{{ i18n.header.enableDiffIgnore }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <template v-if="enableDiffIgnore">
                <button
                    type="button"
                    class="settings-toggle"
                    :class="{ active: enableSimilarDiffs }"
                    :title="i18n.header.enableSimilarDiffsTitle"
                    :aria-pressed="enableSimilarDiffs"
                    @click="$emit('update:enableSimilarDiffs', !enableSimilarDiffs)"
                >
                  <span class="settings-toggle__label">{{ i18n.header.enableSimilarDiffs }}</span>
                  <span class="settings-toggle__switch" aria-hidden="true">
                    <span class="settings-toggle__switch-thumb"></span>
                  </span>
                </button>
                <div
                    v-if="enableSimilarDiffs"
                    class="similar-level-control"
                    role="radiogroup"
                    :aria-label="i18n.header.similarDiffLevelLabel"
                >
                  <span>{{ i18n.header.similarDiffLevelLabel }}</span>
                  <div class="similar-level-segmented">
                    <button
                        v-for="option in similarDiffLevelOptions"
                        :key="option"
                        type="button"
                        role="radio"
                        :aria-checked="similarDiffLevel === option"
                        :class="{ active: similarDiffLevel === option }"
                        :title="i18n.header.similarDiffLevelTitle[option]"
                        @click="updateSimilarDiffLevel(option)"
                    >
                      {{ i18n.header.similarDiffLevel[option] }}
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <button
          type="button"
          class="toolbar-icon-button appearance-trigger"
          :class="{ active: appearanceMode === 'dark' }"
          :aria-label="appearanceToggleLabel"
          :title="appearanceToggleLabel"
          @click="toggleAppearanceShortcut"
      >
        <svg
            v-if="appearanceMode === 'dark'"
            class="appearance-icon appearance-icon--sun"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="1.85"
        >
          <circle cx="12" cy="12" r="4.2"></circle>
          <path d="M12 3.2v2.1M12 18.7v2.1M4.2 12h2.1M17.7 12h2.1M6.45 6.45l1.5 1.5M16.05 16.05l1.5 1.5M17.55 6.45l-1.5 1.5M7.95 16.05l-1.5 1.5"></path>
        </svg>
        <svg
            v-else
            class="appearance-icon appearance-icon--moon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
        >
          <path d="M20.45 14.65A8.2 8.2 0 0 1 9.35 3.55A8.65 8.65 0 1 0 20.45 14.65z"></path>
        </svg>
      </button>

      <button
          type="button"
          class="toolbar-icon-button language-trigger"
          :aria-label="`${i18n.header.languageLabel}: ${locale === 'en' ? i18n.header.chinese : i18n.header.english}`"
          :title="`${i18n.header.languageLabel}: ${locale === 'en' ? i18n.header.chinese : i18n.header.english}`"
          @click="toggleLocale"
      >
        <svg
            class="language-icon"
            :class="{ 'is-en': locale === 'en' }"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
        >
          <text class="language-icon__symbol language-icon__symbol--zh" x="1.2" y="12">中</text>
          <path class="language-icon__corner language-icon__corner--top" d="M16 4L19.5 4Q21 4 21 5.5L21 8"></path>
          <text class="language-icon__symbol language-icon__symbol--en" x="12.2" y="22">A</text>
          <path class="language-icon__corner" d="M8 20L4.5 20Q3 20 3 18.5L3 16"></path>
        </svg>
      </button>

      <a
          v-if="showGithubLink"
          class="toolbar-icon-button github-link"
          :href="githubRepositoryUrl"
          :aria-label="i18n.header.githubLabel"
          :title="i18n.header.githubLabel"
          target="_blank"
          rel="noreferrer"
          @click="closeSettingsPanel()"
      >
        <svg class="github-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.85">
          <path
              d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"
          />
        </svg>
      </a>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import type { DiffGranularity, SimilarDiffLevel } from '@/types/diff';
import { DEFAULT_USER_SETTINGS } from '@/config/userSettings';
import { createFocusTrap } from '@/utils/focusTrap';
import { getThemeSwatchStyle, THEME_COLORS, type AppearanceMode, type ThemeColor } from '@/utils/themeColor';

const props = defineProps<{
  canSwapDocuments: boolean;
  canResetDocuments: boolean;
  showGithubLink: boolean;
  diffGranularity: DiffGranularity;
  themeColor: ThemeColor;
  appearanceMode: AppearanceMode;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  filterLayoutNoise: boolean;
  syncScroll: boolean;
  showReportExport: boolean;
  showTableHints: boolean;
  enableDiffIgnore: boolean;
  enableSimilarDiffs: boolean;
  similarDiffLevel: SimilarDiffLevel;
}>();

const emit = defineEmits<{
  'update:diffGranularity': [value: DiffGranularity];
  'update:themeColor': [value: ThemeColor];
  'update:appearanceMode': [value: AppearanceMode];
  'update:ignoreSpaces': [value: boolean];
  'update:ignoreFullHalfWidth': [value: boolean];
  'update:filterLayoutNoise': [value: boolean];
  'update:syncScroll': [value: boolean];
  'update:showReportExport': [value: boolean];
  'update:showTableHints': [value: boolean];
  'update:enableDiffIgnore': [value: boolean];
  'update:enableSimilarDiffs': [value: boolean];
  'update:similarDiffLevel': [value: SimilarDiffLevel];
  'swap-documents': [];
  'reset-documents': [];
  'settings-reset': [];
  'settings-open-change': [value: boolean];
}>();

const { locale, messages: i18n, setLocale } = useI18n();
const isSettingsPanelOpen = ref(false);
const settingsControlRef = ref<HTMLElement | null>(null);
const settingsPopoverRef = ref<HTMLElement | null>(null);
const brandResetting = ref(false);
const githubRepositoryUrl = 'https://github.com/721806280/doc-diff-vision';
const similarDiffLevelOptions: SimilarDiffLevel[] = ['strict', 'balanced', 'loose'];
const themeColorOptions: ThemeColor[] = [...THEME_COLORS];
const settingsFocusTrap = createFocusTrap();
let restoreSettingsFocus = true;
let brandResetTimer: number | null = null;
const appearanceToggleLabel = computed(() =>
  props.appearanceMode === 'dark'
    ? i18n.value.header.switchToLightMode
    : i18n.value.header.switchToNightMode
);
const isUsingDefaultSettings = computed(() =>
  props.diffGranularity === DEFAULT_USER_SETTINGS.diffGranularity &&
  props.themeColor === DEFAULT_USER_SETTINGS.themeColor &&
  props.appearanceMode === DEFAULT_USER_SETTINGS.appearanceMode &&
  props.ignoreSpaces === DEFAULT_USER_SETTINGS.ignoreSpaces &&
  props.ignoreFullHalfWidth === DEFAULT_USER_SETTINGS.ignoreFullHalfWidth &&
  props.filterLayoutNoise === DEFAULT_USER_SETTINGS.filterLayoutNoise &&
  props.syncScroll === DEFAULT_USER_SETTINGS.syncScroll &&
  props.showReportExport === DEFAULT_USER_SETTINGS.showReportExport &&
  props.showTableHints === DEFAULT_USER_SETTINGS.showTableHints &&
  props.enableDiffIgnore === DEFAULT_USER_SETTINGS.enableDiffIgnore &&
  props.enableSimilarDiffs === DEFAULT_USER_SETTINGS.enableSimilarDiffs &&
  props.similarDiffLevel === DEFAULT_USER_SETTINGS.similarDiffLevel
);

watch(isSettingsPanelOpen, async (open) => {
  emit('settings-open-change', open);

  if (open) {
    restoreSettingsFocus = true;
    await nextTick();
    if (isSettingsPanelOpen.value) settingsFocusTrap.activate(settingsPopoverRef.value);
    return;
  }

  settingsFocusTrap.deactivate({ restoreFocus: restoreSettingsFocus });
  restoreSettingsFocus = true;
});

function updateGranularity(value: DiffGranularity): void {
  emit('update:diffGranularity', value);
}

function updateThemeColor(value: ThemeColor): void {
  emit('update:themeColor', value);
}

function toggleAppearanceMode(): void {
  emit('update:appearanceMode', props.appearanceMode === 'dark' ? 'light' : 'dark');
}

function toggleAppearanceShortcut(): void {
  closeSettingsPanel({ restoreFocus: false });
  toggleAppearanceMode();
}

function updateSimilarDiffLevel(value: SimilarDiffLevel): void {
  emit('update:similarDiffLevel', value);
}

function resetSettings(): void {
  if (isUsingDefaultSettings.value) return;

  emit('update:diffGranularity', DEFAULT_USER_SETTINGS.diffGranularity);
  emit('update:themeColor', DEFAULT_USER_SETTINGS.themeColor);
  emit('update:appearanceMode', DEFAULT_USER_SETTINGS.appearanceMode);
  emit('update:ignoreSpaces', DEFAULT_USER_SETTINGS.ignoreSpaces);
  emit('update:ignoreFullHalfWidth', DEFAULT_USER_SETTINGS.ignoreFullHalfWidth);
  emit('update:filterLayoutNoise', DEFAULT_USER_SETTINGS.filterLayoutNoise);
  emit('update:syncScroll', DEFAULT_USER_SETTINGS.syncScroll);
  emit('update:showReportExport', DEFAULT_USER_SETTINGS.showReportExport);
  emit('update:showTableHints', DEFAULT_USER_SETTINGS.showTableHints);
  emit('update:enableDiffIgnore', DEFAULT_USER_SETTINGS.enableDiffIgnore);
  emit('update:enableSimilarDiffs', DEFAULT_USER_SETTINGS.enableSimilarDiffs);
  emit('update:similarDiffLevel', DEFAULT_USER_SETTINGS.similarDiffLevel);
  emit('settings-reset');
}

function toggleLocale(): void {
  closeSettingsPanel({ restoreFocus: false });
  setLocale(locale.value === 'en' ? 'zh-CN' : 'en');
}

function toggleSettingsPanel(): void {
  if (isSettingsPanelOpen.value) {
    closeSettingsPanel();
    return;
  }

  isSettingsPanelOpen.value = true;
}

function closeSettingsPanel(options: { restoreFocus?: boolean } = {}): void {
  restoreSettingsFocus = options.restoreFocus !== false;
  isSettingsPanelOpen.value = false;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isSettingsPanelOpen.value) return;
  const target = event.target;
  if (target instanceof Node && !settingsControlRef.value?.contains(target)) {
    closeSettingsPanel({ restoreFocus: false });
  }
}

function handleDocumentKeyDown(event: KeyboardEvent): void {
  if (!isSettingsPanelOpen.value) return;

  if (event.key === 'Escape') {
    closeSettingsPanel();
    return;
  }

  settingsFocusTrap.handleKeydown(event);
}

function resetFromBrand(): void {
  if (!props.canResetDocuments || brandResetTimer !== null) return;

  closeSettingsPanel({ restoreFocus: false });
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    emit('reset-documents');
    return;
  }

  brandResetting.value = true;
  brandResetTimer = window.setTimeout(() => {
    brandResetting.value = false;
    brandResetTimer = null;
    emit('reset-documents');
  }, 240);
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeyDown);
  if (brandResetTimer !== null) window.clearTimeout(brandResetTimer);
  settingsFocusTrap.deactivate({ restoreFocus: false });
});
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
  box-shadow: var(--shadow-panel);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 10;
}

.app-toolbar--settings-open {
  z-index: var(--z-settings-popover);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.brand-zone {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.brand-zone:disabled {
  cursor: default;
}

.brand-zone:focus-visible {
  outline: none;
  border-radius: 7px;
  box-shadow: 0 0 0 3px var(--accent-glow);
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

.brand-logo__document,
.brand-logo__plus {
  transform-box: fill-box;
  transform-origin: center;
}

.brand-zone:not(:disabled):hover .brand-logo-glow {
  transform: translateY(-1px);
}

.brand-zone.is-resetting .brand-logo__document--accent {
  animation: brand-reset-accent 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.brand-zone.is-resetting .brand-logo__document--revision {
  animation: brand-reset-revision 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.brand-zone.is-resetting .brand-logo__plus {
  animation: brand-reset-plus 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes brand-reset-accent {
  50% { transform: translateX(3px); }
}

@keyframes brand-reset-revision {
  50% { transform: translateX(-3px); }
}

@keyframes brand-reset-plus {
  50% { transform: rotate(90deg) scale(0.84); }
}

.brand-logo__page--accent {
  fill: var(--accent-soft-strong);
  stroke: var(--accent);
}

.brand-logo__page--revision {
  fill: var(--brand-revision-fill);
  stroke: var(--brand-revision-stroke);
}

.brand-logo__line--accent {
  stroke: rgba(var(--accent-rgb), 0.48);
}

.brand-logo__line--revision {
  stroke: var(--brand-revision-line);
}

.brand-logo__plus {
  stroke: var(--accent);
}

.brand-title {
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

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  margin-left: auto;
  position: relative;
}

.settings-control {
  position: relative;
}

.settings-control--open {
  z-index: var(--z-settings-popover);
}

.toolbar-icon-button {
  position: relative;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.toolbar-icon-button::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 3px;
  width: 12px;
  height: 2px;
  border-radius: 999px;
  background: var(--accent);
  opacity: 0;
  transform: translateX(-50%) scaleX(0.45);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.toolbar-icon-button:hover,
.appearance-trigger.active,
.settings-trigger.active {
  color: var(--accent);
}

.settings-trigger.active::after {
  opacity: 1;
  transform: translateX(-50%) scaleX(1);
}

.toolbar-icon-button:hover {
  transform: translateY(-1px);
}

.toolbar-icon-button:focus-visible,
.granularity-segmented__option:focus-visible,
.settings-toggle:focus-visible,
.theme-color-swatch:focus-visible,
.similar-level-segmented button:focus-visible,
.settings-reset-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.toolbar-icon-button > svg {
  position: relative;
  z-index: 1;
}

.language-icon {
  display: block;
  width: 21px;
  height: 21px;
  color: currentColor;
  overflow: visible;
}

.language-icon__corner {
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.82;
}

.language-icon__corner--top {
  transform: translate(-2px, 0);
}

.language-icon__symbol {
  fill: currentColor;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.language-icon__symbol--zh {
  font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

.language-icon__symbol--en {
  font-family: "Helvetica Neue", Arial, sans-serif;
  transform: translate(0, -1px);
}

.language-icon.is-en .language-icon__symbol--zh {
  transform: translate(8.9587px, 7.2597px);
}

.language-icon.is-en .language-icon__symbol--en {
  transform: translate(-9.5125px, -10.9448px);
}

.settings-sliders-icon {
  width: 20px;
  height: 20px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-action-icon {
  width: 19px;
  height: 19px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.github-icon {
  width: 17px;
  height: 17px;
  display: block;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: translateY(0.2px) scale(1.02);
}

.appearance-icon {
  width: 20px;
  height: 20px;
  display: block;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.appearance-icon--sun {
  transform: rotate(8deg);
}

.appearance-icon--moon {
  transform: none;
}

.settings-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: var(--z-settings-popover);
  width: min(286px, calc(100vw - 24px));
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--popup-border);
  border-radius: 8px;
  background: var(--popup-surface);
  box-shadow: var(--popup-shadow-sm);
  backdrop-filter: blur(12px);
}

.settings-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 2px 4px;
  color: var(--text-primary);
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.25;
}

.settings-popover__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.settings-popover__mark {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(var(--accent-rgb), 0.08);
  color: var(--accent);
}

.settings-popover__mark svg {
  width: 12px;
  height: 12px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-reset-button {
  height: 26px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px 0 6px;
  border: 1px solid var(--control-border);
  border-radius: 999px;
  background: var(--surface-card-solid);
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.66rem;
  font-weight: 650;
  line-height: 1;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: var(--inset-highlight);
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.settings-reset-button svg {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.22s ease;
}

.settings-reset-button:hover {
  border-color: var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(var(--accent-rgb), 0.12);
}

.settings-reset-button:hover svg {
  transform: rotate(-24deg);
}

.settings-reset-button:active {
  transform: translateY(0);
}

.granularity-segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--control-border);
  border-radius: 8px;
  background: var(--surface-card-solid);
  box-shadow: var(--inset-highlight);
}

.granularity-segmented__option {
  min-width: 0;
  height: 28px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.granularity-segmented__option:hover {
  color: var(--text-primary);
}

.granularity-segmented__option.active {
  background: var(--gradient-accent);
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(var(--accent-rgb), 0.2);
}

.settings-section {
  display: grid;
  gap: 5px;
}

.settings-section--view {
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--control-border);
}

.settings-section__title {
  padding: 0 2px;
  color: var(--text-tertiary);
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1.2;
}

.settings-toggle-list {
  display: grid;
  gap: 1px;
  padding: 4px;
  border-radius: 8px;
}

.settings-toggle-list--primary {
  border: 1px solid var(--control-border);
  background: var(--surface-card-solid);
  box-shadow: var(--inset-highlight);
}

.settings-toggle-list--plain {
  gap: 1px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--surface-chip);
}

.settings-toggle {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 6px 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.settings-toggle:hover {
  background: var(--surface-chip-hover);
  color: var(--text-primary);
}

.settings-toggle.active {
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.settings-toggle.active:hover {
  background: var(--accent-soft-strong);
  color: var(--accent-strong);
}

.settings-toggle__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-toggle__switch {
  width: 30px;
  height: 17px;
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background 0.18s ease;
}

.settings-toggle.active .settings-toggle__switch {
  background: var(--accent);
}

.settings-toggle__switch-thumb {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--surface-card-solid);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.22);
  transform: translateX(0);
  transition: transform 0.18s ease;
}

.settings-toggle.active .settings-toggle__switch-thumb {
  transform: translateX(13px);
}

.theme-color-control {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 6px 0 8px;
  border-radius: 6px;
  color: var(--text-secondary);
}

.theme-color-control > span {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-color-swatches {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.theme-color-swatch {
  position: relative;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 6px;
  background: var(--surface-card-solid);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--inset-highlight);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.theme-color-swatch:hover {
  border-color: rgba(var(--theme-rgb), 0.34);
  box-shadow: var(--inset-highlight), 0 2px 5px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.theme-color-swatch.active {
  border-color: rgba(var(--theme-rgb), 0.54);
  background: rgba(var(--theme-rgb), 0.08);
  box-shadow: var(--inset-highlight), 0 0 0 2px rgba(var(--theme-rgb), 0.12);
}

.theme-color-swatch::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 7px;
  height: 4px;
  border-left: 1.7px solid #ffffff;
  border-bottom: 1.7px solid #ffffff;
  filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.32));
  opacity: 0;
  transform: translate(-50%, -58%) rotate(-45deg) scale(0.72);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.theme-color-swatch.active::after {
  opacity: 1;
  transform: translate(-50%, -58%) rotate(-45deg) scale(1);
}

.theme-color-swatch__dot {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 4px;
  background: var(--theme-swatch);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.theme-color-swatch.active .theme-color-swatch__dot {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 1px 2px rgba(var(--theme-rgb), 0.2);
}

.similar-level-control {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 6px 0 8px;
  border-radius: 6px;
  color: var(--text-secondary);
}

.similar-level-control > span {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.similar-level-segmented {
  flex: 0 0 140px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--control-border);
  border-radius: 7px;
  background: var(--surface-card-solid);
}

.similar-level-segmented button {
  min-width: 0;
  height: 25px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.64rem;
  font-weight: 750;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.similar-level-segmented button:hover {
  color: var(--text-primary);
}

.similar-level-segmented button.active {
  background: var(--gradient-accent);
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(var(--accent-rgb), 0.18);
}

@media (max-width: 820px) {
  .app-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 6px 8px;
    gap: 8px;
  }

  .header-actions {
    order: 2;
    margin-left: auto;
  }

  .settings-popover {
    right: 0;
    width: min(286px, calc(100vw - 16px));
  }
}

@media (max-width: 400px) {
  .brand-logo-glow {
    display: none;
  }

  .brand-title {
    font-size: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-zone,
  .brand-logo-glow,
  .brand-logo__document,
  .brand-logo__plus,
  .brand-logo-glow svg,
  .toolbar-icon-button,
  .toolbar-icon-button::after,
  .appearance-icon,
  .language-icon__symbol,
  .granularity-segmented__option,
  .settings-reset-button,
  .settings-toggle,
  .theme-color-swatch,
  .theme-color-swatch::after,
  .theme-color-swatch__dot,
  .similar-level-segmented button,
  .settings-toggle__switch,
  .settings-toggle__switch-thumb {
    transition: none !important;
  }
}
</style>
