import { z } from 'zod';

// ---------------------------------------------------------------------------
// 内部类型（映射 SchemaProperty）
// ---------------------------------------------------------------------------
interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// ---------------------------------------------------------------------------
// 实现
// ---------------------------------------------------------------------------

/**
 * 构建基础 Zod schema（不含 description，不含 optional）。
 * 由调用方决定何时添加 description 和 optional。
 */
function buildBaseSchema(prop: JsonSchemaProperty): z.ZodTypeAny {
  if (prop.enum && prop.enum.length > 0) {
    const [first, ...rest] = prop.enum;
    return z.enum([first!, ...rest]);
  }

  switch (prop.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'object':
      return convertObject(prop);
    case 'array':
      return convertArray(prop);
    default:
      return z.unknown();
  }
}

function convertObject(prop: JsonSchemaProperty): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const properties = prop.properties ?? {};
  const required = new Set(prop.required ?? []);

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(properties)) {
    let fieldSchema = buildBaseSchema(value);
    // .optional() 先执行，.describe() 后执行，确保 description 在 ZodOptional 外层可见
    if (!required.has(key)) {
      fieldSchema = fieldSchema.optional();
    }
    if (value.description) {
      fieldSchema = fieldSchema.describe(value.description);
    }
    shape[key] = fieldSchema;
  }

  return z.object(shape);
}

function convertArray(prop: JsonSchemaProperty): z.ZodArray<z.ZodTypeAny> {
  const itemSchema = buildBaseSchema(prop.items ?? { type: 'unknown' });
  const arraySchema = z.array(itemSchema);
  // description 在 array 外层
  if (prop.description) {
    return arraySchema.describe(prop.description) as z.ZodArray<z.ZodTypeAny>;
  }
  return arraySchema;
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 将 JSON Schema（ToolParameterSchema 子集）转换为 Zod Schema。
 *
 * 支持：string / number / boolean / object / array / enum / description / required
 * 不支持：$ref / oneOf / anyOf / allOf / if-then-else / 循环引用
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  return convertProperty(schema as JsonSchemaProperty);
}

/**
 * 内部入口：构建完整 schema（含顶层 description）。
 */
function convertProperty(prop: JsonSchemaProperty): z.ZodTypeAny {
  let schema = buildBaseSchema(prop);
  if (prop.description) {
    schema = schema.describe(prop.description);
  }
  return schema;
}
