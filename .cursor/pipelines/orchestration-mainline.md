# Playbook：编排主线（INTAKE → … → NARRATE）

**类型**：流程（Pipeline），**不是**原子 Skill。

**权威实现与验收**：**[`.cursor/capabilities/orchestration-mainline/SKILL.md`](../capabilities/orchestration-mainline/SKILL.md)**

**短入口**：Agent 中 **`/orchestration`** → **`.cursor/capabilities/orchestration/SKILL.md`**

**阶段顺序（唯一标准）**：`INTAKE → RESEARCH → GATE → PLAN → OPTIMIZE → VERIFY → REPAIR? → NARRATE → DONE`

**相关原子能力（示例）**：`.cursor/skills/orchestration/parse-user-intent.md`、`build-context-package.md`、`render-narrative.md`。
