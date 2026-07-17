import { describe, it, expect } from 'vitest';
import { jsonSchemaToZod } from '../json-schema-to-zod';

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------
function parseSafely(schema: Record<string, unknown>, input: unknown) {
  const zodSchema = jsonSchemaToZod(schema);
  return zodSchema.safeParse(input);
}

// ---------------------------------------------------------------------------
// 基本类型
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod — 基本类型', () => {
  it('string 类型 — 接受字符串，拒绝非字符串', () => {
    const result = parseSafely(
      { type: 'object', properties: { name: { type: 'string' } } },
      { name: 'hello' },
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ name: 'hello' });
  });

  it('string 类型 — 拒绝 number', () => {
    const result = parseSafely(
      { type: 'object', properties: { name: { type: 'string' } } },
      { name: 123 },
    );
    expect(result.success).toBe(false);
  });

  it('number 类型 — 接受数字，拒绝字符串', () => {
    const valid = parseSafely(
      { type: 'object', properties: { count: { type: 'number' } } },
      { count: 42 },
    );
    expect(valid.success).toBe(true);

    const invalid = parseSafely(
      { type: 'object', properties: { count: { type: 'number' } } },
      { count: 'nope' },
    );
    expect(invalid.success).toBe(false);
  });

  it('boolean 类型 — 接受 true/false', () => {
    const valid = parseSafely(
      { type: 'object', properties: { active: { type: 'boolean' } } },
      { active: true },
    );
    expect(valid.success).toBe(true);

    const invalid = parseSafely(
      { type: 'object', properties: { active: { type: 'boolean' } } },
      { active: 'true' },
    );
    expect(invalid.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enum 类型
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod — enum 类型', () => {
  it('接受枚举值', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['loading', 'complete'] },
        },
      },
      { status: 'loading' },
    );
    expect(result.success).toBe(true);
  });

  it('拒绝非枚举值', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['loading', 'complete'] },
        },
      },
      { status: 'unknown' },
    );
    expect(result.success).toBe(false);
  });

  it('单个枚举值也有效', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          mode: { enum: ['strict'] },
        },
      },
      { mode: 'strict' },
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 嵌套 object 类型
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod — 嵌套 object', () => {
  it('解析嵌套对象', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          createProperties: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              active: { type: 'boolean' },
            },
          },
        },
      },
      { createProperties: { url: 'https://example.com', active: true } },
    );
    expect(result.success).toBe(true);
  });

  it('嵌套对象内字段类型不匹配时拒绝', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          createProperties: {
            type: 'object',
            properties: {
              url: { type: 'string' },
            },
          },
        },
      },
      { createProperties: { url: 123 } },
    );
    expect(result.success).toBe(false);
  });

  it('三层嵌套', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          a: {
            type: 'object',
            properties: {
              b: {
                type: 'object',
                properties: { c: { type: 'string' } },
                required: ['c'],
              },
            },
            required: ['b'],
          },
        },
        required: ['a'],
      },
      { a: { b: { c: 'deep' } } },
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// array 类型
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod — array 类型', () => {
  it('number 数组', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'number' } },
        },
      },
      { ids: [1, 2, 3] },
    );
    expect(result.success).toBe(true);
  });

  it('number 数组 — 拒绝含字符串的数组', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'number' } },
        },
      },
      { ids: [1, 'bad'] },
    );
    expect(result.success).toBe(false);
  });

  it('string 数组', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          idList: { type: 'array', items: { type: 'string' } },
        },
      },
      { idList: ['a', 'b'] },
    );
    expect(result.success).toBe(true);
  });

  it('空数组也接受', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'number' } },
        },
      },
      { ids: [] },
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// required / optional
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod — required / optional', () => {
  it('required 字段缺失时报错', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['name'],
      },
      { count: 10 },
    );
    // name is required but missing → should fail
    // In Zod v4, optional fields are truly optional (undefined)
    // Required fields that are missing → error
    expect(result.success).toBe(false);
  });

  it('optional 字段缺失时接受', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['name'],
      },
      { name: 'test' },
    );
    expect(result.success).toBe(true);
  });

  it('全部 optional（无 required 数组）', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      },
      {},
    );
    expect(result.success).toBe(true);
  });

  it('嵌套 required 独立生效', () => {
    // 外层 required = ['query'], 内层 required = ['url']
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          query: { type: 'string' },
          nested: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              active: { type: 'boolean' },
            },
            required: ['url'],
          },
        },
        required: ['query'],
      },
      { query: 'search' },
    );
    // query present, nested missing → ok (nested is optional at outer level)
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// description
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod — description', () => {
  it('顶层 schema 带 description（required 字段）', () => {
    const zodSchema = jsonSchemaToZod({
      type: 'object',
      properties: { name: { type: 'string', description: '用户姓名' } },
      required: ['name'],
    });
    // required 字段不会被 optional 包裹，description 直接在 shape 上
    const shape = (zodSchema as unknown as Record<string, unknown>).shape as Record<string, { description?: string }> | undefined;
    expect(shape?.name?.description).toBe('用户姓名');
  });
});

