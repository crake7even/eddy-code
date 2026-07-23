import type { MarkdownTheme } from '@earendil-works/pi-tui';

import { getColorPalette, type ColorPalette, type ResolvedTheme } from './colors';
import { createMarkdownTheme } from './pi-tui-theme';
import { createThemeStyles, type ThemeStyles } from './styles';
import { resolveThemeSync, type Theme } from './index';

export interface EddyTUIThemeBundle {
  resolvedTheme: ResolvedTheme;
  colors: ColorPalette;
  styles: ThemeStyles;
  markdownTheme: MarkdownTheme;
}

export function createEddyTUIThemeBundle(
  theme: Theme,
  resolvedTheme?: ResolvedTheme,
): EddyTUIThemeBundle {
  const actualTheme = resolvedTheme ?? resolveThemeSync(theme);
  const colors = { ...getColorPalette(actualTheme) };
  return {
    resolvedTheme: actualTheme,
    colors,
    styles: createThemeStyles(colors),
    markdownTheme: createMarkdownTheme(colors),
  };
}
