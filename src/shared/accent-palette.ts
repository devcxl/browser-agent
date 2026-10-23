/**
 * 主色派生（纯函数，无 DOM / 无依赖）。
 *
 * 设置页只存一个主色，运行时的 hover / soft / 前景色由本模块按当前有效主题派生：
 * - light：hover 压暗；soft 与浅色画布混合
 * - dark：accent 与 hover 提亮；soft 与深色画布混合
 * - onAccent：按 WCAG 对比度在白 / 深墨之间取更可读的一侧
 */

/** 默认主色（暖橙），也是非法输入的回退值 */
export const DEFAULT_ACCENT_COLOR = '#c2410c';

export type AccentTheme = 'light' | 'dark';

export interface AccentPalette {
  /** 主色本体 */
  accent: string;
  /** hover / active 态 */
  accentHover: string;
  /** 低饱和背景（选中项、引用块等） */
  accentSoft: string;
  /** 主色上的前景色 */
  onAccent: string;
}

/** 画布底色，用于和主色混合出 soft */
const LIGHT_CANVAS = '#fafaf9';
const DARK_CANVAS = '#161412';

/** on-accent 的两个候选前景 */
const ON_ACCENT_LIGHT = '#ffffff';
const ON_ACCENT_DARK = '#1c1917';

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** hover 相对主色的亮度偏移（HSL 亮度，0–1） */
const HOVER_DELTA = { light: -0.08, dark: 0.16 } as const;
/** 深色主题下主色本身的提亮量 */
const DARK_ACCENT_LIFT = 0.08;
/** soft 中画布所占比例（越大越接近底色） */
const SOFT_CANVAS_WEIGHT = { light: 0.93, dark: 0.78 } as const;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

/** 校验并归一化主色；非法值回退默认暖橙 */
export function normalizeAccentColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ACCENT_COLOR;
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return DEFAULT_ACCENT_COLOR;

  const body = trimmed.slice(1).toLowerCase();
  const expanded = body.length === 3
    ? body.split('').map((char) => char + char).join('')
    : body;
  return `#${expanded}`;
}

function parseHex(hex: string): Rgb {
  const body = hex.slice(1);
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number): string =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === red) {
    h = ((green - blue) / delta) % 6;
  } else if (max === green) {
    h = (blue - red) / delta + 2;
  } else {
    h = (red - green) / delta + 4;
  }
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return {
    r: (rgb[0] + m) * 255,
    g: (rgb[1] + m) * 255,
    b: (rgb[2] + m) * 255,
  };
}

/** 保持色相 / 饱和度，仅调整 HSL 亮度 */
function withLightness(hex: string, delta: number): string {
  const hsl = rgbToHsl(parseHex(hex));
  return toHex(hslToRgb({ ...hsl, l: clamp(hsl.l + delta) }));
}

/** 线性混合两个颜色；weightOfB 为第二个颜色的占比 */
function mixColors(a: string, b: string, weightOfB: number): string {
  const first = parseHex(a);
  const second = parseHex(b);
  const weight = clamp(weightOfB);
  return toHex({
    r: first.r + (second.r - first.r) * weight,
    g: first.g + (second.g - first.g) * weight,
    b: first.b + (second.b - first.b) * weight,
  });
}

/** WCAG 相对亮度 */
function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const linear = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** WCAG 对比度 */
function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)]
    .sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** 由主色与有效主题派生一整套运行时颜色 */
export function deriveAccentPalette(accentColor: string, theme: AccentTheme): AccentPalette {
  const base = normalizeAccentColor(accentColor);
  const dark = theme === 'dark';

  const accent = dark ? withLightness(base, DARK_ACCENT_LIFT) : base;
  const accentHover = withLightness(base, HOVER_DELTA[theme]);
  const accentSoft = mixColors(
    base,
    dark ? DARK_CANVAS : LIGHT_CANVAS,
    SOFT_CANVAS_WEIGHT[theme],
  );
  const onAccent = contrastRatio(accent, ON_ACCENT_LIGHT) >= contrastRatio(accent, ON_ACCENT_DARK)
    ? ON_ACCENT_LIGHT
    : ON_ACCENT_DARK;

  return { accent, accentHover, accentSoft, onAccent };
}
