/**
 * 简易 token 估算：text.length * 0.5
 *
 * 适用场景：浏览器扩展中避免引入 tiktoken 等重型依赖。
 * 中文约 1 字符 ≈ 0.5 token，英文约 1 字符 ≈ 0.25 token，
 * 乘以 0.5 作为安全上界估算，确保截断后不会超出实际限制。
 *
 * @param text 待估算的文本
 * @returns 估算 token 数
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.5);
}
