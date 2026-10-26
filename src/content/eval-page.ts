/**
 * 页面 JS 执行：供 page_eval 工具通过 content.execute 调用。
 *
 * 运行在内容脚本的隔离世界：可以查询/操作 DOM、读取页面文本与结构，
 * 但访问不到页面自身的 JS 全局变量（如 window.__NEXT_DATA__）。
 * 代码以最后表达式的值作为结果；若结果是 Promise 会等待完成。
 */

export interface EvalParams {
  code?: string;
}

export interface EvalResult {
  success: boolean;
  error?: string;
  result?: unknown;
}

/** 结果安全序列化：DOM 节点/循环引用等降级为字符串描述 */
function serialize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export async function evalInPage(params: EvalParams): Promise<EvalResult> {
  const code = params?.code;
  if (typeof code !== 'string' || code.trim().length === 0) {
    return { success: false, error: '缺少要执行的 JS 代码（code 参数）' };
  }

  try {
    // 严格模式下 eval 拥有独立作用域，声明不会泄漏到模块；
    // 返回值为代码最后表达式的完成值，Promise 结果等待后透出
    const result = await Promise.resolve(eval(code));
    return { success: true, result: serialize(result) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}
