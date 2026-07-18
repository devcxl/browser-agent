import { describe, it, expect } from 'vitest';
import { isProviderModelValid, getProviderReadiness } from '../provider-readiness';
import type { ProviderConfig, ProviderModelConfig } from '@/shared/types';

function makeModel(overrides: Partial<ProviderModelConfig> = {}): ProviderModelConfig {
  return {
    id: 'gpt-4o',
    name: 'GPT-4o',
    limit: { context: 128000, output: 16384 },
    defaults: { maxOutputTokens: 4096, temperature: 0.7 },
    tool_call: true,
    reasoning: false,
    ...overrides,
  };
}

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p1',
    name: 'Test Provider',
    api: 'https://api.test.com/v1',
    apiKey: 'sk-test',
    isLocalTrusted: false,
    models: {
      'gpt-4o': makeModel(),
    },
    ...overrides,
  };
}

// ==================== isProviderModelValid ====================

describe('isProviderModelValid', () => {
  it('id 为空字符串时非法', () => {
    expect(isProviderModelValid(makeModel({ id: '' }))).toBe(false);
  });

  it('id 为纯空格时非法', () => {
    expect(isProviderModelValid(makeModel({ id: '   ' }))).toBe(false);
  });

  it('name 为空字符串时非法', () => {
    expect(isProviderModelValid(makeModel({ name: '' }))).toBe(false);
  });

  it('context 不大于 output 时非法 (相等)', () => {
    expect(isProviderModelValid(makeModel({ limit: { context: 8192, output: 8192 } }))).toBe(false);
  });

  it('context 不大于 output 时非法 (小于)', () => {
    expect(isProviderModelValid(makeModel({ limit: { context: 4096, output: 8192 } }))).toBe(false);
  });

  it('output 为 0 时非法', () => {
    expect(isProviderModelValid(makeModel({ limit: { context: 128000, output: 0 } }))).toBe(false);
  });

  it('defaultOutput <= 0 时非法', () => {
    expect(isProviderModelValid(makeModel({ defaults: { maxOutputTokens: 0 } }))).toBe(false);
  });

  it('defaultOutput > output 时非法', () => {
    expect(isProviderModelValid(makeModel({ limit: { context: 128000, output: 8192 }, defaults: { maxOutputTokens: 16384 } }))).toBe(false);
  });

  it('没有 limit 对象时非法 (context/output 均为 0)', () => {
    const model = { id: 'gpt', name: 'GPT', defaults: { maxOutputTokens: 4096 } };
    expect(isProviderModelValid(model as ProviderModelConfig)).toBe(false);
  });

  it('正常合法模型', () => {
    expect(isProviderModelValid(makeModel())).toBe(true);
  });

  it('defaultOutput 未设置且 context > output > 0 时合法', () => {
    const model = makeModel({
      limit: { context: 128000, output: 16384 },
      defaults: undefined,
    });
    expect(isProviderModelValid(model)).toBe(true);
  });

  it('defaultOutput 等于 output 时合法', () => {
    const model = makeModel({
      limit: { context: 128000, output: 16384 },
      defaults: { maxOutputTokens: 16384 },
    });
    expect(isProviderModelValid(model)).toBe(true);
  });
});

// ==================== getProviderReadiness ====================

describe('getProviderReadiness', () => {
  it('api 有效且至少一个合法模型 → isComplete=true', () => {
    const result = getProviderReadiness(makeProvider());
    expect(result).toEqual({ isComplete: true, initialStep: null });
  });

  it('endpoint 有效且至少一个合法模型 → isComplete=true', () => {
    const provider = makeProvider({ api: undefined, endpoint: 'https://api.test.com/v1' });
    const result = getProviderReadiness(provider);
    expect(result).toEqual({ isComplete: true, initialStep: null });
  });

  it('endpoint 为空 → initialStep=connection', () => {
    const provider = makeProvider({ api: '', endpoint: '' });
    const result = getProviderReadiness(provider);
    expect(result).toEqual({ isComplete: false, initialStep: 'connection' });
  });

  it('api 和 endpoint 都 undefined → initialStep=connection', () => {
    const provider = makeProvider({ api: undefined, endpoint: undefined });
    const result = getProviderReadiness(provider);
    expect(result).toEqual({ isComplete: false, initialStep: 'connection' });
  });

  it('api 仅为空格 → initialStep=connection', () => {
    const provider = makeProvider({ api: '   ', endpoint: '' });
    const result = getProviderReadiness(provider);
    expect(result).toEqual({ isComplete: false, initialStep: 'connection' });
  });

  it('endpoint 有效但无合法模型 → initialStep=models', () => {
    const provider = makeProvider({
      models: { 'bad': makeModel({ id: '' }) },
    });
    const result = getProviderReadiness(provider);
    expect(result).toEqual({ isComplete: false, initialStep: 'models' });
  });

  it('空模型列表 → initialStep=models', () => {
    const provider = makeProvider({ models: {} });
    const result = getProviderReadiness(provider);
    expect(result).toEqual({ isComplete: false, initialStep: 'models' });
  });

  it('至少一个合法模型即完整（其他模型可能非法）', () => {
    const provider = makeProvider({
      models: {
        'bad': makeModel({ id: '' }),
        'good': makeModel(),
      },
    });
    const result = getProviderReadiness(provider);
    expect(result).toEqual({ isComplete: true, initialStep: null });
  });

  it('API Key 是否存在不影响判断', () => {
    const provider = makeProvider({ apiKey: '' });
    const result = getProviderReadiness(provider);
    expect(result.isComplete).toBe(true);
  });

  it('isLocalTrusted 值不影响判断', () => {
    const providerNoTrust = makeProvider({ isLocalTrusted: false });
    const providerTrust = makeProvider({ isLocalTrusted: true });
    expect(getProviderReadiness(providerNoTrust).isComplete).toBe(true);
    expect(getProviderReadiness(providerTrust).isComplete).toBe(true);
  });

  it('models 为 undefined 时 → initialStep=models', () => {
    const provider = makeProvider({ models: undefined });
    const result = getProviderReadiness(provider);
    expect(result).toEqual({ isComplete: false, initialStep: 'models' });
  });

  it('api 为纯空格而 endpoint 有效时使用 endpoint', () => {
    const provider = makeProvider({ api: '   ', endpoint: 'https://valid.com/v1' });
    const result = getProviderReadiness(provider);
    expect(result.isComplete).toBe(true);
  });
});
