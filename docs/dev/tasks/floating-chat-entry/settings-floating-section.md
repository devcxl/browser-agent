---
name: "settings-floating-section"
depends_on: ["storage-extend-floating-settings"]
labels: ["frontend"]
worktree_root: ".worktree/settings-floating-section/"
---

## 目标

在 Side Panel 设置面板新增「浮动按钮」区块：开关、黑名单列表管理、位置重置，接入现有 i18n。

## 实现要点

1. 新建 `src/entrypoints/sidepanel/components/FloatingButtonSection.tsx`：
   - 绑定 `floatingButtonSettings` 读写（通过现有 `ConfigStore` 或 Context）
   - 总开关 toggle（`enabled`）
   - 黑名单列表：逐条显示主机名 + 删除按钮；空态文案"未隐藏任何站点"/"No sites hidden"
   - 位置重置按钮：写 `position: null` 回默认
   - 遵循现有 SettingsPanel 区块视觉风格

2. 在 `SettingsPanel` 中集成 `FloatingButtonSection`：
   - 可能在 "General" 或新增 tab/section；以最小侵入方式插入现有设置结构

3. i18n 文案扩展：
   - `src/entrypoints/sidepanel/locales/zh-CN.json`：新增浮动按钮区块相关键（~8 条）
   - `src/entrypoints/sidepanel/locales/en.json`：对应英译
   - `src/entrypoints/sidepanel/i18n/types.ts`：如需扩展现有类型定义

## 验收标准

- [ ] 设置页出现「浮动按钮」区块，开关可切换 `enabled`
- [ ] 黑名单列表正确显示已隐藏站点，可逐条移除
- [ ] 移除后页面刷新该站点按钮恢复
- [ ] 位置重置按钮生效
- [ ] 中英文文案正确切换
- [ ] React Testing Library 组件测试覆盖：开关切换、黑名单增删、位置重置

## Worktree
- 路径: `.worktree/settings-floating-section/`
- 分支: `feat/settings-floating-section`
```json
