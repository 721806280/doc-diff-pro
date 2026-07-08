export const THEME_COLORS = ['indigo', 'blue', 'teal', 'rose', 'amber'] as const;

export type ThemeColor = (typeof THEME_COLORS)[number];

type ThemeToken = {
  accent: string;
  accentRgb: string;
  accentStrong: string;
};

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

export function getThemeStyle(theme: ThemeColor): Record<string, string> {
  const token = THEME_TOKENS[theme];

  return {
    '--accent': token.accent,
    '--accent-rgb': token.accentRgb,
    '--accent-glow': `rgba(${token.accentRgb}, 0.16)`,
    '--gradient-accent': `linear-gradient(135deg, ${token.accent} 0%, ${token.accentStrong} 100%)`
  };
}

export function getThemeSwatchStyle(theme: ThemeColor): Record<string, string> {
  const token = THEME_TOKENS[theme];

  return {
    '--theme-rgb': token.accentRgb,
    '--theme-swatch': `linear-gradient(135deg, ${token.accent} 0%, ${token.accentStrong} 100%)`
  };
}
