/**
 * GrokBot animated avatar engine — vendored module barrel.
 *
 * Upstream: https://github.com/Coiggahou2002/grokbot-web
 * Pinned commit: 616c1dd
 * License: BSD-3-Clause (see THIRD_PARTY_NOTICES.md at the repository root)
 *
 * Vendored files under this directory are copies of the upstream sources
 * (`src/engine.ts`, `painter.ts`, `geometry.ts`, `theme.ts`, `easing.ts`,
 * `types.ts`, `src/data/{expressions,shapes,states}.ts`) and keep their
 * relative import layout unchanged so no edits to upstream code were needed.
 * Upstream's `element.ts` (custom element with its own open shadow root) and
 * `react.tsx` are intentionally not vendored.
 *
 * This barrel exposes only the surface the floating widget consumes; add
 * exports here deliberately rather than importing upstream modules directly.
 */
export { GrokBot } from './engine';
export type { GrokBotInit, SpinOptions } from './engine';

export type {
  GrokBotExpression,
  GrokBotOptions,
  GrokBotShape,
  GrokBotState,
  GrokBotTheme,
  Vec2,
} from './types';

export { darkTheme, lightTheme, resolveTheme } from './theme';
