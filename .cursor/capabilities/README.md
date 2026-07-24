# `capabilities/` — 工程专题包（不是原子 Skill）

每个子目录是一类**可一起打开的工程上下文**（通常含 `SKILL.md` + 可选 prompts / 表）。

| 目录 | 主题 |
|------|------|
| `cgus-engineering/` | CGUS、期望效用、回放与脚本 |
| `decision-kernel-engineering/` | Decision Kernel、DSO、StateManager |
| `orchestration-mainline/` | Conductor 顺序、Phase、与 Kernel 接线 |
| `verify-mainline/` | VERIFY、可行性、Gate 契约 |
| `replay-evaluation/` | e2e / golden / 决策日志契约 |
| `harness-runtime/` | Harness 步骤、trace、两层 Harness |
| `rag-engineering/` | Chunk、索引、检索 |
| `reinforcement-learning/` | RL、轨迹、ROLL |
| `optimization-candidate-search/` | 候选搜索、Abu/Dre 交界 |
| `route-and-run-intent/` | Layer1/Layer2 意图、FULL_TRIP_REPLAN vs ITINERARY_ADJUST、INTAKE metadata |
| `planning-phase-dialog-intent/` | 规划期四大对话维度（鲁棒性/供应链/多人仲裁/空间缝合）与 Decision OS 映射 |
| `memory-model-team/` | 记忆模型、DecisionParams |
| `cgus/`、`kernel/`、`harness/`、`intent/` 等 | **短名入口**，链到上面对应长包 |

**原子能力契约**（`evaluate-constraints` 等）在 **`.cursor/skills/decision/`** 等目录，与 `src/skills/` 渐进对齐。
