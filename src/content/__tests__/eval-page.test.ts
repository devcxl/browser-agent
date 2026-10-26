import { describe, it, expect } from 'vitest';
import { evalInPage } from '../eval-page';

describe('evalInPage', () => {
  it('返回最后表达式的值', async () => {
    const result = await evalInPage({ code: '1 + 2' });
    expect(result).toEqual({ success: true, result: 3 });
  });

  it('可以查询 DOM', async () => {
    document.body.innerHTML = '<h1>标题</h1>';
    const result = await evalInPage({ code: 'document.querySelector("h1").textContent' });
    expect(result).toEqual({ success: true, result: '标题' });
  });

  it('支持多语句与变量声明', async () => {
    const result = await evalInPage({
      code: 'const items = [...document.querySelectorAll("li")]; items.length',
    });
    document.body.innerHTML = '<ul><li>a</li><li>b</li></ul>';
    // 每次调用独立作用域，重新执行
    const result2 = await evalInPage({
      code: 'const items = [...document.querySelectorAll("li")]; items.length',
    });
    expect(result2).toEqual({ success: true, result: 2 });
    void result;
  });

  it('Promise 结果等待完成', async () => {
    const result = await evalInPage({ code: 'Promise.resolve("done")' });
    expect(result).toEqual({ success: true, result: 'done' });
  });

  it('执行出错返回错误信息', async () => {
    const result = await evalInPage({ code: 'throw new TypeError("boom")' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('TypeError: boom');
  });

  it('语法错误返回错误信息', async () => {
    const result = await evalInPage({ code: 'const const const' });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('缺少 code 时返回错误', async () => {
    expect((await evalInPage({})).success).toBe(false);
    expect((await evalInPage({ code: '   ' })).success).toBe(false);
  });

  it('不可 JSON 序列化的结果降级为字符串', async () => {
    // 循环引用：JSON.stringify 抛错，应降级为字符串描述
    const result = await evalInPage({ code: 'const a = {}; a.self = a; a' });
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe('string');
  });
});
