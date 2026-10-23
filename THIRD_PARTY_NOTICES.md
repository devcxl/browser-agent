# Third-Party Notices

本文件列出本项目内置（vendored）的第三方源码及其许可证条款。

## grokbot-web — GrokBot 动画头像引擎

- **上游仓库**：https://github.com/Coiggahou2002/grokbot-web
- **锁定 commit**：`616c1dd`
- **许可证**：BSD-3-Clause
- **内置位置**：`src/content/floating-widget/grokbot/`
- **内置文件**：`engine.ts`、`painter.ts`、`geometry.ts`、`theme.ts`、`easing.ts`、`types.ts`、`data/expressions.ts`、`data/shapes.ts`、`data/states.ts`（另含本项目的 `index.ts` 桶文件）
- **未内置**：上游 `element.ts`（自定义元素，自带 open shadow root）、`react.tsx` 及 demo 代码

上游本身是 [nasawz/GrokBot](https://github.com/nasawz/GrokBot)（Flutter，BSD-3-Clause）的 TypeScript / Canvas 2D 移植，
其表情、形状、状态数据表与渲染动画数学均派生自该作品，并沿用同一许可证。

版权行（取自上游 `LICENSE`）：

```
Copyright (c) 2026, nasawz
Copyright (c) 2026, grokbot-web contributors
All rights reserved.
```

### 许可证全文

```
BSD 3-Clause License

Copyright (c) 2026, nasawz
Copyright (c) 2026, grokbot-web contributors
All rights reserved.

This project is a TypeScript / Canvas 2D port of nasawz/GrokBot
(https://github.com/nasawz/GrokBot). The expression, shape and state tables and
the rendering and animation math are derived from that work and remain under
the license below.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
