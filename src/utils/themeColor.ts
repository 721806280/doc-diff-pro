export const THEME_COLORS = ['indigo', 'blue', 'teal', 'rose', 'amber'] as const;
export const APPEARANCE_MODES = ['light', 'dark'] as const;

export type ThemeColor = (typeof THEME_COLORS)[number];
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

type ThemeToken = {
  light: ThemeAccentToken;
  dark: ThemeAccentToken;
};

type ThemeAccentToken = {
  accent: string;
  accentRgb: string;
  accentStrong: string;
  gradientStart?: string;
  gradientEnd?: string;
};

export const ACCENT_STYLE_PROPERTIES = [
  '--accent',
  '--accent-rgb',
  '--accent-strong',
  '--accent-glow',
  '--accent-soft',
  '--accent-soft-strong',
  '--accent-border',
  '--accent-border-strong',
  '--popup-focus-ring',
  '--gradient-accent'
] as const;

export const APPEARANCE_STYLE_PROPERTIES = [
  '--color-scheme',
  '--body-bg',
  '--bg-app',
  '--bg-panel',
  '--bg-panel-solid',
  '--bg-panel-muted',
  '--bg-document',
  '--bg-document-muted',
  '--bg-empty',
  '--bg-transparent',
  '--surface-card',
  '--surface-card-muted',
  '--surface-card-solid',
  '--surface-chip',
  '--surface-chip-hover',
  '--surface-translucent',
  '--surface-disabled',
  '--border-subtle',
  '--border-strong',
  '--text-primary',
  '--text-secondary',
  '--text-tertiary',
  '--document-text',
  '--document-muted',
  '--shadow-panel',
  '--shadow-panel-hover',
  '--shadow-card',
  '--shadow-floating',
  '--inset-highlight',
  '--inset-control',
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
  '--scrollbar-track',
  '--muted-chip-text',
  '--muted-chip-strong',
  '--muted-chip-bg',
  '--muted-chip-bg-hover',
  '--muted-chip-border',
  '--modified-text',
  '--modified-rgb',
  '--similarity-text',
  '--similarity-rgb',
  '--source-text',
  '--source-rgb',
  '--ignored-text',
  '--ignored-bg',
  '--ignored-border',
  '--ignored-focus-ring',
  '--control-surface',
  '--control-surface-hover',
  '--control-surface-disabled',
  '--control-border',
  '--control-border-hover',
  '--control-shadow-hover',
  '--popup-backdrop',
  '--popup-surface',
  '--popup-surface-soft',
  '--popup-border',
  '--popup-border-strong',
  '--popup-shadow',
  '--popup-shadow-sm',
  '--warning',
  '--warning-rgb',
  '--warning-strong',
  '--warning-ink',
  '--warning-soft',
  '--warning-soft-strong',
  '--warning-surface',
  '--warning-border',
  '--warning-border-strong',
  '--warning-glow',
  '--ins-text',
  '--ins-border',
  '--ins-focus',
  '--ins-rgb',
  '--del-text',
  '--del-border',
  '--del-focus',
  '--del-rgb',
  '--gradient-ins',
  '--gradient-del',
  '--brand-revision-fill',
  '--brand-revision-stroke',
  '--brand-revision-line'
] as const;

export const THEME_STYLE_PROPERTIES = [
  ...ACCENT_STYLE_PROPERTIES,
  ...APPEARANCE_STYLE_PROPERTIES
] as const;

export type ThemeStyle = Record<(typeof THEME_STYLE_PROPERTIES)[number], string>;
type AppearanceStyle = Record<(typeof APPEARANCE_STYLE_PROPERTIES)[number], string>;

