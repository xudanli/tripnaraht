---
name: orchestration
description: >-
  TripNARA Agent 编排执行主线（显式 /orchestration 调用）。
disable-model-invocation: true
---

# /orchestration — 编排执行主线上下文

用户已通过 **`/orchestration`** 唤起。在继续前用 Read 工具读取：

1. `.cursor/capabilities/orchestration-mainline/SKILL.md` 全文  

**职责域**：`claude-orchestrator`、`agent.service`、`agent/execution`、KERNEL_NATIVE_EXECUTION、Gate → Plan → Verify 顺序。
