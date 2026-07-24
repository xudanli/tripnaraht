# PLAN_GEN 节点协议（错误语义 SSOT）

> **版本**：`1.0.0`（`PLAN_GEN_NODE_PROTOCOL_VERSION`）  
> **代码**：`plan-gen-node-protocol.constants.ts`  
> **主链**：[ORCHESTRATION_MAIN_CHAIN_PROTOCOL.md](./ORCHESTRATION_MAIN_CHAIN_PROTOCOL.md)

## 错误码 → 终端

| 类别 | 码 | 终端 |
|------|-----|------|
| 空草案 / 无解 | `PLAN_GEN_EMPTY_DRAFT` · `EMPTY_DAYS_FROM_SKILL` · `INCONSISTENT_EMPTY_DRAFT` · `TERMINAL_NO_SOLUTION` | `NEED_MORE_INFO` |
| 输入不足 | `NO_TRIP_PLAN_REQUEST` · `MISSING_RESEARCH` · `GOVERNANCE_REPLANNING_DEFERRED` | `NEED_MORE_INFO` |
| 系统失败 | `NO_SKILLS_REGISTRY` · `SKILL_*` · `PLAN_GEN_EXECUTOR_UNAVAILABLE` · `PLAN_GEN_HARNESS_BLOCKED` | `FAILED` |

契约：`plan-gen-node-protocol.contract.spec.ts`。
