import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_STYLE_PROPERTIES,
  applyThemeVariables,
  clearThemeVariables,
  getThemeStyle,
  THEME_STYLE_PROPERTIES
} from './themeColor';

describe('themeColor', () => {
  it('derives css variables from the selected theme', () => {
    expect(getThemeStyle('rose')).toMatchObject({
      '--color-scheme': 'light',
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

  it('derives readable accent and surface variables for dark appearance', () => {
    expect(getThemeStyle('teal', 'dark')).toMatchObject({
      '--color-scheme': 'dark',
      '--body-bg': '#080c16',
      '--accent': '#2dd4bf',
      '--accent-rgb': '45, 212, 191',
      '--accent-strong': '#99f6e4',
      '--text-primary': '#f8fafc',
      '--popup-surface': 'rgba(15, 23, 42, 0.96)',
      '--gradient-accent': 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)'
    });
  });

  it('applies and clears theme variables as one set', () => {
    const element = document.createElement('div');

    applyThemeVariables(element.style, 'teal', 'dark');

    expect(element.style.getPropertyValue('--accent')).toBe('#2dd4bf');
    expect(element.style.getPropertyValue('--accent-strong')).toBe('#99f6e4');
    expect(element.style.getPropertyValue('--color-scheme')).toBe('dark');
    expect(element.style.getPropertyValue('--popup-focus-ring')).toBe('0 0 0 3px rgba(45, 212, 191, 0.18)');

    clearThemeVariables(element.style);

    for (const property of THEME_STYLE_PROPERTIES) {
      expect(element.style.getPropertyValue(property)).toBe('');
    }
  });

  it('keeps appearance properties in the cleared theme property set', () => {
    expect(THEME_STYLE_PROPERTIES).toEqual(expect.arrayContaining([...APPEARANCE_STYLE_PROPERTIES]));
  });
});
