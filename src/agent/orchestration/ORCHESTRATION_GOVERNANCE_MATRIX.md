# GATE / VERIFY / REPAIR 治理矩阵（Orchestration Governance Matrix）

**SSOT 常量**：`orchestration-governance-matrix.constants.ts`  
**运行时 echo**：`observability.trace.orchestration_governance_limits_v1`  
**硬性契约**：Gate 在 Plan 前 · Verify 在 Plan 后（见 `orchestration-mainline` Skill）

---

## 0. 状态机位置

完整节点序（含中间节点 / 短路 / 确认点）见 **[ORCHESTRATION_MAIN_CHAIN_PROTOCOL.md](./ORCHESTRATION_MAIN_CHAIN_PROTOCOL.md)**（协议 v1.0.0）。

```
INTAKE → RESEARCH → GATE_EVAL → … → PLAN_GEN → VERIFY ⇄ REPAIR → NARRATE → DONE
                         │                      │
                         │                      └─ plan-verify 子图（预算环）
                         └─ 硬门 + 三人格 + Readiness
```

本文件专注 **GATE / VERIFY / REPAIR 治理预算与裁决语义**；主链协议负责冻结节点与确认点。

---

## 1. GATE_EVAL 治理矩阵

### 1.1 门控状态（`GateResultStatus`）

| 状态 | 含义 | 下游 |
|------|------|------|
| `ALLOW` | 硬约束通过 | 进入 PLAN_GEN |
| `ADJUST_REQUIRED` | 软约束 / must 项 / 可修复违规 | PLAN_GEN 可继续；VERIFY 可能触发 REPAIR |
| `BLOCK` | 硬阻塞（Readiness blocker、HARD 违规） | **禁止 PLAN_GEN**（`plan-gen-harness-input` 校验） |
| `NEED_USER_CONFIRM` | 三人格合议需确认 | 短路 PLAN_GEN → 澄清（`buildClarificationResult`） |

### 1.2 确定性规则（代码分支）

| 场景 | 条件 | 结果 | 代码落点 |
|------|------|------|----------|
| Readiness 硬阻塞 | `readinessBlockers.length > 0` 且无 `userDecision.questions` | `BLOCK` | `gate-eval-executor.service.ts` |
| Readiness must | `readinessMust.length > 0` | `ADJUST_REQUIRED`（若原为 ALLOW） | 同上 |
| 失败风险 HIGH | `failure_risk_prediction` 高风险日 | 注入 blocker → `BLOCK` | orchestrator + gate-eval |
| Abu REJECT（辩论） | `guardian_results.abu.verdict === 'REJECT'` | `NEED_USER_CONFIRM` | `fuseGuardianDebateVerdictIntoGate` |
| Abu 已 BLOCK | 门控已为 `BLOCK` | **不**升格辩论 | `guardian-debate-gate-fusion.util.ts` |
| allow_partial 日期缺口 | `metadata.allow_partial` + 仅 `DATA_MISSING` 日期类 violation | `BLOCK` → `ADJUST_REQUIRED` | `relaxGateForPartialIfEligible` |
| 无 Gatekeeper 降级 | 无 agent + 硬违规 | `BLOCK` / `ADJUST_REQUIRED` / `ALLOW` | gate-eval 步骤 6 |

**Abu 一票否决（产品语义）**：`BLOCK` 与 `NEED_USER_CONFIRM`（Abu REJECT 升格）均阻止自动 PLAN_GEN；**不是** Dr.Dre/Neptune 加权投票矩阵——后者通过 REPAIR/Neptune REPLACE 在 VERIFY 后处理。

### 1.3 GATE → RESEARCH 回环

| 条件 | 动作 |
|------|------|
| 信息缺口（INTAKE） | 澄清 / NEED_MORE_INFO |
| VERIFY `RETURN_TO_RESEARCH` | 见 §2（非 GATE 直接回环） |

GATE 阶段 **最多 1 次** 由 `allow_partial` 触发的 BLOCK→ADJUST 降级；无通用「二次 GATE 重试」环。

---

## 2. VERIFY 治理矩阵

### 2.1 裁决类型（`VerifyPhaseVerdict`）

| kind | 触发 | 下一跳 |
|------|------|--------|
| `fatal` | `decisionState.verification.hasFatal` | `terminal_failed` |
| `return_to_research` | Harness `RETURN_TO_RESEARCH` + env 启用 | `research` 节点（证据快照失效） |
| `needs_repair` | `gate_result === ADJUST_REQUIRED` 或 `state.errors.length > 0` | `repair` |
| `complete` | 无上述 | 退出 plan-verify 子图 → NARRATE |

### 2.2 RETURN_TO_RESEARCH

| 旋钮 | 默认 | 环境变量 |
|------|------|----------|
| 功能开关 | `true` | `DECISION_VERIFY_RETURN_TO_RESEARCH` |
| 重试上限 | **1** | `DECISION_MAX_VERIFY_RESEARCH_RETRIES` |

Harness 映射（边表）：`EVIDENCE_SNAPSHOT_UNBOUND` · `EVIDENCE_VERSION_MISMATCH` · `REQUIRED_INPUT_MISSING` → `RETURN_TO_RESEARCH`

