# `pipelines/` — 流程 Playbook（不是原子 Skill）

每个 `*.md` 描述**一条标准执行链**的阶段顺序与入口，并链到 **`.cursor/capabilities/`** 中的权威 `SKILL.md`。

| 文件 | 内容 |
|------|------|
| `orchestration-mainline.md` | INTAKE→…→NARRATE 与编排主线 |
| `verify-mainline.md` | VERIFY 与可行性 |
| `replay-evaluation-flow.md` | 回放 / golden / 报告 |
| `route-and-run-mainline.md` | `route_and_run`、意图识别（`/intent`）、Harness、评测脚本索引 |

分层说明：**`.cursor/STRUCTURE.md`**
