import { describe, expect, it } from 'vitest';
import {
  applyThemeVariables,
  clearThemeVariables,
  getThemeStyle,
  THEME_STYLE_PROPERTIES
} from './themeColor';

describe('themeColor', () => {
  it('derives css variables from the selected theme', () => {
    expect(getThemeStyle('rose')).toEqual({
      '--accent': '#e11d48',
      '--accent-rgb': '225, 29, 72',
      '--accent-strong': '#be123c',
      '--accent-glow': 'rgba(225, 29, 72, 0.16)',
      '--accent-soft': 'rgba(225, 29, 72, 0.08)',
      '--accent-soft-strong': 'rgba(225, 29, 72, 0.14)',
      '--accent-border': 'rgba(225, 29, 72, 0.22)',
      '--accent-border-strong': 'rgba(225, 29, 72, 0.34)',
      '--popup-focus-ring': '0 0 0 3px rgba(225, 29, 72, 0.18)',
      '--gradient-accent': 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)'
    });
  });

  it('applies and clears theme variables as one set', () => {
    const element = document.createElement('div');

    applyThemeVariables(element.style, 'teal');

    expect(element.style.getPropertyValue('--accent')).toBe('#0f766e');
    expect(element.style.getPropertyValue('--accent-strong')).toBe('#0d9488');
    expect(element.style.getPropertyValue('--popup-focus-ring')).toBe('0 0 0 3px rgba(15, 118, 110, 0.18)');

    clearThemeVariables(element.style);

    for (const property of THEME_STYLE_PROPERTIES) {
      expect(element.style.getPropertyValue(property)).toBe('');
    }
  });
});
