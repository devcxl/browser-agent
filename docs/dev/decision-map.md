# Decision Map — 上下文占用进度环（Flow #193）

| Slug | Blocked By | Status | Type | Question | Answer |
|---|---|---|---|---|---|
| ctx-ring-placement | - | resolved | Grilling | 进度环展示位置与形态细节 | 思考等级下拉框右侧、麦克风按钮左侧；20px 圆形 SVG 进度环；占用率 ≥80% 变色提醒；hover 显示 `45.2K / 128K` 数值 |
| ctx-ring-data | - | resolved | Grilling | 上下文占用数据口径与上限来源 | `tokenUsage.prompt`（最近一次请求发送给 LLM 的完整上下文 token 数）÷ 模型 `limit.context`（缺失回退 `agentSettings.contextWindowTokens`，默认 128000） |
| ctx-ring-empty | - | resolved | Grilling | 无数据（新会话/未运行）时的展示行为 | 隐藏进度环（方案 A：有数据才显示），避免噪音 |
