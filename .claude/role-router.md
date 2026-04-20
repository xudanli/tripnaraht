## role-router：按业务场景编排 roles 的最小协议

`role-router` 用于把一次任务（feature/迁移/合规/评测等）路由到需要协同使用的 roles 提示词，并给出必须检查项（must_check）。

- 规则：`.claude/role-router.json`
- 角色资产：`.claude/role-skill-manifest.json`（包含每个 role 的 `default_paths` / `checklist` / `consult_roles`）

---

## 怎么用（固定三步）

### 1) 写出本次任务的输入

你只要列出：

- `task_tags`：任务标签（可多选）
- `change_areas`：这次实际动了哪里（可多选）

其中 `change_areas` 可选值见 `.claude/role-router.json`，例如：

- `optimization_or_cgus_candidates`：Top-K 候选生成、约束/松弛口径、多样性策略、CGUS alternatives/explain 结构等

示例：

```json
{
  "task_tags": ["feature", "geo_routing", "compliance"],
  "change_areas": ["skill_contract_or_new_skill", "gate_policy_or_risk_disclosure", "decision_log_or_replay"]
}
```

### 2) 由 role-router 得出 include_roles

在 `.claude/role-router.json` 中找到命中的 `routing_rules`，把所有 `include_roles` 合并去重。

### 3) 拉取对应 role 的执行口径

对每个 role：

- 读它的 prompt（`.claude/roles/*.md`）
- 用 `.claude/role-skill-manifest.json` 里的 `default_paths` 限定读盘范围
- 用 `checklist` 当作验收清单

---

## 三条硬规则（防角色膨胀）

1. 发布主链的 R/A 仍以 `scripts/rl-infra/roll/RACI_WEEK1_3.md` 为准；role-router 只建议 Consulted/Informed。
2. 只要动了 `claude_exec_or_state_machine`，必须拉 `architect` 与 `ai_reasoning_system_architect`。
3. 只要动了 `gate_policy_or_risk_disclosure`，必须拉 `decision_safety_compliance_officer`。

