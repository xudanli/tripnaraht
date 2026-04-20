---
name: optimize
description: >-
  TripNARA 优化与候选搜索（显式 /optimize 调用）；含 Abu、CGUS、内核 adapter。
disable-model-invocation: true
---

# /optimize — 优化与候选搜索上下文

用户已通过 **`/optimize`** 唤起。在继续前用 Read 工具读取：

1. `.cursor/capabilities/optimization-candidate-search/SKILL.md` 全文  
2. 若任务以 CGUS/MC 为主，再读 `.cursor/capabilities/cgus-engineering/SKILL.md`  

**职责域**：`optimization.module`、`abu`/`dre`、`cgus-search`、`optimization-engine-adapter`、用户 optimization API、loader。
