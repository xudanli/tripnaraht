---
layer: skill-atom
id: parse-user-intent
---

# parse-user-intent

**原子能力**：编排与呈现（不含立法数值）。

**实现**：`src/agent/utils/route-and-run-intent-analyzer.util.ts`、`src/agent/utils/itinerary-adjust-intent.util.ts`、`src/agent/orchestration/graph/nodes/intake-phase.executor.ts`。

**工程专题（意图规则、误判、单测、PR 自检）**：**[`.cursor/capabilities/route-and-run-intent/SKILL.md`](../../capabilities/route-and-run-intent/SKILL.md)** — 改排/意图对话 **自动挂载**（`capabilities/intent/SKILL.md`），或显式 **`/intent`**。

**编排流程**：[`orchestration-mainline`](../../capabilities/orchestration-mainline/SKILL.md)。