重试环：`verify-return-to-research-retry.runner.ts` — 每次递增 `metadata.verify_return_to_research_count`；超限后 **不再** 回 RESEARCH，携带当前草案继续或终端澄清。

### 2.3 子图步数预算

| 旋钮 | 默认 | 环境变量 |
|------|------|----------|
| 最大图步数 | **8** | `DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS` |

耗尽 → `PLAN_VERIFY_LOOP_STEP_BUDGET` → `terminal_failed`（防死锁）。

---

## 3. REPAIR 治理矩阵

### 3.1 次数预算（plan-verify 子图）

| 旋钮 | 默认 | 环境变量 | 对齐字段 |
|------|------|----------|----------|
| 最大 REPAIR 次数 | **3** | `DECISION_MAX_REPAIR_COUNT` | `DSO.systemState.repairCount` |
| 效用递减上限 | **2** | `DECISION_REPAIR_UTILITY_DECAY_MAX` | `consecutiveUtilityDeclines` |

**超预算行为**（非静默 NARRATE）：

- `repairCount >= maxRepairs` → `repair_halt_confirmation` 澄清题（`checkRepairCountExceededIfNeeded`）
- `consecutiveUtilityDeclines >= max` → `utility_decay_halt_confirmation` 澄清题

即：超过预算 → **`NEED_CONFIRMATION` 终端**，而非带瑕疵草案静默 NARRATE。瑕疵草案路径见 §3.3。

### 3.2 振荡检测

| 常量 | 值 | 行为 |
|------|-----|------|
| `REPAIR_OSCILLATION_MOVE_THRESHOLD` | **3** | 同实体移动 ≥3 次 → `TACTIC_OSCILLATION` escalation |

代码：`repair-executor.service.ts`（`OSCILLATION_PREVENTION`）。

### 3.3 退化交付（瑕疵草案）

| 路径 | 行为 |
|------|------|
| REPAIR 超预算 | 澄清终端（见上），explain 含 `repair_halt_confirmation` |
| VERIFY fatal | `terminal_failed`，不 NARRATE |
| `allow_partial` + GATE 降级 | 允许缺日期草案进入 PLAN；NARRATE 须标注缺口 |
| 编排 SUCCESS + 未收敛 violation | `explain.decision_log` + `gate_result.violations` 保留；前端读 `ui_display` / action 列表 |

**白皮书「max 2 次 REPAIR → 瑕疵 NARRATE」**：默认仍为 max **3** + 澄清；**仅**显式 `options.allow_flawed_draft_narrate=true` 可继续 NARRATE 并附带 `flawed_draft_v1` / `delivery_verdict=FLAWED_DRAFT`（`result.payload` + `explain` 同源）。绑定 `trip_id` **不**再默认放行。`FLAWED_DRAFT` 禁止 ITINERARY_ADJUST AUTO/SEMI_AUTO 写回。

### 3.4 瑕疵草案契约（P0-1）

| 字段 | 路径 |
|------|------|
| Schema | `tripnara.flawed_draft@v1` |
| 交付态 | `trusted_delivery_v1.delivery_verdict`（`VERIFIED` / `VERIFIED_WITH_WARNINGS` / `FLAWED_DRAFT` / `BLOCKED` / `FAILED`） |
| 装配 | `buildFlawedDraftDescriptorV1()` · `resolveDeliveryVerdict()` |
| 触发 | **显式** `allow_flawed_draft_narrate=true` · `gate ADJUST_REQUIRED` · `allow_partial` 降级 · 未消解 VERIFY issues |

前端：先读 `delivery_verdict`；**读 `flawed_draft_v1.headline_zh` 展示 Banner**；`FLAWED_DRAFT` / `is_flawed=true` 不可当作完全 VERIFIED，且不得静默 Apply。

### 3.5 CGUS / TripDraft 路径（并行）

| 旋钮 | 默认 | 环境变量 |
|------|------|----------|
| CGUS repair iters | **2** | `CGUS_REPAIR_MAX_ITERS` |

与 plan-verify 子图 **独立计数**。

---

## 4. 三人格冲突（Gate 后 / Verify 前）

| 分歧 | 规则 |
|------|------|
| Abu REJECT | → `NEED_USER_CONFIRM`（短路 PLAN） |
| Dr.Dre REJECT + Neptune REPLACE（马拉松连续驾驶锚点） | → `NEED_USER_CONFIRM` |
| 仅 Dr.Dre vs Neptune 软分歧 | VERIFY → REPAIR（Neptune 替换 / 局部微调），**无** L3 加权投票表 |

---

## 5. 环境变量速查

```bash
DECISION_MAX_REPAIR_COUNT=3
DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS=8
DECISION_REPAIR_UTILITY_DECAY_MAX=2
DECISION_MAX_VERIFY_RESEARCH_RETRIES=1
DECISION_VERIFY_RETURN_TO_RESEARCH=true
CGUS_REPAIR_MAX_ITERS=2
```

---

## 6. 契约测试

`orchestration-governance-matrix.contract.spec.ts` — 默认值、parse 函数、与 plan-verify / repair 模块导入一致性。

---

## 7. 与 EGI 文档关系

`execution-governance-interface.md` 规定 **DSL/运行时宪法**；本矩阵规定 **编排状态机内** GATE/VERIFY/REPAIR 分支，二者互补不重叠。
