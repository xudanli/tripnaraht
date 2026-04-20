---
name: harness
description: >-
  TripNARA Harness Runtime 步骤契约与 trace（显式 /harness 调用）。
disable-model-invocation: true
---

# /harness — Harness 工程上下文

用户已通过 **`/harness`** 唤起。在继续前用 Read 工具读取：

1. `.cursor/capabilities/harness-runtime/SKILL.md` 全文  
2. （按需）`docs/Harness Runtime.md` 中与当前任务相关的章节  

**职责域**：步骤契约注册、state projection、trace、`decisionJustification`、P0 校验器与证据版本绑定；不绕过 Gate。
