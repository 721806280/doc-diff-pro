export const THEME_COLORS = ['indigo', 'blue', 'teal', 'rose', 'amber'] as const;

export type ThemeColor = (typeof THEME_COLORS)[number];

type ThemeToken = {
  accent: string;
  accentRgb: string;
  accentStrong: string;
};

export const THEME_STYLE_PROPERTIES = [
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

export type ThemeStyle = Record<(typeof THEME_STYLE_PROPERTIES)[number], string>;

export const THEME_TOKENS: Record<ThemeColor, ThemeToken> = {
  indigo: {
    accent: '#4f46e5',
    accentRgb: '79, 70, 229',
    accentStrong: '#4338ca'
  },
  blue: {
    accent: '#2563eb',
    accentRgb: '37, 99, 235',
    accentStrong: '#1d4ed8'
  },
  teal: {
    accent: '#0f766e',
    accentRgb: '15, 118, 110',
    accentStrong: '#0d9488'
  },
  rose: {
    accent: '#e11d48',
    accentRgb: '225, 29, 72',
    accentStrong: '#be123c'
  },
  amber: {
    accent: '#b45309',
    accentRgb: '180, 83, 9',
    accentStrong: '#92400e'
  }
};

export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && THEME_COLORS.includes(value as ThemeColor);
}

export function getThemeStyle(theme: ThemeColor): ThemeStyle {
  const token = THEME_TOKENS[theme];

  return {
    '--accent': token.accent,
    '--accent-rgb': token.accentRgb,
    '--accent-strong': token.accentStrong,
    '--accent-glow': `rgba(${token.accentRgb}, 0.16)`,
    '--accent-soft': `rgba(${token.accentRgb}, 0.08)`,
    '--accent-soft-strong': `rgba(${token.accentRgb}, 0.14)`,
    '--accent-border': `rgba(${token.accentRgb}, 0.22)`,
    '--accent-border-strong': `rgba(${token.accentRgb}, 0.34)`,
    '--popup-focus-ring': `0 0 0 3px rgba(${token.accentRgb}, 0.18)`,
    '--gradient-accent': `linear-gradient(135deg, ${token.accent} 0%, ${token.accentStrong} 100%)`
  };
}

export function applyThemeVariables(style: CSSStyleDeclaration, theme: ThemeColor): void {
  const themeStyle = getThemeStyle(theme);

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
  const token = THEME_TOKENS[theme];

  return {
    '--theme-rgb': token.accentRgb,
    '--theme-swatch': `linear-gradient(135deg, ${token.accent} 0%, ${token.accentStrong} 100%)`
  };
}
