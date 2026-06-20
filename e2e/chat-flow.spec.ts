import { test, expect } from '@playwright/test';

test.describe('Chat Page E2E', () => {
  test('列出标签页', async ({ page }) => {
    // 打开 Chat Page → 输入消息 → 等待回复
    // 验证消息列表渲染
  });

  test('关闭确认', async ({ page }) => {
    // 触发高风险操作 → 确认弹窗出现 → 确认 → 执行
  });

  test('设置页面持久化', async ({ page }) => {
    // 添加 Provider → 关闭 → 重新打开 → 验证持久化
  });

  test('刷新不丢消息', async ({ page }) => {
    // 发送消息 → 刷新 → 消息仍在
  });
});
