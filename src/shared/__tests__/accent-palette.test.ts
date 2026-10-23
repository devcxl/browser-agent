import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACCENT_COLOR,
  deriveAccentPalette,
  normalizeAccentColor,
} from '../accent-palette';

/** WCAG 相对亮度，用于断言提亮/压暗关系（与被测实现独立） */
function luminance(hex: string): number {
  const value = hex.slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('normalizeAccentColor', () => {
  it('保留合法 #rrggbb 并归一化为小写', () => {
    expect(normalizeAccentColor('#C2410C')).toBe('#c2410c');
    expect(normalizeAccentColor('  #2563EB  ')).toBe('#2563eb');
  });

  it('展开三位简写', () => {
    expect(normalizeAccentColor('#abc')).toBe('#aabbcc');
  });

  it.each([
    ['缺少井号', 'c2410c'],
    ['长度错误', '#12345'],
    ['非十六进制字符', '#zzzzzz'],
    ['命名颜色', 'red'],
    ['空串', ''],
    ['非字符串', 123],
    ['undefined', undefined],
  ])('非法输入（%s）回退默认暖橙', (_label, value) => {
    expect(normalizeAccentColor(value)).toBe(DEFAULT_ACCENT_COLOR);
  });

  it('默认色为暖橙 #c2410c', () => {
    expect(DEFAULT_ACCENT_COLOR).toBe('#c2410c');
  });
});

describe('deriveAccentPalette', () => {
  it('浅色主题：accent 保持原色，hover 压暗', () => {
    const palette = deriveAccentPalette('#c2410c', 'light');

    expect(palette.accent).toBe('#c2410c');
    expect(luminance(palette.accentHover)).toBeLessThan(luminance(palette.accent));
  });

  it('深色主题：accent 与 hover 均提亮', () => {
    const palette = deriveAccentPalette('#c2410c', 'dark');

    expect(luminance(palette.accent)).toBeGreaterThan(luminance('#c2410c'));
    expect(luminance(palette.accentHover)).toBeGreaterThan(luminance(palette.accent));
  });

  it('soft 与画布底色混合：浅色偏亮、深色偏暗', () => {
    const light = deriveAccentPalette('#c2410c', 'light');
    const dark = deriveAccentPalette('#c2410c', 'dark');

    expect(luminance(light.accentSoft)).toBeGreaterThan(luminance(light.accent));
    expect(luminance(dark.accentSoft)).toBeLessThan(luminance(dark.accent));
    // 混合比例高 → 更接近画布而不是纯主色
    expect(contrast(light.accentSoft, '#fafaf9')).toBeLessThan(1.2);
    expect(contrast(dark.accentSoft, '#161412')).toBeLessThan(1.5);
  });

  it('onAccent 按相对亮度选取：深底用白、浅底用深墨', () => {
    expect(deriveAccentPalette('#c2410c', 'light').onAccent).toBe('#ffffff');
    expect(deriveAccentPalette('#ffffff', 'light').onAccent).toBe('#1c1917');
    expect(deriveAccentPalette('#000000', 'light').onAccent).toBe('#ffffff');
    expect(deriveAccentPalette('#fde047', 'light').onAccent).toBe('#1c1917');
  });

  it('onAccent 选择对比度更高的一侧且保持可读', () => {
    const colors = ['#c2410c', '#2563eb', '#059669', '#7c3aed', '#be123c', '#000000', '#ffffff'];
    for (const color of colors) {
      for (const theme of ['light', 'dark'] as const) {
        const palette = deriveAccentPalette(color, theme);
        const opposite = palette.onAccent === '#ffffff' ? '#1c1917' : '#ffffff';
        expect(contrast(palette.accent, palette.onAccent)).toBeGreaterThanOrEqual(
          contrast(palette.accent, opposite),
        );
        expect(contrast(palette.accent, palette.onAccent)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('黑白极值与各色相区间下所有输出仍为合法十六进制', () => {
    for (const color of ['#000000', '#ffffff', '#84cc16', '#db2777']) {
      for (const theme of ['light', 'dark'] as const) {
        const palette = deriveAccentPalette(color, theme);
        for (const value of Object.values(palette)) {
          expect(value).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it('非法主色回退默认暖橙', () => {
    expect(deriveAccentPalette('not-a-color', 'light')).toEqual(
      deriveAccentPalette(DEFAULT_ACCENT_COLOR, 'light'),
    );
  });
});
