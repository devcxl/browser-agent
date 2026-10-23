import { describe, it, expect } from 'vitest';
import {
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MAX,
  PANEL_WIDTH_MIN,
  PANEL_WIDTH_STEP,
  clampPanelWidth,
} from '../panel-width';

describe('clampPanelWidth', () => {
  it('缺省/非法值回退默认值 420', () => {
    for (const value of [undefined, null, '', '500', NaN, Infinity, -Infinity, {}, []]) {
      expect(clampPanelWidth(value)).toBe(PANEL_WIDTH_DEFAULT);
    }
  });

  it('区间内整数原样返回', () => {
    expect(clampPanelWidth(320)).toBe(320);
    expect(clampPanelWidth(420)).toBe(420);
    expect(clampPanelWidth(720)).toBe(720);
  });

  it('低于下限钳到 320，高于上限钳到 720', () => {
    expect(clampPanelWidth(100)).toBe(PANEL_WIDTH_MIN);
    expect(clampPanelWidth(-50)).toBe(PANEL_WIDTH_MIN);
    expect(clampPanelWidth(1000)).toBe(PANEL_WIDTH_MAX);
  });

  it('非整数值按步进（10）四舍五入', () => {
    expect(clampPanelWidth(424)).toBe(420);
    expect(clampPanelWidth(426)).toBe(430);
    expect(clampPanelWidth(425)).toBe(430);
    expect(clampPanelWidth(424.9)).toBe(420);
    expect(clampPanelWidth(719)).toBe(720);
  });

  it('步进取整后仍受上下限约束', () => {
    expect(clampPanelWidth(317)).toBe(320);
    expect(clampPanelWidth(316)).toBe(320);
    expect(clampPanelWidth(724)).toBe(720);
    expect(clampPanelWidth(726)).toBe(720);
  });

  it('视口宽度小于配置值时取视口宽度', () => {
    expect(clampPanelWidth(620, 400)).toBe(400);
  });

  it('视口宽度大于配置值时保留配置宽度', () => {
    expect(clampPanelWidth(620, 1280)).toBe(620);
  });

  it('视口宽度可低于最小宽度（以视口为准）', () => {
    expect(clampPanelWidth(420, 300)).toBe(300);
  });

  it('视口宽度向下取整，非法视口值被忽略', () => {
    expect(clampPanelWidth(620, 500.7)).toBe(500);
    expect(clampPanelWidth(620, 0)).toBe(620);
    expect(clampPanelWidth(620, -1)).toBe(620);
    expect(clampPanelWidth(620, Number.NaN)).toBe(620);
  });

  it('导出常量符合产品约束', () => {
    expect(PANEL_WIDTH_MIN).toBe(320);
    expect(PANEL_WIDTH_MAX).toBe(720);
    expect(PANEL_WIDTH_STEP).toBe(10);
    expect(PANEL_WIDTH_DEFAULT).toBe(420);
  });
});