export const THEME_TOKENS: Record<ThemeColor, ThemeToken> = {
  indigo: {
    light: {
      accent: '#4f46e5',
      accentRgb: '79, 70, 229',
      accentStrong: '#4338ca'
    },
    dark: {
      accent: '#818cf8',
      accentRgb: '129, 140, 248',
      accentStrong: '#c7d2fe',
      gradientStart: '#4f46e5',
      gradientEnd: '#6366f1'
    }
  },
  blue: {
    light: {
      accent: '#2563eb',
      accentRgb: '37, 99, 235',
      accentStrong: '#1d4ed8'
    },
    dark: {
      accent: '#60a5fa',
      accentRgb: '96, 165, 250',
      accentStrong: '#bfdbfe',
      gradientStart: '#1d4ed8',
      gradientEnd: '#2563eb'
    }
  },
  teal: {
    light: {
      accent: '#0f766e',
      accentRgb: '15, 118, 110',
      accentStrong: '#0d9488'
    },
    dark: {
      accent: '#2dd4bf',
      accentRgb: '45, 212, 191',
      accentStrong: '#99f6e4',
      gradientStart: '#0f766e',
      gradientEnd: '#0d9488'
    }
  },
  rose: {
    light: {
      accent: '#e11d48',
      accentRgb: '225, 29, 72',
      accentStrong: '#be123c'
    },
    dark: {
      accent: '#fb7185',
      accentRgb: '251, 113, 133',
      accentStrong: '#fecdd3',
      gradientStart: '#be123c',
      gradientEnd: '#e11d48'
    }
  },
  amber: {
    light: {
      accent: '#b45309',
      accentRgb: '180, 83, 9',
      accentStrong: '#92400e'
    },
    dark: {
      accent: '#f59e0b',
      accentRgb: '245, 158, 11',
      accentStrong: '#fde68a',
      gradientStart: '#b45309',
      gradientEnd: '#d97706'
    }
  }
};

