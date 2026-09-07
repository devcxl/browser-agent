import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRequiredPermissions,
  checkPermissions,
  requestPermissions,
} from '../permissions';

describe('permissions', () => {
  let containsMock: ReturnType<typeof vi.fn>;
  let requestMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    containsMock = vi.fn();
    requestMock = vi.fn();
    vi.stubGlobal('chrome', {
      permissions: {
        contains: containsMock,
        request: requestMock,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── getRequiredPermissions ──────────────────────────

  it('management → 返回 management', () => {
    expect(getRequiredPermissions('management')).toEqual(['management']);
  });

  it('debugger → 返回 debugger', () => {
    expect(getRequiredPermissions('debugger')).toEqual(['debugger']);
  });

  it('clipboard → 返回 clipboardRead + clipboardWrite', () => {
    expect(getRequiredPermissions('clipboard')).toEqual([
      'clipboardRead',
      'clipboardWrite',
    ]);
  });

  it('未知分类 → 返回空数组', () => {
    expect(getRequiredPermissions('tabs')).toEqual([]);
    expect(getRequiredPermissions('')).toEqual([]);
  });

  // ── checkPermissions ────────────────────────────────

  it('空列表直接返回 true（不调用 API）', async () => {
    await expect(checkPermissions([])).resolves.toBe(true);
    expect(containsMock).not.toHaveBeenCalled();
  });

  it('contains 返回 true 时透传 true', async () => {
    containsMock.mockResolvedValue(true);
    await expect(checkPermissions(['management'])).resolves.toBe(true);
    expect(containsMock).toHaveBeenCalledWith({
      permissions: ['management'],
    });
  });

  it('contains 返回 false 时透传 false', async () => {
    containsMock.mockResolvedValue(false);
    await expect(checkPermissions(['debugger'])).resolves.toBe(false);
  });

  it('contains 抛异常时兜底返回 true', async () => {
    containsMock.mockRejectedValue(new Error('chrome api unavailable'));
    await expect(checkPermissions(['management'])).resolves.toBe(true);
  });

  // ── requestPermissions ──────────────────────────────

  it('空列表直接返回 true（不调用 API）', async () => {
    await expect(requestPermissions([])).resolves.toBe(true);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('request 返回 true 时透传 true', async () => {
    requestMock.mockResolvedValue(true);
    await expect(requestPermissions(['clipboardRead'])).resolves.toBe(true);
    expect(requestMock).toHaveBeenCalledWith({
      permissions: ['clipboardRead'],
    });
  });

  it('request 返回 false（用户拒绝）时透传 false', async () => {
    requestMock.mockResolvedValue(false);
    await expect(requestPermissions(['debugger'])).resolves.toBe(false);
  });

  it('request 抛异常时兜底返回 false', async () => {
    requestMock.mockRejectedValue(new Error('permission request failed'));
    await expect(requestPermissions(['management'])).resolves.toBe(false);
  });
});
