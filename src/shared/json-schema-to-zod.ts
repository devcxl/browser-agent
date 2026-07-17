/**
 * JSON Schema → Zod Schema 转换器
 *
 * 占位实现，完整转换逻辑将在 Task 1.2 中实现。
 * 当前仅提供最小 typing stub，确保 ToolLoopAdapter 编译通过。
 */

import { z } from 'zod';
import type { ToolParameterSchema } from '@/shared/types/tool';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function jsonSchemaToZod(schema: ToolParameterSchema): z.ZodType<unknown> {
  // 临时实现：返回宽松的 object schema
  // Task 1.2 将实现完整的 JSON Schema → Zod 转换
  return z.record(z.string(), z.unknown());
}