const APPEARANCE_STYLES: Record<AppearanceMode, AppearanceStyle> = {
  light: {
    '--color-scheme': 'light',
    '--body-bg': '#edf1f5',
    '--bg-app': 'transparent',
    '--bg-panel': 'rgba(255, 255, 255, 0.95)',
    '--bg-panel-solid': '#ffffff',
    '--bg-panel-muted': '#fafbfc',
    '--bg-document': '#ffffff',
    '--bg-document-muted': '#fafbfc',
    '--bg-empty': 'rgba(241, 245, 249, 0.94)',
    '--bg-transparent': 'rgba(255, 255, 255, 0)',
    '--surface-card': 'rgba(255, 255, 255, 0.95)',
    '--surface-card-muted': 'rgba(248, 250, 252, 0.98)',
    '--surface-card-solid': '#ffffff',
    '--surface-chip': 'rgba(248, 250, 252, 0.9)',
    '--surface-chip-hover': 'rgba(248, 250, 252, 0.96)',
    '--surface-translucent': 'rgba(255, 255, 255, 0.72)',
    '--surface-disabled': 'rgba(248, 250, 252, 0.78)',
    '--border-subtle': 'rgba(229, 231, 235, 0.82)',
    '--border-strong': '#d1d5db',
    '--text-primary': '#111827',
    '--text-secondary': '#4b5563',
    '--text-tertiary': '#9ca3af',
    '--document-text': '#1e293b',
    '--document-muted': '#64748b',
    '--shadow-panel': '0 1px 2px rgba(15, 23, 42, 0.02), 0 4px 16px rgba(15, 23, 42, 0.04)',
    '--shadow-panel-hover': '0 2px 6px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.06)',
    '--shadow-card': '0 2px 8px rgba(15, 23, 42, 0.03), 0 8px 24px rgba(15, 23, 42, 0.04)',
    '--shadow-floating': '0 10px 28px rgba(15, 23, 42, 0.13), 0 1px 2px rgba(15, 23, 42, 0.08)',
    '--inset-highlight': 'inset 0 1px 0 rgba(255, 255, 255, 0.72)',
    '--inset-control': 'inset 0 1px 0 rgba(255, 255, 255, 0.78)',
    '--scrollbar-thumb': '#94a3b8',
    '--scrollbar-thumb-hover': '#64748b',
    '--scrollbar-track': 'transparent',
    '--muted-chip-text': '#64748b',
    '--muted-chip-strong': '#334155',
    '--muted-chip-bg': 'rgba(241, 245, 249, 0.82)',
    '--muted-chip-bg-hover': 'rgba(226, 232, 240, 0.74)',
    '--muted-chip-border': 'rgba(100, 116, 139, 0.18)',
    '--modified-text': '#6d28d9',
    '--modified-rgb': '109, 40, 217',
    '--similarity-text': '#0f766e',
    '--similarity-rgb': '15, 118, 110',
    '--source-text': '#0f766e',
    '--source-rgb': '20, 184, 166',
    '--ignored-text': '#64748b',
    '--ignored-bg': 'rgba(241, 245, 249, 0.66)',
    '--ignored-border': 'rgba(100, 116, 139, 0.22)',
    '--ignored-focus-ring': '0 0 0 2px rgba(100, 116, 139, 0.38), 0 4px 12px rgba(15, 23, 42, 0.1)',
    '--control-surface': 'rgba(248, 250, 252, 0.9)',
    '--control-surface-hover': '#ffffff',
    '--control-surface-disabled': 'rgba(248, 250, 252, 0.78)',
    '--control-border': 'rgba(148, 163, 184, 0.18)',
    '--control-border-hover': 'rgba(100, 116, 139, 0.26)',
    '--control-shadow-hover': '0 1px 3px rgba(15, 23, 42, 0.05)',
    '--popup-backdrop': 'rgba(15, 23, 42, 0.32)',
    '--popup-surface': 'rgba(255, 255, 255, 0.96)',
    '--popup-surface-soft': 'rgba(248, 250, 252, 0.94)',
    '--popup-border': 'rgba(203, 213, 225, 0.8)',
    '--popup-border-strong': 'rgba(148, 163, 184, 0.6)',
    '--popup-shadow': '0 24px 48px -12px rgba(15, 23, 42, 0.18), 0 8px 16px -8px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)',
    '--popup-shadow-sm': '0 12px 20px -8px rgba(15, 23, 42, 0.12), 0 4px 10px -6px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)',
    '--warning': '#d97706',
    '--warning-rgb': '217, 119, 6',
    '--warning-strong': '#92400e',
    '--warning-ink': '#78350f',
    '--warning-soft': 'rgba(217, 119, 6, 0.1)',
    '--warning-soft-strong': 'rgba(217, 119, 6, 0.16)',
    '--warning-surface': '#fef3c7',
    '--warning-border': 'rgba(217, 119, 6, 0.24)',
    '--warning-border-strong': 'rgba(217, 119, 6, 0.36)',
    '--warning-glow': 'rgba(245, 158, 11, 0.18)',
    '--ins-text': '#15803d',
    '--ins-border': 'rgba(22, 163, 74, 0.28)',
    '--ins-focus': '#16a34a',
    '--ins-rgb': '22, 163, 74',
    '--del-text': '#b91c1c',
    '--del-border': 'rgba(220, 38, 38, 0.28)',
    '--del-focus': '#dc2626',
    '--del-rgb': '220, 38, 38',
    '--gradient-ins': 'linear-gradient(135deg, rgba(22, 163, 74, 0.12) 0%, rgba(22, 163, 74, 0.06) 100%)',
    '--gradient-del': 'linear-gradient(135deg, rgba(220, 38, 38, 0.12) 0%, rgba(220, 38, 38, 0.06) 100%)',
    '--brand-revision-fill': '#dcfce7',
    '--brand-revision-stroke': '#16a34a',
    '--brand-revision-line': '#86efac'
  },
  dark: {
    '--color-scheme': 'dark',
    '--body-bg': '#080c16',
    '--bg-app': 'linear-gradient(180deg, #0b1020 0%, #111827 100%)',
    '--bg-panel': 'rgba(15, 23, 42, 0.9)',
    '--bg-panel-solid': '#111827',
    '--bg-panel-muted': '#0f172a',
    '--bg-document': '#111827',
    '--bg-document-muted': '#0f172a',
    '--bg-empty': 'rgba(15, 23, 42, 0.94)',
    '--bg-transparent': 'rgba(15, 23, 42, 0)',
    '--surface-card': 'rgba(15, 23, 42, 0.94)',
    '--surface-card-muted': 'rgba(30, 41, 59, 0.76)',
    '--surface-card-solid': '#111827',
    '--surface-chip': 'rgba(30, 41, 59, 0.8)',
    '--surface-chip-hover': 'rgba(51, 65, 85, 0.78)',
    '--surface-translucent': 'rgba(15, 23, 42, 0.72)',
    '--surface-disabled': 'rgba(15, 23, 42, 0.72)',
    '--border-subtle': 'rgba(148, 163, 184, 0.2)',
    '--border-strong': 'rgba(148, 163, 184, 0.38)',
    '--text-primary': '#f8fafc',
    '--text-secondary': '#cbd5e1',
    '--text-tertiary': '#94a3b8',
    '--document-text': '#e5e7eb',
    '--document-muted': '#94a3b8',
    '--shadow-panel': '0 1px 2px rgba(0, 0, 0, 0.18), 0 10px 28px rgba(0, 0, 0, 0.24)',
    '--shadow-panel-hover': '0 2px 8px rgba(0, 0, 0, 0.24), 0 16px 38px rgba(0, 0, 0, 0.32)',
    '--shadow-card': '0 2px 8px rgba(0, 0, 0, 0.18), 0 12px 28px rgba(0, 0, 0, 0.24)',
    '--shadow-floating': '0 18px 42px rgba(0, 0, 0, 0.42), 0 1px 2px rgba(0, 0, 0, 0.32)',
    '--inset-highlight': 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    '--inset-control': 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    '--scrollbar-thumb': '#475569',
    '--scrollbar-thumb-hover': '#64748b',
    '--scrollbar-track': 'transparent',
    '--muted-chip-text': '#94a3b8',
    '--muted-chip-strong': '#cbd5e1',
    '--muted-chip-bg': 'rgba(30, 41, 59, 0.72)',
    '--muted-chip-bg-hover': 'rgba(51, 65, 85, 0.78)',
    '--muted-chip-border': 'rgba(148, 163, 184, 0.2)',
    '--modified-text': '#c4b5fd',
    '--modified-rgb': '196, 181, 253',
    '--similarity-text': '#5eead4',
    '--similarity-rgb': '94, 234, 212',
    '--source-text': '#5eead4',
    '--source-rgb': '45, 212, 191',
    '--ignored-text': '#94a3b8',
    '--ignored-bg': 'rgba(51, 65, 85, 0.62)',
    '--ignored-border': 'rgba(148, 163, 184, 0.28)',
    '--ignored-focus-ring': '0 0 0 2px rgba(148, 163, 184, 0.38), 0 4px 12px rgba(0, 0, 0, 0.24)',
    '--control-surface': 'rgba(15, 23, 42, 0.78)',
    '--control-surface-hover': 'rgba(30, 41, 59, 0.9)',
    '--control-surface-disabled': 'rgba(15, 23, 42, 0.54)',
    '--control-border': 'rgba(148, 163, 184, 0.22)',
    '--control-border-hover': 'rgba(203, 213, 225, 0.34)',
    '--control-shadow-hover': '0 1px 5px rgba(0, 0, 0, 0.22)',
    '--popup-backdrop': 'rgba(2, 6, 23, 0.66)',
    '--popup-surface': 'rgba(15, 23, 42, 0.96)',
    '--popup-surface-soft': 'rgba(30, 41, 59, 0.88)',
    '--popup-border': 'rgba(148, 163, 184, 0.24)',
    '--popup-border-strong': 'rgba(203, 213, 225, 0.34)',
    '--popup-shadow': '0 28px 60px -16px rgba(0, 0, 0, 0.62), 0 10px 20px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04)',
    '--popup-shadow-sm': '0 16px 28px -10px rgba(0, 0, 0, 0.56), 0 4px 12px -6px rgba(0, 0, 0, 0.44), 0 0 0 1px rgba(255, 255, 255, 0.04)',
    '--warning': '#f59e0b',
    '--warning-rgb': '245, 158, 11',
    '--warning-strong': '#fbbf24',
    '--warning-ink': '#fde68a',
    '--warning-soft': 'rgba(245, 158, 11, 0.16)',
    '--warning-soft-strong': 'rgba(245, 158, 11, 0.24)',
    '--warning-surface': 'rgba(120, 53, 15, 0.58)',
    '--warning-border': 'rgba(245, 158, 11, 0.3)',
    '--warning-border-strong': 'rgba(251, 191, 36, 0.44)',
    '--warning-glow': 'rgba(245, 158, 11, 0.24)',
    '--ins-text': '#86efac',
    '--ins-border': 'rgba(34, 197, 94, 0.36)',
    '--ins-focus': '#22c55e',
    '--ins-rgb': '34, 197, 94',
    '--del-text': '#fca5a5',
    '--del-border': 'rgba(248, 113, 113, 0.38)',
    '--del-focus': '#f87171',
    '--del-rgb': '248, 113, 113',
    '--gradient-ins': 'linear-gradient(135deg, rgba(34, 197, 94, 0.22) 0%, rgba(34, 197, 94, 0.1) 100%)',
    '--gradient-del': 'linear-gradient(135deg, rgba(248, 113, 113, 0.22) 0%, rgba(248, 113, 113, 0.1) 100%)',
    '--brand-revision-fill': 'rgba(34, 197, 94, 0.16)',
    '--brand-revision-stroke': '#22c55e',
    '--brand-revision-line': '#86efac'
  }
};

