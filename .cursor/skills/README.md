# Cursor：分层说明（请先读 **`.cursor/STRUCTURE.md`**）

本目录 **`.cursor/skills/`** 现在**只放原子能力**契约：`decision/`、`domain/`、`knowledge/`、`orchestration/`、`platform/` 下的 `*.md`（指向 `src/skills/` 等实现线索）。

- **工程专题（原误放于此的长包）** → **`.cursor/capabilities/`**  
- **组织 / 角色映射 / 总纲** → **`.cursor/org/`**  
- **流程 Playbook** → **`.cursor/pipelines/`**  
- **Claude Role 正文** → **`.claude/roles/`**（见 **`.cursor/roles/README.md`**）

---

## `/` 快捷唤起 → 实际打开的 capability 包

在 Agent 输入 **`/`** 后选择名称；对应 **打开** 的路径已迁至 `capabilities/`（短名仍在下表第三列）。

| 输入 | 主题 | 短入口（可选） |
|------|------|----------------|
| `/cgus` | CGUS / 期望效用 | `capabilities/cgus/SKILL.md` |
| `/harness` | Harness Runtime | `capabilities/harness/SKILL.md` |
| `/kernel` | 决策内核 | `capabilities/kernel/SKILL.md` |
| `/orchestration` | 编排执行主线 | `capabilities/orchestration/SKILL.md` |
| `/optimize` | 优化与候选搜索 | `capabilities/optimize/SKILL.md` |
| `/verify` | VERIFY 主线 | `capabilities/verify/SKILL.md` |
| `/replay` | 回放与评估 | `capabilities/replay/SKILL.md` |
| `/team` | 角色映射与小队提示词 | **`org/decision-platform-roles/SKILL.md`** |
| `/rl` | 强化学习与 RL 基础设施 | `capabilities/rl/SKILL.md` |
| `/rag` | RAG / Chunk 检索与索引 | `capabilities/rag/SKILL.md` |
| `/org` | 组织与能力体系总纲 | **`org/tripnara-org-capability-system/SKILL.md`** |

完整长文仍在各 **`capabilities/<name>/SKILL.md`**；也可用 **`@`** 引用该文件。

---

## 原子能力注册表（本目录子文件夹）

| 目录 | 示例 |
|------|------|
| `decision/` | `evaluate-constraints.md`、`optimize-route-cgus.md`、… |
| `domain/` | `search-places.md`、`compute-route.md`、… |
| `knowledge/` | `retrieve-destination-knowledge.md`、… |
| `orchestration/` | `parse-user-intent.md`、`build-context-package.md`、… |
| `platform/` | `run-replay-case.md`、`emit-metrics.md`、… |