// ---------------------------------------------------------------------------
// 空 schema
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod — 空 schema / 边界', () => {
  it('空 properties', () => {
    const result = parseSafely(
      { type: 'object', properties: {} },
      {},
    );
    expect(result.success).toBe(true);
  });

  it('未知 type 回退为 z.unknown()', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: { data: { type: 'unknown-type' as string } },
      },
      { data: 'anything' },
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 真实工具 schema 场景
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod — 真实工具 schema', () => {
  it('tabs_get 类型 schema', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: '要查询的标签页 ID' },
        },
        required: ['tabId'],
      },
      { tabId: 42 },
    );
    expect(result.success).toBe(true);
  });

  it('tabs_query 嵌套对象 + enum', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          queryInfo: {
            type: 'object',
            properties: {
              active: { type: 'boolean' },
              status: { type: 'string', enum: ['loading', 'complete'] },
            },
          },
        },
      },
      { queryInfo: { active: true, status: 'complete' } },
    );
    expect(result.success).toBe(true);
  });

  it('tabs_remove — array 参数', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          tabIds: {
            type: 'array',
            items: { type: 'number' },
            description: '要关闭的标签页 ID 列表',
          },
        },
        required: ['tabIds'],
      },
      { tabIds: [1, 2, 3] },
    );
    expect(result.success).toBe(true);
  });

  it('cookies_set — enum + required mix', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Cookie 所属 URL' },
          name: { type: 'string', description: 'Cookie 名称' },
          sameSite: {
            type: 'string',
            enum: ['no_restriction', 'lax', 'strict'],
            description: 'SameSite 策略',
          },
        },
        required: ['url', 'name'],
      },
      { url: 'https://example.com', name: 'token', sameSite: 'lax' },
    );
    expect(result.success).toBe(true);
  });

  it('bookmarks_delete — string 数组', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          idList: { type: 'array', items: { type: 'string' } },
        },
        required: ['idList'],
      },
      { idList: ['100', '200'] },
    );
    expect(result.success).toBe(true);
  });

  it('bookmarks_getTree — 空 properties（无参数工具）', () => {
    const result = parseSafely(
      { type: 'object', properties: {} },
      {},
    );
    expect(result.success).toBe(true);
  });

  it('windows_create — 深层嵌套对象', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          createData: {
            type: 'object',
            description: '窗口创建参数',
            properties: {
              url: { type: 'string' },
              width: { type: 'number' },
              focused: { type: 'boolean' },
              incognito: { type: 'boolean' },
            },
          },
        },
      },
      { createData: { url: 'https://example.com', width: 800, focused: true } },
    );
    expect(result.success).toBe(true);
  });

  it('windows_getAll — array of strings in nested object', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          getInfo: {
            type: 'object',
            properties: {
              populate: { type: 'boolean' },
              windowTypes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      { getInfo: { populate: true, windowTypes: ['normal', 'popup'] } },
    );
    expect(result.success).toBe(true);
  });

  it('cookies_getAll — 全 optional boolean 字段', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          secure: { type: 'boolean', description: '安全标志过滤' },
          session: { type: 'boolean', description: '会话 Cookie 过滤' },
        },
      },
      { secure: true },
    );
    expect(result.success).toBe(true);
  });

  it('tabs_group — 混合 array + number + nested object', () => {
    const result = parseSafely(
      {
        type: 'object',
        properties: {
          tabIds: { type: 'array', items: { type: 'number' } },
          groupId: { type: 'number' },
          createProperties: {
            type: 'object',
            properties: { windowId: { type: 'number' } },
          },
        },
        required: ['tabIds'],
      },
      { tabIds: [1, 2], groupId: 42, createProperties: { windowId: 1 } },
    );
    expect(result.success).toBe(true);
  });
});