export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && THEME_COLORS.includes(value as ThemeColor);
}

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return typeof value === 'string' && APPEARANCE_MODES.includes(value as AppearanceMode);
}

export function getThemeStyle(theme: ThemeColor, appearance: AppearanceMode = 'light'): ThemeStyle {
  const token = THEME_TOKENS[theme][appearance];
  const gradientStart = token.gradientStart ?? token.accent;
  const gradientEnd = token.gradientEnd ?? token.accentStrong;

  return {
    ...APPEARANCE_STYLES[appearance],
    '--accent': token.accent,
    '--accent-rgb': token.accentRgb,
    '--accent-strong': token.accentStrong,
    '--accent-glow': `rgba(${token.accentRgb}, 0.16)`,
    '--accent-soft': `rgba(${token.accentRgb}, 0.08)`,
    '--accent-soft-strong': `rgba(${token.accentRgb}, 0.14)`,
    '--accent-border': `rgba(${token.accentRgb}, 0.22)`,
    '--accent-border-strong': `rgba(${token.accentRgb}, 0.34)`,
    '--popup-focus-ring': `0 0 0 3px rgba(${token.accentRgb}, 0.18)`,
    '--gradient-accent': `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`
  };
}

export function applyThemeVariables(style: CSSStyleDeclaration, theme: ThemeColor, appearance: AppearanceMode = 'light'): void {
  const themeStyle = getThemeStyle(theme, appearance);

  for (const property of THEME_STYLE_PROPERTIES) {
    style.setProperty(property, themeStyle[property]);
  }
}

export function clearThemeVariables(style: CSSStyleDeclaration): void {
  for (const property of THEME_STYLE_PROPERTIES) {
    style.removeProperty(property);
  }
}

export function getThemeSwatchStyle(theme: ThemeColor): Record<string, string> {
  const token = THEME_TOKENS[theme].light;

  return {
    '--theme-rgb': token.accentRgb,
    '--theme-swatch': `linear-gradient(135deg, ${token.accent} 0%, ${token.accentStrong} 100%)`
  };
}
