import { describe, it, expect } from 'vitest';
import { mapAgentStatusToBotState } from '../status-map';

describe('mapAgentStatusToBotState', () => {
  it('将 agent 的 idle 映射为 GrokBot 的 idle', () => {
    expect(mapAgentStatusToBotState('idle')).toBe('idle');
  });

  it('将 agent 的 running 映射为 GrokBot 的 working', () => {
    expect(mapAgentStatusToBotState('running')).toBe('working');
  });

  it('将 agent 的 streaming 映射为 GrokBot 的 thinking', () => {
    expect(mapAgentStatusToBotState('streaming')).toBe('thinking');
  });

  it('将 agent 的 waitingConfirmation 映射为 GrokBot 的 listening', () => {
    expect(mapAgentStatusToBotState('waitingConfirmation')).toBe('listening');
  });

  it('未知状态安全回退为 idle', () => {
    expect(mapAgentStatusToBotState('unknown')).toBe('idle');
    expect(mapAgentStatusToBotState('RUNNING')).toBe('idle');
    expect(mapAgentStatusToBotState(' running')).toBe('idle');
  });

  it('空字符串回退为 idle', () => {
    expect(mapAgentStatusToBotState('')).toBe('idle');
  });

  it('非字符串输入回退为 idle', () => {
    expect(mapAgentStatusToBotState(undefined)).toBe('idle');
    expect(mapAgentStatusToBotState(null)).toBe('idle');
    expect(mapAgentStatusToBotState(42)).toBe('idle');
    expect(mapAgentStatusToBotState({ state: 'running' })).toBe('idle');
    expect(mapAgentStatusToBotState(['running'])).toBe('idle');
  });

  it('不会把对象原型链上的属性名误判为合法状态', () => {
    expect(mapAgentStatusToBotState('toString')).toBe('idle');
    expect(mapAgentStatusToBotState('constructor')).toBe('idle');
    expect(mapAgentStatusToBotState('__proto__')).toBe('idle');
  });
});
