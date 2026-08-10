# TripNARA Nara Agent Harness 工程实施说明 V1.0

> **受众**：route_and_run / Agent Runtime 研发  
> **性质**：Architecture + Contract + Backlog + Acceptance（**不是**第二份产品 PRD）  
> **配套**：[`nara-agent-harness-golden-cases-v1.md`](./nara-agent-harness-golden-cases-v1.md)  
> **现状锚点**：`Planning Admission Gate`（`src/agent/routing/planning-admission-gate.util.ts`）已落地「默认拒绝 Full Planning」；本文件要求将其升级为统一 **Task Contract**。  
> **相关 SSOT**：[`ROUTE_AND_RUN_ROUTING_PROTOCOL.md`](../../src/agent/routing/ROUTE_AND_RUN_ROUTING_PROTOCOL.md)、[`harness-architecture-map.md`](../orchestration/harness-architecture-map.md)

---

## 0. 给研发的一句话任务

> 请按本说明对现有 `route_and_run` 主链做 **Gap Analysis**。  
> **第一阶段不要扩业务能力**；只完成 **TaskContract、Runtime Guard、Context Contract、Trace**，使 Fast Query **无法错误进入** Planning / Verify / Repair。  
> **验收以 Golden Cases 为准**，不以「LLM 能答」或「接口存在」为准。

---

## 1. 本轮改造目标

### 是什么

把现有分散的 Harness 组件：

Intent · Router · CRE · Context · Research · Gate · Solver · VERIFY · REPAIR · Decision · Apply · PlanVersion · Ledger

收束成统一的 **Travel Decision Runtime / Agent Harness**。

### 不是什么

- ❌ 不是重新开发一个 Agent  
- ❌ 不是继续堆 Intent 白名单 / Prompt 修补  
- ❌ 不是把所有请求统一送进一个超级状态机  

### 目标架构

```
                User Input
                     ↓
            Conversation Intake
                     ↓
          Task Contract Compiler
                     ↓
        ┌────────────┴────────────┐
        ↓                         ↓
 Context Requirement        Authority Scope
        ↓                         ↓
 Evidence Orchestrator             │
        └────────────┬────────────┘
                     ↓
               Runtime Router
                     ↓
 ┌────────┬────────┬────────┬────────┬────────┐
 Query  Decision  Adjust  Execution  Import …
 └────────┴────────┴────────┴────────┴────────┘
                     ↓
               Domain Result
                     ↓
               Control Plane
       Policy / Gate / Verify / Confirm
                     ↓
              Commit / Apply
                     ↓
                 Receipt
                     ↓
            Ledger / World State
```

**一句话原则（必须写进 ADR / Code Review）**：

> **模型决定「建议做什么」，Harness 决定「允许做到哪一步」。**  
> Reasoning ≠ Authority。

---

## 2. 当前问题（为什么要做）

| 症状 | 根因 |
|------|------|
| 「哪一天没住宿」跑完整 `CLAUDE_SM` | 有 `trip_id` / 前端 `intent_mode=TRIP_PLANNING` / ModeLock 会话粘性 → 误升重链路 |
| Intent / CRE / Router / Gate / Solver / Decision 各有状态 | **缺少统一 Task / Authority / Execution Contract** |
| 日志难读 | 缺少可查询的 Decision Trace（task_contract → runtime → deny/allow） |
| 白名单越补越脆 | 用 DATA_LOOKUP 正则堵误路由，而非 **默认拒绝 + 显式准入** |

**已落地的止血（保留，勿回退）**：

- `evaluatePlanningAdmission` / `applyPlanningAdmissionGateInPlace`：默认拒绝 Full Planning  
- `intent_mode` / `[日程] DayN` / 历史 ModeLock → **hint only**  
- ModeLock 仅绑 **未完成 operation**（`modeLockOperationId`），不绑 trip session  

本说明要求把上述止血 **升级为 TaskContract 一等公民**，而不是停在 Admission Gate。

---

## 3. Architecture Principles（MUST / MUST NOT）

| # | 原则 | MUST | MUST NOT |
|---|------|------|----------|
| P1 | **Task First** | 每轮先形成 `TaskContract` 再进 Runtime | 因 `trip_id` / 页面入口直接进规划 SM |
| P2 | **Trip First ≠ Planning First** | `trip_id` 只决定 Context Domain | 有 trip ≠ PLAN / Solver / VERIFY / REPAIR |
| P3 | **Least Context** | 按 Task 申请最小 Context Slice | 每轮 Full Trip + Full RAG |
| P4 | **Least Capability** | 只开放本轮 allow 列表 | 模型「顺手」调用 deny 能力 |
| P5 | **Evidence Before Conclusion** | 强结论前满足 Evidence Contract | Prompt 里写「证据不足别乱答」当唯一约束 |
| P6 | **Reasoning ≠ Authority** | LLM 建议；Harness 授权 | 模型自行获得写/跳过 Verify/无确认执行权 |
| P7 | **Decision ≠ Plan Apply** | Decision Commit 与日程 Apply 分离 | 选方案直接改 Plan |
| P8 | **Proposal Before Mutation** | Draft → Verify → Confirm → Apply | Chat 静默写 Plan |
| P9 | **Verify Before Commit** | 结构性变更走对应 Verification Policy | 绕过 Gate/Verify 写入 |
| P10 | **Every Mutation Leaves a Ledger** | action_id / versions / evidence / receipt / rollback | 无痕写入 |

---

## 4. TaskContract（第一等对象）

### 4.1 位置

`Conversation Intake` → **`TaskContractCompiler`** → Context / Authority / Runtime。

现有 `PlanningAdmissionDecision` 是 **TaskContract.capabilities / authority 的雏形**，Sprint 1 应吸收并扩展，而不是并行两套。

### 4.2 冻结接口（字段名可微调，语义不可弱化）

```ts
interface AgentTaskContract {
  taskId: string;
  turnId: string;
  tripId?: string;

  lifecycle: 'PLANNING' | 'TRAVELING' | 'COMPLETED';

  taskType:
    | 'TRIP_QUERY'
    | 'DECISION_SUPPORT'
    | 'ITINERARY_ADJUST'
    | 'LIVE_EXECUTION'
    | 'CONTENT_IMPORT'
    | 'TEAM_ACTION'
    | 'GENERAL_RESEARCH';

  scope: {
    days?: number[];
    entities?: string[];
    decisionKey?: string;
  };

  contextPolicy: {
    required: string[];
    optional: string[];
    freshness?: Record<string, string>;
  };

  capabilities: {
    allow: string[];
    deny: string[];
  };

  authority:
    | 'READ_ONLY'
    | 'DECISION_COMMIT'
    | 'DRAFT_REQUIRED'
    | 'STRONG_CONFIRMATION';

  verificationPolicy: 'NONE' | 'DATA_CHECK' | 'GATE' | 'VERIFY';

  completionCondition: string;

  /** 客户端 hint，不得单独覆盖语义 */
  hints?: {
    intentMode?: string;
    entryPoint?: string;
    uiDayAnchor?: boolean;
  };
}
```

### 4.3 示例：哪一天没住宿

```ts
{
  taskType: 'TRIP_QUERY',
  scope: { entities: ['DAY', 'ACCOMMODATION'] },
  contextPolicy: {
    required: ['DAY_LIST', 'ACCOMMODATION_ANCHORS'],
  },
  capabilities: {
    allow: ['READ_TRIP', 'QUERY_ACCOMMODATION', 'ANSWER'],
    deny: ['PLAN', 'OPTIMIZE', 'REPAIR', 'CREATE_PROPOSAL', 'APPLY'],
  },
  authority: 'READ_ONLY',
  verificationPolicy: 'DATA_CHECK',
  completionCondition: 'ANSWER_RETURNED',
}
```

即使用户侧模型「想帮忙重规划」，**PLAN/OPTIMIZE/APPLY 在 Harness 层 DENY**。

若回答后 CTA「安排住宿」被点击 → **NEW TASK** `ITINERARY_ADJUST`，禁止当前 Query 静默升级。

---

## 5. Runtime Matrix（七类 Intent → 七类 Runtime）

**Intent Recognition** 只负责「用户大概想做什么」。  
**Runtime Selection** 负责「系统这次启动多重的能力」。二者必须分开。

| Runtime | 默认 Authority | Solver | Gate | Verify | Proposal | Write |
|---------|----------------|--------|------|--------|----------|-------|
| TRIP_QUERY | READ_ONLY | ❌ | ❌ | Data Check | ❌ | ❌ |
| DECISION_SUPPORT | DECISION_COMMIT | 可选 | ✅ | 可选 | Decision | Commit Decision only |
| ITINERARY_ADJUST | DRAFT_REQUIRED | 可选 | ✅ | ✅ | ✅ | Confirm 后 |
| LIVE_EXECUTION | STRONG_CONFIRMATION* | 可选 | ✅ | ✅ | 可选 | Confirm 后 |
| CONTENT_IMPORT | DRAFT_REQUIRED | ❌ | Conflict | 可选 | Import Draft | Confirm 后 |
| TEAM_ACTION | 视动作 | ❌ | Permission | 可选 | 可选 | 视动作 |
| GENERAL_RESEARCH | READ_ONLY | ❌ | ❌ | Source | ❌ | ❌ |

\* 执行期高风险动作为 STRONG_CONFIRMATION；只读实况可为 READ_ONLY。

---

## 6. Runtime Guard（禁止升级规则）

每个 Runtime 入口：

```ts
assertCapability(taskContract, requiredCapability)
```

### TRIP_QUERY

| 允许 | 禁止 |
|------|------|
| READ / QUERY / SUMMARIZE / ANSWER | PLAN / OPTIMIZE / CREATE_DECISION / REPAIR / CREATE_PROPOSAL / APPLY |
| CTA 建议「安排住宿」 | 当前 turn 自动进入 PLAN→VERIFY→REPAIR |

### 升级唯一合法路径

```
TRIP_QUERY (DONE + CTA)
    ↓ user confirms new intent
NEW TASK → ITINERARY_ADJUST / DECISION_SUPPORT / …
```

**自动化测试必须覆盖**：Query 不得因「发现缺口」静默升级。

---

## 7. Context Contract

Context 是 **按任务申请的资源**，不是每轮默认附送。

```
TaskContract
  → Context Requirement (Registry + 可选 LLM 补洞)
  → Context Resolver
  → Minimal Context Slice
  → LLM / Domain Runtime
```

### Registry 起步（P0）

| Key | required |
|-----|----------|
| `TRIP_QUERY_LODGING` | `DAY_LIST`, `ACCOMMODATION_ANCHORS` |
| `TRIP_QUERY_TODAY` | `CURRENT_DAY`, `TIMELINE` |
| `TRIP_QUERY_NEXT` | `CURRENT_DAY`, `TIMELINE`, `CURRENT_POSITION`, `NEXT_ACTIVITY` |
| `TRIP_QUERY_PENDING` | `UNCONFIRMED_ITEMS`, `OPEN_DECISIONS` |
| `TRIP_QUERY_RISK` | `ACTIVE_RISKS`, `GATE_SUMMARY` |
| `TRIP_QUERY_READINESS` | `READINESS_SCORE`, `GAP_LIST` |

禁止：先构建巨大 `TripConversationContextSnapshot` 再指望模型自己挑。

---

## 8. Evidence Contract

Evidence Orchestrator ≠ 搜索器；是 **Evidence Policy Engine**。

```ts
interface EvidenceAssessment {
  requiredEvidence: string[];
  acquiredEvidence: string[];
  missingEvidence: string[];
  freshness: Record<string, string>;
  sourceQuality: Record<string, string>;
  sufficiency: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL_MISSING';
  conclusionPolicy: 'STRONG' | 'CONDITIONAL' | 'ASK_USER' | 'BLOCK';
}
```

来源优先级（与产品 PRD 一致）：

Trip State → Structured Domain → Rule/Gate/Solver → Knowledge/RAG → Realtime API → External Research → Ask User

**系统**判定 sufficiency；禁止仅由 LLM 自评「资料够了」。

---

## 9. Authority / Control Plane

扩展动作等级（兼容现有 READ_ONLY / DRAFT_REQUIRED / STRONG_CONFIRMATION）：

```
READ → DRAFT → DECISION_COMMIT → PLAN_WRITE → EXTERNAL_ACTION
```

每次 Action：

```
Actor + TaskContract + Permission + Risk + Gate + Confirmation
  → AuthorityDecision: ALLOW | CONFIRM | STRONG_CONFIRM | BLOCK
```

LLM **不得**最终决定：读权限、启 Solver、建 Proposal、改 Plan、跳过 Verify、忽略 Gate、执行 Action、完成事务、回滚。

---

## 10. State Model（三层，禁止超级状态机）

| 层 | 含义 | 示例 |
|----|------|------|
| **Turn State** | 本轮对话进度 | RECEIVED → CONTEXT_READY → ANSWERED → DONE |
| **Domain State** | 业务对象 | DecisionProblem / Proposal / PlanVersion |
| **Execution State** | 真写与回滚 | PENDING → AUTHORIZED → EXECUTING → SUCCEEDED/FAILED |

简单查询 **只走 Turn State**，不创建规划任务、不启 Solver。

统一的是 **协议（Contract）**，不是所有路径共用一个 Workflow。

---

## 11. ConversationTurnResult（UI ↔ Runtime ABI）

前端只认稳定结果，不认内部模型/节点：

- `turn_id` / `trip_id` / `phase` / `route`
- `answer_mode`：`DIRECT_ANSWER` | `DECISION_REQUIRED` | `DRAFT_CONFIRMATION` | `EXECUTION_CONFIRMATION` | `ACTION_COMPLETED` | `NEED_MORE_CONTEXT` | `UNABLE_TO_VERIFY`
- `conclusion` / `context_ref` / `cards[]` / `suggested_operations` / `confirmation` / `receipt`

**Card = Domain Object 投影**，不是 LLM JSON：

```
DecisionProblem → Runtime → Canonical Object → Card Projection
```

LLM 最多写 explanation / summary；不写业务权威字段。

---

## 12. Trace / Ledger（Decision Trace）

每轮至少可查：

```
turn_id
 → input
 → task_contract
 → context_requested / acquired
 → evidence
 → runtime_selected
 → tools_called
 → gate / verify
 → result
 → user_confirmation?
 → action / receipt
```

排障「为何进完整编排」应直接看到：

```
Intent: TRIP_QUERY ✓
TaskContract: READ_ONLY ✓
Runtime: ITINERARY_ADJUST ❌
Escalation: <reason or none>
```

而不是翻几千行 Nest DEBUG。

写操作必须留下：`action_id` · `previous_version` · `new_version` · `evidence` · `verify` · `impact` · `rollback_token` · `receipt`。

---

## 13. P0 工程 Backlog（按序，勿并行堆 Agent）

### Sprint 1 — Harness Foundation（本轮主攻）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **T1** | `AgentTaskContract` Schema + Builder + Validator + Trace 字段 | CASE-Q01：住宿缺口 Query → `TRIP_QUERY` + `READ_ONLY` + deny PLAN | ✅ `src/agent/harness/` |
| **T2** | Runtime Guard：`assertCapability` 挂 SM / orchestrate 入口 | 跨 Runtime 静默升级 = 测试失败 | ✅ |
| **T3** | Context Registry：先 6 个 Fast Query | 今天安排 / 下一站 / 住宿 / 待确认 / 风险 / 准备度 | ✅ `task-context.registry.ts` + `resolve-task-context-slice` / lodging 确定性答 |
| **T4** | 吸收 Admission Gate 为 TaskContract 编译器 | 前端 `intent_mode=TRIP_PLANNING` + Day 锚仍无法进 SM | ✅ `compile-agent-task-contract.util.ts` |
| **T5** | Turn Trace 最小落库/结构化日志 | observability 含 `agent_task_contract` | ✅ gateway echo + logger |

Golden：`src/agent/harness/agent-task-contract.golden.spec.ts`（CASE-Q01/G01/G02/A01）。

### Sprint 2 — Decision Runtime

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **D1** | DecisionProblem Schema + Commit（不 Apply） | CREATE_DECISION 允许；APPLY 硬拒绝 | ✅ 骨架 `decision-runtime.util.ts` |
| **D2** | Options → Gate → Compare → Recommend → Select 管线 | Golden Decision Cases | ✅ `runDecisionSupportPipeline` + D01/D02 spec |
| **D3** | 挂 RequestRouter / UI ABI | Decision Card 投影 | ✅ `adapt-harness-decision-to-travel` + fast-path 接线 |

DecisionProblem → Options → Gate → Compare → Recommend → Select → **Commit Decision only**（不 Apply Plan）。

Fast Query 切片加载：`resolve-task-context-slice` 已覆盖 LODGING / TODAY / NEXT / PENDING / RISK / READINESS。

### Sprint 3 — Adjustment Runtime

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **A1** | AdjustmentDraft Schema + WAIT_CONFIRM（Confirm 前禁 APPLY） | CASE-A01 Draft→Verify→Before/After→WAIT_CONFIRM | ✅ `adjustment-runtime.util.ts` |
| **A2** | Query CTA → 新 Adjust task（不复用 Query taskId） | CASE-A02 安排/补住宿 | ✅ Admission lodging_fill_cta + assertNewAdjustmentTask |
| **A3** | Apply 委托现有 write 链 + Receipt | applyFn 注入；骨架不重写走廊 | ✅ `adapt-adjustment-bound-trip-apply` + intake 接线 |
| **A4** | Fast Query × Trip 切片 e2e | prisma-shaped Q01/Q03/Q04 | ✅ `fast-query-trip-slice.e2e.spec.ts` |

Goal → Context Slice → Draft → Verify → Repair≤policy → Before/After → Confirm → Apply → Receipt。

### Sprint 4 — Traveling / Live Runtime

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **L1** | LiveConclusion Schema（能/不能/有条件） | CASE-E01 延误+冰河湖 | ✅ `live-execution-runtime.util.ts` |
| **L2** | 截止时间 + 备选 + Evidence | MUST NOT 无证据强结论 / 静默改行程 | ✅ |
| **L3** | TaskContract LIVE_EXECUTION 门禁 | deny PLAN/APPLY | ✅ |
| **L4** | 天气/路况 Evidence + Fast Path | gateway 接线；封路→NO | ✅ `collect-live-sensor-evidence` + `live-execution-fast-path` |
| **L5** | route_and_run 回归 | Q01/E01 Golden + harness regression | ✅ |
| **L6** | Agent 宿主绑定真实 MCP / SafeTravel | `bindLiveExecutionSensorHostFromAgent` | ✅ |

Location/Time/Delay/Weather/Road/Risk → 结论 + 截止时间 + 备选 + Evidence。

---

## 13.1 Harness Hardening（第二阶段，不新增 Runtime）

> **验收不以模块存在为准**，而以：Runtime 越权率、Capability 越权率、无证据强结论率、未授权写入率。  
> **后三项必须为 0**（Capability / 无证据强结论 / 未授权写入）。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **H1** | HTTP 真入口 Golden E2E | `POST /agent/route_and_run` Q01/E01/D01 | ✅ `hardening/harness-http-golden.e2e.spec.ts` |
| **H2** | Runtime Transition Contract | 禁止隐式跨 Runtime 升级 | ✅ `runtime-transition.contract.ts` |
| **H3** | Evidence Contract + Sufficiency | VERIFIED/STALE/ASSUMED/UNAVAILABLE；强结论须 VERIFIED | ✅ `evidence.contract.ts` + Live 降级 |
| **H4** | Adjustment PLAN_GEN/Solver/Repair Scope | Capability 门禁；Confirm 前禁 APPLY | ✅ `adjustment-capability-scope.util.ts` |
| **H5** | AgentTurnTrace | Task→Context→Evidence→Runtime→Capability→Gate→Result→Action | ✅ `agent-turn-trace.util.ts` |
| **H6** | 验收指标报告 | `buildHardeningAcceptanceReport` 后三项 rate=0 | ✅ `hardening-acceptance.metrics.ts` |

---

## 13.2 State & Learning Foundation（第三阶段）

> **控制层冻结**：除阻断性问题外，暂不新增 Runtime、路由规则和 Guard。  
> **原则继续冻结**：Reasoning ≠ Authority；**Memory ≠ Truth**（Memory 只能作 Context，不得绕过实时 Evidence / Gate / Verify）。  
> **本阶段不做**：开放式长期记忆、自动 Skill 学习、复杂多 Agent、自主策略修改。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **S1** | TravelWorldState | 统一 Trip/Plan/Decision/Execution/Risk/Member/Booking **只读投影**；`authority=PROJECTION_ONLY` | ✅ `state-learning/travel-world-state.*` |
| **S2** | TravelEvent Ledger | Decision / PlanVersion / ActionReceipt / AgentTurnTrace 可关联；`truthPolicy=LEDGER_RECORD_ONLY` | ✅ `travel-event-ledger.*` |
| **S3** | Episodic Memory×3 | Decision / Plan Change / Live Risk；`usagePolicy=CONTEXT_ONLY` + `isTruth=false` | ✅ `episodic-memory.*` |
| **S4** | Outcome Reconciliation×3 | Arrival Time / Fatigue / Risk；`learningSignalOnly=true` | ✅ `outcome-reconciliation.util.ts` |
| **S5** | Memory≠Truth 护栏 | CONTEXT 以外角色拒绝 | ✅ `assertMemoryNotUsedAsTruth` |
| **S6** | 薄挂接线 | Gateway/Live/Decision 回显 WorldState；Apply→linkBundle；Outcome→OUTCOME | ✅ `attach-state-learning.util.ts` |

**放置**：`src/agent/state-learning/`（投影 + Ledger + 情景记忆，**非新 SoT**）。  
复用既有 Decision OS / ROR / GovernanceLedger / EpisodicSummary / AdjustmentReceipt / AgentTurnTrace，禁止平行重建。

**出站 options（可选，不改控制层）**：
- `travel_world_state_seed`：丰富投影切片
- `outcome_reconciliation`：`{ kind, predictedZh, observedZh, ... }` → Ledger OUTCOME

---

## 13.3 State & Learning Hardening（第四阶段）

> **暂不**新增 Runtime、**不扩大** Memory 类型、**不允许** Learning Signal 修改正式 Policy。  
> **新增冻结原则**：**Learning ≠ Policy Mutation**（只输出 signal，不改 Contract / Rule / Gate / Solver 权重）。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **SLH1** | WorldState provenance/freshness/confidence + Consistency Check | 切片质量字段；版本/写入自洽 | ✅ `hardening/world-state-quality.util.ts` |
| **SLH2** | Ledger 因果链可回放 | Turn→Task→Decision/Proposal→Verify→Action→PlanVersion→Outcome | ✅ `hardening/causal-chain.util.ts` |
| **SLH3** | Episode Assembler | 从 Ledger 自动组装三类 Episode（不扩类型） | ✅ `hardening/episode-assembler.util.ts` |
| **SLH4** | Outcome Trigger Registry | Execution Event → Arrival/Fatigue/Risk Reconciliation | ✅ `hardening/outcome-trigger.registry.ts` |
| **SLH5** | Learning Signal Registry | 只出 signal；禁 mutate Policy | ✅ `hardening/learning-signal.registry.ts` |
| **SLH6** | Decision Replay Harness | 历史 WorldState+Evidence 重跑 Runtime vs Actual Outcome | ✅ `hardening/decision-replay.harness.ts` |

---

## 13.4 Decision Intelligence Validation（第五阶段）

> **边界继续冻结**：Harness / WorldState / Memory / Learning。  
> **新增原则**：**Prediction ≠ Decision**；**Counterfactual ≠ Observed Outcome**。  
> Hard Constraint、Gate BLOCK、安全规则 **禁止**由 Learning 自动修改。  
> **DoD 不以新模型/新接口为准**，而以能证明 **Candidate Recommendation 是否优于 Production Recommendation** 为准。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **DI1** | DecisionEvaluation | Arrival/Fatigue/Risk Reconciliation → 可评价结果 | ✅ `decision-intelligence/decision-evaluation.util.ts` |
| **DI2** | Outcome Attribution | 预测错误 / 用户行为 / 外部环境 / 干预成功 | ✅ `outcome-attribution.util.ts` |
| **DI3** | Adaptive Shadow Recommendation | Learning Signal 只影响 Shadow | ✅ `adaptive-shadow-recommendation.util.ts` |
| **DI4** | L1/L2/L3 Benchmark | Contract Golden / Scenario / Outcome | ✅ `benchmark-l1-l2-l3.util.ts` |
| **DI5** | PolicyCandidate + Promotion Pipeline | Signal→Shadow→Replay→Benchmark→Approval→Version→Canary | ✅ `promotion-pipeline.util.ts` |
| **DI6** | Hard Constraint 护栏 | Learning 不可改 HARD/GATE_BLOCK/SAFETY | ✅ `hard-constraint-guard.util.ts` |
| **DI7** | Candidate vs Production 证明 | `proveCandidateBetterThanProduction` | ✅ `compare-candidate-vs-production.util.ts` |

> **本阶段产物冻结**：DecisionEvaluation / Shadow / Benchmark / Promotion Pipeline 进入冻结，后续 Canary 不改其契约。

---

## 13.5 Production Decision Canary（第六阶段）

> **新增原则**：**Offline Better ≠ Production Better**。  
> **DoD**：不是 Candidate 能运行，而是在真实 **Eligible Sample** 上，**Safety / Feasibility 零退化**前提下，证明实际 Outcome 或用户决策质量优于 Production。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **DC1** | Decision Canary Controller | DecisionKey / Trip Scope / Risk Level 限定放量 | ✅ `canary/decision-canary-controller.util.ts` |
| **DC2** | Comparable Snapshot | Production/Candidate 同 WorldState+Evidence | ✅ `canary/comparable-snapshot.util.ts` |
| **DC3** | 多维 Candidate Evaluation | Safety/Feasibility/Outcome/Acceptance/Correction/Regret/Latency/Cost | ✅ `canary/canary-candidate-evaluation.util.ts` |
| **DC4** | DataQualityGate + SampleEligibility | 低质/无证据/无观测 Outcome 不进统计 | ✅ `canary/sample-eligibility.util.ts` |
| **DC5** | DecisionRegret | Rollback / Immediate Replan / User Correction | ✅ `canary/decision-regret.util.ts` |
| **DC6** | 第一批低风险 Canary | 高安全 DecisionKey Production-only | ✅ `FIRST_BATCH_LOW_RISK_*` |
| **DC7** | 生产优越证明 | `proveCanaryBetterInProduction` | ✅ `canary/prove-canary-production.util.ts` |

---

## 13.6 Production Evidence Accumulation（第七阶段）

> **暂不**新增 Decision Intelligence 抽象。  
> **新增冻结原则**：**Canary Passed ≠ Policy Proven**。  
> **路径约束**：完成真实 Canary 数据积累后，再进入 Temporal & Proactive Decision；**禁止**从测试通过直接跳到主动 Agent。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **EA1** | CanaryExperiment | 固定 Candidate/Production/Key/Scope/Exposure/Success/Rollback | ✅ `evidence-accumulation/canary-experiment.util.ts` |
| **EA2** | Decision Quality Dashboard | 按 DecisionKey 观察 Eligible/多维指标 | ✅ `decision-quality-dashboard.util.ts` |
| **EA3** | PromotionEvidenceRequirement | 最小样本/观察期/Outcome 证据 | ✅ `promotion-evidence-requirement.util.ts` |
| **EA4** | Auto Pause / Kill Switch | Safety/HardConstraint/Unauthorized → 回退 Production | ✅ `canary-kill-switch.util.ts` |
| **EA5** | DecisionDisagreementEvent | Prod≠Candidate 真实 Case | ✅ `decision-disagreement.util.ts` |
| **EA6** | Travel Decision Dataset | WorldState→…→Evaluation 全链记录 | ✅ `travel-decision-dataset.util.ts` |

---

## 13.7 Real Decision Pilot（第八阶段）

> **暂停**新增 Harness / State / DI / Canary 基础设施。  
> **目标**：积累真实 Eligible Decision Episode，验证评价体系能否区分 Production / Candidate；**不是**继续加测试。  
> **DoD**：得到第一批可用于真实 Decision Evaluation 与 Temporal 建模的**高质量 Travel Decision Dataset**。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **RP1** | 四类低风险 Pilot Key | pace / arrival_day_load / accommodation_movement / experience_selection | ✅ `pilot/pilot-decision-keys.util.ts` |
| **RP2** | Decision Data Funnel | Raw→…→Disagreement | ✅ `decision-data-funnel.util.ts` |
| **RP3** | Failure Taxonomy + Disagreement 分类 | 失败类型与分歧类 | ✅ `decision-failure-taxonomy.util.ts` |
| **RP4** | Evaluation Slice | DecisionKey / TripPhase / EvidenceQuality；禁仅全局平均 | ✅ `evaluation-slice.util.ts` |
| **RP5** | Observation Timeline | 只记录已有观测，禁止预测 | ✅ `observation-timeline.util.ts` |
| **RP6** | Temporal Readiness Gate | Outcome/Attribution/Quality/Coverage 未达标禁止 Temporal | ✅ `temporal-readiness-gate.util.ts` |
| **RP7** | Pilot Dataset 组装 | Evaluation Valid Episode → Dataset | ✅ `assemble-pilot-dataset.util.ts` |

---

## 13.8 Pilot Operations & Dataset Qualification（第九阶段）

> **暂停**新增 Harness / State / DI / Canary / Temporal 能力。  
> **DoD**：能明确回答「**为什么目前还不能进入 Temporal，以及需要再积累什么类型的数据**」——而不是把 Gate 从 false 机械变成 true。  
> **阈值**：暂不武断冻结 Temporal 样本阈值；先用真实 Pilot 看分布，再冻结。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **PO1** | Pilot Runbook | Trip Enroll→…→Dataset | ✅ `pilot-runbook.util.ts` |
| **PO2** | Outcome Observation Contract×4 | 四 Key 观测字段冻结 | ✅ `outcome-observation-contract.util.ts` |
| **PO3** | Funnel Drop Reason | 步骤 + reasonCode + 需补数据类型 | ✅ `funnel-drop-reason.util.ts` |
| **PO4** | Observation Density / Temporal Coverage | 仅观测指标，禁 Prediction | ✅ `observation-density.util.ts` |
| **PO5** | Readiness 分维度报告 | dimensions + blockers + whyNotTemporalZh | ✅ `temporal-readiness-report.util.ts` |
| **PO6** | Decision Case Review | Disagreement/Poor/Inconclusive 人工复核 | ✅ `decision-case-review.util.ts` |

---

## 13.9 Pilot Calibration & Threshold Freezing（第十阶段）

> **继续禁止** Temporal / Proactive / Causal 能力开发；**不新增架构**。  
> **DoD**：不是 Temporal Gate 变 true，而是用真实 Pilot 数据解释「**哪些 Temporal 场景已有资格、哪些没有，证据是什么**」。  
> Threshold 先采 P50/P75/P90 分布 → 提交 Proposal → **人工 Review** 后才能按 **Scenario** 冻结；禁止全局 Gate 放开全部时序能力。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **PC1** | Pilot Qualification Report | Funnel/Observability/Validity/Density/Coverage 持续输出 | ✅ `pilot-qualification-report.util.ts` |
| **PC2** | Drop Reason 影响排序 | Top Gap → 研发任务唯一来源 | ✅ `rank-data-gaps.util.ts` |
| **PC3** | Case Review 强制五类归因 | STATE/EVIDENCE/DECISION/OUTCOME/ATTRIBUTION | ✅ CaseReview 更新 |
| **PC4** | Observation Gap Backlog | 优先修复影响 Dataset Qualification 的缺口 | ✅ `observation-gap-backlog.util.ts` |
| **PC5** | 分布采集 + Threshold Proposal | P50/P75/P90；人工批准后可冻场景阈值 | ✅ `readiness-distribution.util.ts` |
| **PC6** | Scenario Readiness | 按场景独立判断；禁全局放开 | ✅ `scenario-temporal-readiness.util.ts` |

---

## 13.10 Temporal Scenario Graduation（第十一阶段）

> **禁止**通用 Temporal Runtime、Proactive Agent、Causal Model。  
> **新增原则**：**Scenario Qualified ≠ Temporal Authorized**。  
> 无 QUALIFIED 场景 → **继续 Pilot**，不开发 Temporal。  
> 第一版仅 **deterministic / rule-based Shadow Projection**；TemporalImpact 只能作 Decision Runtime 证据。  
> **DoD**：不是「能预测」，而是在真实通过 Readiness 的场景上，证明 Shadow Temporal Projection 具有可接受的真实预测质量。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **TG1** | 选第一 QUALIFIED 场景 | 无则 CONTINUE_PILOT | ✅ `select-qualified-scenario.util.ts` |
| **TG2** | TemporalScenarioContract | 输入/Evidence/目标/Horizon/Outcome/禁动作 | ✅ `temporal-scenario-contract.util.ts` |
| **TG3** | Deterministic Shadow Projection | TemporalImpact isPrediction=true | ✅ `deterministic-projection.util.ts` |
| **TG4** | Harness 证据边界 | 禁 DIRECT_ACTION / AUTO_REPLAN | ✅ `temporal-impact.util.ts` |
| **TG5** | TemporalEvaluation + Quality Gate | Horizon/Onset/Deadline/Direction/FA/Miss | ✅ `temporal-evaluation.util.ts` |
| **TG6** | 可见性阶梯 | Shadow →（Gate 过）User-visible；Proactive 关 | ✅ authorizeTemporalScenario |

> **本阶段产物冻结**：Graduation 架构冻结；不新增 Temporal Scenario；不开发 Proactive / Causal。

---

## 13.11 Temporal Shadow Validation（第十二阶段）

> **禁止**新增 Temporal Scenario、Proactive Agent、Causal Model；不改 Graduation 架构。  
> **新增原则**：**Future Evidence ≠ Past Prediction Evidence**。所有 Temporal Prediction 必须冻结 prediction-time WorldState / Evidence Snapshot，禁止用未来 Evidence 回填过去预测。  
> 仅对第一个 **QUALIFIED + APPROVED_FOR_SHADOW** 场景跑真实 Shadow；否则继续 Pilot。  
> **DoD**：不是 Shadow「跑通」，而是证明第一场景在真实数据上「何时准、何时不准、为何不准、置信度是否可信」，并据此决定是否用户可见。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **TSV1** | Shadow 入口门禁 | QUALIFIED∧APPROVED_FOR_SHADOW；否则 CONTINUE_PILOT | ✅ `select-shadow-scenario.util.ts` |
| **TSV2** | Prediction-time Snapshot | 冻结 State/Evidence；禁未来回填 | ✅ `prediction-time-snapshot.util.ts` |
| **TSV3** | Temporal Shadow Record | Snapshot→Impact→Timeline→Outcome→Eval | ✅ `temporal-shadow-record.util.ts` |
| **TSV4** | Failure Attribution | STATE/EVIDENCE/PROJECTION/RULE_BOUNDARY/EXTERNAL/USER/OBS_GAP | ✅ `temporal-failure-attribution.util.ts` |
| **TSV5** | Outcome Interpretation | 轨迹变化后未发生 ≠ False Alert | ✅ `outcome-interpretation.util.ts` |
| **TSV6** | Confidence Calibration | 置信度 vs 真实准确率 | ✅ `confidence-calibration.util.ts` |
| **TSV7** | 按场景 Quality Report | 禁仅全局 aggregate 裁决；Gate→USER_VISIBLE | ✅ `temporal-quality-report.util.ts` |

> **本阶段产物冻结**：Graduation / Shadow / TemporalEvaluation 架构冻结。

---

## 13.12 Temporal Decision Utility Validation（第十三阶段）

> **禁止** Proactive Notification 与 Auto Action。  
> **新增原则**：**Accurate Prediction ≠ Useful Intervention**；**UI 表达精度不得高于预测真实精度**。  
> Quality Gate 未过 → 继续 Shadow；仅通过场景可 USER_VISIBLE_TEMPORAL。  
> User-visible 仅出现在用户主动提问或既有 Decision Runtime，禁止主动打断。  
> **DoD**：不是 Temporal 出现在 UI，而是证明用户看到这类未来信息后，决策更及时、更少后悔、更高质量。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **TDU1** | Visibility Gate | 未过 Gate 留 Shadow | ✅ `visibility-gate.util.ts` |
| **TDU2** | TemporalPresentationPolicy | Evidence/Freshness/Confidence/Calibration 控展示 | ✅ `temporal-presentation-policy.util.ts` |
| **TDU3** | Visible Surface | 仅 USER_ASKED / DECISION_RUNTIME | ✅ `user-visible-surface.util.ts` |
| **TDU4** | TemporalDecisionUtility | Completion/Timing/Correction/Regret/Outcome | ✅ `temporal-decision-utility.util.ts` |
| **TDU5** | ActionableLeadTime | 「提前知道」→ 有效行动窗口 | ✅ `actionable-lead-time.util.ts` |
| **TDU6** | InterventionCandidate Shadow | Severity/…/Disruption；SHOULD/SHOULD_NOT；不通知 | ✅ `intervention-candidate-shadow.util.ts` |
| **TDU7** | Proactive Readiness Review | Intervention Quality 过才可提交；Auto Action 禁 | ✅ `proactive-readiness-review.util.ts` |

> **本阶段产物冻结**：Temporal Graduation / Shadow / Evaluation / Utility 架构冻结。

---

## 13.13 Intervention Intelligence Validation（第十四阶段）

> **禁止** Proactive Notification / Push / Auto Action / Auto Apply。  
> **新增原则**：**Useful Information ≠ Worth Interrupting**。  
> Shadow 三级：`DO_NOT_SURFACE` / `SURFACE_PASSIVELY` / `INTERRUPT_CANDIDATE`，不通知用户。  
> **DoD**：不是「系统知道何时提醒」，而是在 Shadow 中证明——哪些信息值得打断、何时打断最有价值，以及不会因过度提醒破坏旅行体验。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **II1** | 冻结 InterventionCandidate | Severity/Urgency/Confidence/Actionability/LeadTime/Disruption | ✅ `intervention-candidate.util.ts` |
| **II2** | 三级 Shadow 输出 | DO_NOT_SURFACE / SURFACE_PASSIVELY / INTERRUPT_CANDIDATE | ✅ freezeInterventionCandidate |
| **II3** | 人工 Ground Truth | SHOULD / SHOULD_NOT / UNCERTAIN | ✅ `intervention-ground-truth.util.ts` |
| **II4** | InterventionEvaluation | Over / Missed / Too Early / Too Late | ✅ `intervention-evaluation.util.ts` |
| **II5** | Useful Window + Timing | 有用打断窗口 | ✅ `useful-intervention-window.util.ts` |
| **II6** | Dedup / Cooldown / Hysteresis | 同风险不反复 Candidate | ✅ `dedup-cooldown-hysteresis.util.ts` |
| **II7** | Active Intervention State | 同事件统一生命周期 | ✅ `active-intervention-state.util.ts` |
| **II8** | Proactive Readiness Gate | TQ+Utility+IQ 达标前禁真通知 | ✅ `proactive-readiness-gate.util.ts` |

> **本阶段产物冻结**：Temporal / Utility / Intervention Intelligence 架构冻结。

---

## 13.14 Proactive Surface Pilot（第十五阶段）

> **禁止**直接开放 Push / Notification / Auto Action（含 Auto Apply / Cancel / Reroute）。  
> **新增原则**：**Interrupt Candidate ≠ Notification Authorization**。  
> 仅 Proactive Readiness Gate = PASS 进入真实 Surface Pilot；否则继续 Shadow。  
> 第一阶段仅 **L1 PASSIVE**（打开 TripNARA 时展示，不抢占注意力）。  
> **DoD**：不是 Nara 能主动出现，而是证明「该出现时出现、不该出现时保持沉默」，且主动出现改善 Decision / Action / Outcome。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **PSP1** | Surface Pilot 入口 | Gate PASS→L1；否则 Shadow | ✅ `select-surface-pilot.util.ts` |
| **PSP2** | User Attention Context | DRIVING/NAVIGATING/APP_ACTIVE/BACKGROUND… | ✅ `user-attention-context.util.ts` |
| **PSP3** | Delivery Policy | 渠道由 Policy 独立裁定；Candidate 不定渠 | ✅ `delivery-policy.util.ts` |
| **PSP4** | Silence 策略 | Suppression/Dedup/Cooldown/Attention Budget | ✅ `surface-silence.util.ts` |
| **PSP5** | ProactiveSurfaceEvent | Surface→View→Response→Decision→Action→Outcome | ✅ `proactive-surface-event.util.ts` |
| **PSP6** | L1 Utility | Useful/Unnecessary/Ignore/Action Quality（非 CTR） | ✅ `l1-passive-surface.util.ts` |
| **PSP7** | L2 Canary | Accept/Dismiss/Snooze/Continue Anyway | ✅ `l2-in-app-interrupt-canary.util.ts` |
| **PSP8** | Notification Readiness Gate | Push 独立门禁；当前关闭 | ✅ `notification-readiness-gate.util.ts` |

> **本阶段产物冻结**：Temporal / Utility / Intervention / Surface 基础结构冻结；不继续扩主动能力。

---

## 13.15 Proactive Behavior Validation（第十六阶段）

> **不扩**主动能力面。  
> **新增原则**：**Useful Surface ≠ Sustainable Proactive Experience**；**Notification Permission ≠ Notification Authority**。  
> **DoD**：不是证明「一条主动提示有用」，而是证明完整旅行周期持续高价值、低打扰，且用户愿意长期保留主动关系。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **PBV1** | Proactive Longitudinal Report | Trip/Day 级 Attention Quality | ✅ `proactive-longitudinal-report.util.ts` |
| **PBV2** | SilenceEvaluation | Surface + Suppression 双侧评价 | ✅ `silence-evaluation.util.ts` |
| **PBV3** | 长期行为观察 | Useful/Unnecessary/Dismiss/Snooze/Ignore/Regret | ✅ `proactive-behavior-observation.util.ts` |
| **PBV4** | User Proactive Preference | 偏好等级 ≠ 发送权 | ✅ `user-proactive-preference.util.ts` |
| **PBV5** | Comprehensive Notification Readiness | 多维综合门禁 | ✅ `notification-readiness-comprehensive.util.ts` |
| **PBV6** | Proactive Authority | Scenario×Delivery Level；禁全局 proactive=true | ✅ `proactive-authority.util.ts` |

> **本阶段产物冻结**：Harness / State / Decision / Temporal / Intervention / Proactive **整体冻结**；不再新增智能体架构层。

---

## 13.16 Nara V1 Productization & Release Readiness（第十七阶段）

> **原则**：**Capability Ready ≠ Product Ready**。  
> 验收单位是**用户任务闭环**，不是内部 Runtime。  
> 冻结六条 V1 Journey：Query / Decide / Adjust / Live / Import / Proactive。  
> 产品 Golden：自然语言 → Canonical Result → Card → CTA → Confirm → Apply → Receipt → 页面状态刷新。  
> Closed Beta：真实完整 Trip 驱动 Incident / Regression；除阻断、数据质量、用户理解、性能、稳定、恢复外，不新增 Harness / DI / Temporal / Proactive 抽象。  
> Push 仍按 Scenario × Delivery Level；Auto Apply / Cancel / Reroute 关闭。  
> **DoD**：用户无需理解 TripNARA 内部架构，也能稳定完成查询、选择、调整、执行应对与确认闭环。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **V1P1** | 六 Journey 冻结 | 用户任务合同 | ✅ `delivery/product/v1-journey-contract.util.ts` |
| **V1P2** | Product Golden 管线 | NL→…→Refresh 核验 | ✅ `product-golden-trace.util.ts` |
| **V1P3** | 统一 Product State | 内部投影→用户可理解状态 | ✅ `product-state.util.ts` |
| **V1P4** | Closed Beta 门禁 | Incident / Regression / 变更白名单 | ✅ `closed-beta.util.ts` |
| **V1P5** | Push 产品边界 | 复用既有 Scenario×Level Authority | ✅ `product-push-policy.util.ts` |

> **Release Freeze**：智能体架构整体冻结；进入 Closed Beta Operations。

---

## 13.17 Closed Beta Operations & Release Validation（第十八阶段）

> **原则**：**Architecture Freeze, Evidence-driven Fix**。  
> 不新增 Harness / State / DI / Temporal / Proactive 抽象。  
> 研发任务只能源自：真实 Beta Incident、Task Failure、数据质量、性能、稳定性、恢复、用户理解。  
> 六 Journey 仍为产品验收单位；P0/P1 修复必须沉淀 Regression。  
> Release Gate：Safety / Reliability / Task Success / Experience；Unauthorized Mutation / Harness Bypass / Hard Constraint Regression = 0。  
> 放量：Invite-only → 5% → 20% → 50% → 100%；Trust/Safety 回归立即 Pause / Rollback。  
> **DoD**：多趟真实完整旅行中连续稳定工作，失败可恢复、行为可解释、不会越权，用户愿意继续依赖。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **CBO1** | Beta Trip Cohort | 真实完整 Trip 队列 | ✅ `beta-trip-cohort.util.ts` |
| **CBO2** | Trip Quality Scorecard | Safety/Reliability/Task/Experience | ✅ `trip-quality-scorecard.util.ts` |
| **CBO3** | Nara Incident Record | P0/P1→Regression 强制 | ✅ `nara-incident-record.util.ts` |
| **CBO4** | Real-world / Recovery Golden | 真实回归 + 恢复 | ✅ `real-world-regression-golden` / `recovery-golden` |
| **CBO5** | Release Gate + Rollout | 分阶段放量 / Pause | ✅ `release-gate` / `rollout-stages` |

> **停止路线图驱动能力开发**：进入 Release Operations；无默认「下一 Sprint 新能力」。

---

## 13.18 Release Operations（第十九阶段）

> **停止**路线图驱动的智能体能力开发。  
> Backlog 只由真实 Beta Trip：Incident / Task Failure / Data Gap / Latency / Recovery / User Comprehension / Release Drift 产生。  
> P0/P1 必须 **Trace → Root Cause → Fix → Regression**；无真实证据原则上不进 V1。  
> 冻结 Release Candidate；Model / Prompt / Rule / Knowledge / Decision Policy 版本化入 Trace。  
> Release Review：Safety → Reliability → Task Success → Experience；**Safety / Authority / Hard Constraint 不可被平均抵消**。  
> 产品目标：让真实用户在完整旅行中越来越愿意把重要旅行决策交给 Nara。

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| **RO1** | Release Ops Backlog | 拒路线图新能力；要真实证据 | ✅ `release-ops-backlog.util.ts` |
| **RO2** | Incident Closure Pipeline | Trace→RootCause→Fix→Regression | ✅ `incident-closure-pipeline.util.ts` |
| **RO3** | Release Candidate 冻结 | 五类版本化入 Trace | ✅ `release-candidate.util.ts` |
| **RO4** | 分层 Release Review | Safety 不可平均抵消 | ✅ `release-review.util.ts` |
| **RO5** | Trust Willingness | 托付决策意愿北极星 | ✅ `trust-willingness.util.ts` |

> **V1 路线图封板**：不再往下画架构层；下一层是真实旅行中的用户信任。

---

## 13.19 V1 Roadmap Seal & Operating Model（封板）

> **状态机已切换**：真实 Trip → 行为 → Incident/Failure/Friction → Trace/Evidence → Root Cause → Fix → Regression → RC → 继续真实 Trip。  
> **下一步不预写死**，由真实 Beta 数据决定。  
> 只维持三套固定运营机制：Weekly Release Review / RC Discipline / Trip-level Product Review。  
> North Star：**Successful Assisted Decisions per Active Trip**（每趟旅行有效辅助决策数）。  
> 核心问题从「Nara 还能做什么」变为「哪些决策用户已愿意交给 Nara，哪些还不愿意，为什么」。

| ID | 机制 | 验收 | 状态 |
|----|------|------|------|
| **OM1** | Weekly Nara Release Review | 四层→仅 P0/P1/DataGap/Friction | ✅ `weekly-release-review.util.ts` |
| **OM2** | RC Discipline | RC钉版本；仅 Fix P0/P1；再真实 Trip | ✅ `rc-discipline.util.ts` |
| **OM3** | Trip Product Review | Trip 级 PASS/WATCH/FAIL | ✅ `trip-product-review.util.ts` |
| **OM4** | 五信号 + North Star | Correction/Abandon/Recovery/Reuse/Delegation | ✅ `trust-signals-north-star.util.ts` |
| **OM5** | Capability Addition Gate | Evidence→缺口才可议新能力 | ✅ `capability-addition-gate.util.ts` |
| **OM6** | Roadmap Seal | 架构弧封板 | ✅ `v1-roadmap-seal.util.ts` |

> **建设期结束 → 运营验证期**：主循环 Use→Observe→Diagnose→Fix→Verify→Release。没有新研发任务可以是正常周结果。

---

## 13.20 Operations Verification Discipline（运营验证期）

> 任何动作必须能回答：被哪一个真实 Trip / Incident / 用户行为证据触发？回答不了 → **先不做**。  
> Weekly 收敛为一页决策；**New Capability = NO** 有价值。  
> North Star 配约束：Serious Decision Regret↓；Unauthorized/Unsafe=0。  
> **V1.1 现在不立项**；入口需重复证据+重复需求+V1 不可解+实质价值。  
> 不再证明「技术上还能做什么」；证明用户何时自然想到「这件事我问一下 Nara」。

| ID | 机制 | 状态 |
|----|------|------|
| **OV1** | 动作触发门禁 | ✅ `ops-verification-discipline.util.ts` |
| **OV2** | Weekly Decision Page | ✅ `weekly-decision-page.util.ts` |
| **OV3** | North Star + Guards | ✅ `north-star-with-guards.util.ts` |
| **OV4** | V1.1 Entry Gate（未启动） | ✅ `v11-entry-gate.util.ts` |

> **运营系统状态**：不是研发路线图状态。New Capability = NO 是健康结果。资产重心：真实 Trip / Decision / Outcome / Incident / 用户信任。

---

## 13.21 Operations System（运营系统期）

> **No evidence, no feature.**  
> **Nara V1 的下一版本，不由我们想象出来，而由真实旅行暴露出来。**  
> 只看三类证据：信任增长 / 失败集中点 / 重复不可解需求。  
> Weekly 首问：「这周真实 Trip 告诉了我们什么？」无系统性问题 → 继续跑 Trip。  
> 产品研究对象：Trust Map（为何想到/相信/依赖 Nara）。  
> 非使用诊断顺序：Discoverability → … → Existing Gap → **仅最后** V1.1 Candidate。

| ID | 产物 | 状态 |
|----|------|------|
| **OS1** | Ops System Principles + 墙标语 | ✅ `ops-system-principles.util.ts` |
| **OS2** | Nara Trust Map | ✅ `nara-trust-map.util.ts` |
| **OS3** | Non-use Diagnosis 顺序 | ✅ `non-use-diagnosis.util.ts` |
| **OS4** | Weekly Trip Insight | ✅ `weekly-trip-insight.util.ts` |

---

## 14. Migration Strategy

1. **不关现有能力**：先 Guard + Contract，再迁 Runtime。  
2. **Admission Gate 保留为编译器内部策略**，对外只暴露 TaskContract。  
3. **ModeLock** 继续仅绑 `planning_operation_id` / 未完成 operation。  
4. **前端**：`intent_mode` / `entry_point` 降级为 hint；续聊传 `planning_operation_id`；CTA 开新 task，不复用 Query turn。  
5. **评测**：Golden Cases 进 CI；与现有 `route-and-run-golden-eval-fixtures` 对齐扩展，不另起炉灶。

---

## 15. Definition of Done（阶段 DoD）

### Sprint 1（Foundation）完成当且仅当：

1. Fast Query Golden Cases **全部绿**（含 MUST NOT 进 PLAN/SOLVER/VERIFY/REPAIR）。  
2. 「哪一天没住宿」+ `itinerary_day_editor` + `intent_mode=TRIP_PLANNING` → **轻量答缺住**，TripRun.`mode_final` ≠ 误入的 Full Planning SM。  
3. Trace 可回答：本轮 taskType / allow-deny / runtime / 是否被拒绝升级。  
4. Code Review 检查表含：P1–P10；新增能力必须声明 Capability + Authority。  
5. **禁止**再以「加一条 DATA_LOOKUP 白名单」作为误路由的主修复手段（应改 Contract / Guard）。

### Hardening（第二阶段）完成当且仅当：

1. HTTP 真入口 Golden E2E（Q01/E01/D01）绿。  
2. Runtime Transition：无 `explicitEscalation` / `newTaskId` / `strongConfirmation` 时不得隐式跨 Runtime 升级。  
3. Evidence Sufficiency：无 VERIFIED 不得 STRONG；Live 路径强制降级。  
4. Adjustment SM：PLAN_GEN/SOLVER/REPAIR 受 Capability+Scope；Confirm 前 APPLY 拒绝。  
5. AgentTurnTrace 覆盖 Task→…→Action，并出现在 observability。  
6. 验收指标：**Capability 越权率 = 0，无证据强结论率 = 0，未授权写入率 = 0**（Runtime 越权率跟踪并趋近 0）。

### State & Learning Foundation（第三阶段）完成当且仅当：

1. TravelWorldState 可投影七类切片，且标明 `PROJECTION_ONLY`（不写回 Trip）。  
2. TravelEvent Ledger 能把同一 turn 的 Decision / PlanVersion / ActionReceipt / AgentTurnTrace 关联查询。  
3. 三类 Episodic 仅从 Ledger 投影，且 Memory≠Truth 护栏拒绝 EVIDENCE/GATE/VERIFY/TRUTH 角色。  
4. Arrival / Fatigue / Risk Outcome 可生成对照记录，且 `learningSignalOnly=true`。  
5. **未**引入新 Runtime / 路由规则 / Guard；**未**做开放式长期记忆 / 自动 Skill / 多 Agent 策略自改。  
6. Gateway / Live / Decision 可观测回显 `travel_world_state`；Confirm→Apply 写入 Ledger 关联；Outcome 经 options 落入 `OUTCOME` 且 `not_evidence=true`。

### State & Learning Hardening（第四阶段）完成当且仅当：

1. TravelWorldState 带 provenance / freshness / confidence，Consistency Check 能检出 ERROR 级不一致。  
2. 因果链可按 turn 回放完整相位序列。  
3. Episode Assembler 仅产出既有三类 Episode，且 `isTruth=false`。  
4. Outcome Trigger 仅映射既有三类 Outcome，由 Execution Event 触发。  
5. Learning Signal `mutatesPolicy=false`；对 CONTRACT/RULE/GATE/SOLVER_WEIGHT 的 mutation 尝试一律拒绝。  
6. Decision Replay 产出对比信号，**不**修改正式 Policy。  
7. **未**新增 Runtime；**未**扩大 Memory 类型。

### Decision Intelligence Validation（第五阶段）完成当且仅当：

1. DecisionEvaluation 明确 `predictionIsNotDecision` 与 `counterfactualIsNotObserved`。  
2. Outcome Attribution 覆盖四类，反事实不得记为 Observed。  
3. Learning Signal 仅能改变 Shadow Recommendation，Production 不变。  
4. L1/L2/L3 Benchmark 可跑且结果可汇总 passRate。  
5. Promotion 必须顺序推进；APPROVAL 需要 **人工批准** + **Candidate 优于 Production 的证明**。  
6. Hard Constraint / Gate BLOCK / Safety Rule 无法被 Learning 自动修改。  
7. DoD：**`proveCandidateBetterThanProduction` 能给出可审计证明**（非“新接口已完成”）。

### Production Decision Canary（第六阶段）完成当且仅当：

1. Canary Controller 按 DecisionKey / Trip Scope / Risk Level 限定；高安全 Key **Production-only**。  
2. Production 与 Candidate 评估共用同一 WorldState+Evidence Snapshot。  
3. 多维指标齐全；Safety/Feasibility 回归可检测。  
4. DataQualityGate：低质 WorldState / Evidence 不足 / Outcome 不可观测 **不进** Candidate 质量统计。  
5. DecisionRegret 覆盖 Rollback / Immediate Replan / User Correction。  
6. DoD：**`proveCanaryBetterInProduction`** 在 Eligible Sample 上、Safety/Feasibility 零退化前提下，证明 Outcome 或用户决策质量优于 Production。  
7. 明确 **Offline Better ≠ Production Better**。

### Production Evidence Accumulation（第七阶段）完成当且仅当：

1. CanaryExperiment 固化成功/回滚条件，且标注 `canaryPassedIsNotPolicyProven`。  
2. Dashboard 能按 DecisionKey 汇总 Eligible Sample 与多维指标。  
3. 未达最小有效样本 / 观察周期 / Outcome 证据 / 生产证明时 **不得晋升**。  
4. Safety / Hard Constraint / Unauthorized Mutation 触发 Kill Switch，流量回退 Production。  
5. Production≠Candidate 分歧可沉淀为 DecisionDisagreementEvent。  
6. Travel Decision Dataset 可追加完整决策链；`readyForTemporalProactive` 仅在数据量达标后为 true。  
7. **未**进入 Temporal & Proactive Decision；**未**新增 DI 抽象层。

### Real Decision Pilot（第八阶段）完成当且仅当：

1. 仅开放四类低风险 Pilot DecisionKey。  
2. Funnel 能统计 Raw→Evaluation Valid→Disagreement 漏斗。  
3. Failure Taxonomy 与 Disagreement 分类可标注真实 Case。  
4. Evaluation 必须按 Slice 查看（DecisionKey / Trip Phase / Evidence Quality），**禁止**只报全局平均。  
5. Observation Timeline 仅记录已有 WorldState/Evidence/Event，无预测逻辑。  
6. Temporal Readiness Gate 在 Outcome Observability / Attribution / Quality / Temporal Coverage 未达标时 **ready=false**。  
7. DoD：**产出第一批高质量 Travel Decision Dataset（Evaluation Valid Episodes）**，而非「更多测试通过」。

### Pilot Operations & Dataset Qualification（第九阶段）完成当且仅当：

1. Runbook 固定 Trip Enroll→Dataset 流程。  
2. 四 Pilot Key 各有冻结的 Outcome Observation Contract。  
3. Funnel Drop 能回答「掉在哪一步、为什么、缺什么数据」。  
4. Density/Coverage 可计算且无 Prediction。  
5. Temporal Readiness **分维度**输出 ready/UNKNOWN + blockers；`thresholdsFrozen=false` 时总 ready 不得因测试机械变 true。  
6. Disagreement/Poor/Inconclusive 可进入 Case Review。  
7. DoD：报告能回答 **为何还不能进 Temporal** 与 **还需积累的数据类型**。

### Pilot Calibration & Threshold Freezing（第十阶段）完成当且仅当：

1. Qualification Report 可持续输出 Funnel / Observability / Validity / Density / Coverage。  
2. 研发任务来自排序后的真实 Top Data Gap / Backlog。  
3. Poor/Disagreement/Inconclusive Case Review **必须**归因到 STATE/EVIDENCE/DECISION/OUTCOME/ATTRIBUTION。  
4. 已采集 readiness 指标 P50/P75/P90；Threshold Proposal 需人工批准。  
5. Temporal 资格按 **Scenario** 独立判断；`globalGateForbidden=true`。  
6. DoD：能说明 **哪些场景合格/不合格及证据**，而不是全局 Gate 翻转。

### Temporal Scenario Graduation（第十一阶段）完成当且仅当：

1. 无 QUALIFIED 场景时明确 CONTINUE_PILOT，且不开发 Temporal。  
2. Scenario Qualified 后仍须显式 Shadow 授权（Qualified ≠ Authorized）。  
3. 目标场景 Contract 冻结；投影方法仅为 DETERMINISTIC_RULE。  
4. TemporalImpact：`isPrediction=true` / `isDecision=false`；不可绕过 Harness 成 Action。  
5. 仅 Shadow：不向用户主动展示、不触发调整。  
6. TemporalEvaluation 可对账；**Quality Gate 通过**才允许 User-visible Temporal；Proactive 仍关。  
7. DoD：在真实 QUALIFIED+Authorized 场景上，证明 Shadow 预测质量可接受（非“能跑预测”）。

### Temporal Shadow Validation（第十二阶段）完成当且仅当：

1. 仅 QUALIFIED + APPROVED_FOR_SHADOW 跑真实 Shadow；否则 CONTINUE_PILOT。  
2. 每条预测冻结 prediction-time Snapshot；未来 Evidence 不得回填过去预测。  
3. Shadow Record 完整：Snapshot → Impact → Observed Timeline → Outcome Interpretation → Evaluation → Attribution。  
4. Failure Attribution 覆盖 STATE / EVIDENCE / PROJECTION / RULE_BOUNDARY / EXTERNAL_CHANGE / USER_BEHAVIOR / OBSERVATION_GAP。  
5. 用户行为或现实轨迹变化后的未发生事件 **不得**直接记为 False Alert。  
6. Confidence Calibration 可判定置信度是否可信；Quality Report **按场景**输出，禁止仅全局 aggregate 裁决。  
7. Gate 通过后仅允许 USER_VISIBLE_TEMPORAL；Impact 仍仅 Decision Runtime Evidence；Proactive / Auto Action 仍关。  
8. DoD：能证明「何时准、何时不准、为何不准、置信度是否可信」，并据此决定是否用户可见（非 Shadow 跑通）。

### Temporal Decision Utility Validation（第十三阶段）完成当且仅当：

1. Quality Gate 未过场景继续 Shadow；仅通过者可 USER_VISIBLE_TEMPORAL。  
2. PresentationPolicy 按 Evidence / Freshness / Confidence / Calibration 控制展示与语言/时间精度；UI 精度 ≤ 预测真实精度。  
3. User-visible 仅 USER_ASKED / DECISION_RUNTIME；禁止主动打断。  
4. TemporalDecisionUtility 可对照评价 Completion / Timing / Correction / Regret / Outcome。  
5. ActionableLeadTime 证明「提前知道」增加有效行动窗口。  
6. Utility+LeadTime 通过后才可建 InterventionCandidate Shadow；只记 SHOULD/SHOULD_NOT INTERRUPT，不通知用户。  
7. Intervention Quality 通过后才可提交 Proactive Readiness Review；Auto Action 仍禁。  
8. DoD：证明用户看到未来信息后决策更及时、更少后悔、更高质量（非「Temporal 出现在 UI」）。

### Intervention Intelligence Validation（第十四阶段）完成当且仅当：

1. InterventionCandidate 正式冻结，含 Severity / Urgency / Confidence / Actionability / Actionable Lead Time / Disruption Cost。  
2. Shadow 输出三级且不通知用户。  
3. 人工 Ground Truth 可标 SHOULD_INTERRUPT / SHOULD_NOT_INTERRUPT / UNCERTAIN。  
4. InterventionEvaluation 能识别 Over / Missed / Too Early / Too Late。  
5. Useful Intervention Window + Timing Evaluation 可判定最佳打断时机。  
6. Dedup / Cooldown / Hysteresis 抑制同风险反复 Candidate。  
7. Active Intervention State 保证同事件单一生命周期。  
8. Proactive Readiness Gate：Temporal Quality + Decision Utility + Intervention Quality 均达标前禁止真正通知；Notification / Push / Auto Apply 全关。  
9. DoD：Shadow 证明「值得打断什么、何时打断、不过度打扰」——而非「系统已会提醒」。

### Proactive Surface Pilot（第十五阶段）完成当且仅当：

1. 仅 Gate=PASS 进入 Surface Pilot；否则继续 Shadow。  
2. 第一阶段仅 L1 PASSIVE（打开 App 展示，不抢占）。  
3. ProactiveSurfaceEvent 覆盖 Surface→…→Outcome。  
4. Attention Context + Delivery Policy 独立裁定渠道；Candidate 不得自决 Channel。  
5. Suppression / Dedup / Cooldown / Attention Budget 可明确「保持沉默」。  
6. L1 以 Useful / Unnecessary / Ignore / Action Quality 验证（非 CTR）；通过后才可小范围 L2。  
7. L2 支持 Accept / Dismiss / Snooze / Continue Anyway 做 Attention Quality 对账。  
8. Notification Readiness Gate 独立且当前关闭；Auto Apply / Cancel / Reroute 始终关闭。  
9. DoD：证明该出现时出现、不该出现时沉默，且主动出现改善 Decision / Action / Outcome。

### Proactive Behavior Validation（第十六阶段）完成当且仅当：

1. Longitudinal Report 可输出 Trip/Day 级 Attention Quality。  
2. SilenceEvaluation 同时评价 Surface 与 Suppression（反过度提醒与过度沉默）。  
3. 可观察 L1/L2 长期行为：Useful / Unnecessary / Dismiss / Snooze / Repeated Ignore / Intervention Regret。  
4. User Proactive Preference 仅表达介入等级，不授予发送权。  
5. Notification Readiness 综合 TQ / Utility / Intervention / Timing / Fatigue / Silence / L1-L2 / Preference。  
6. Proactive Authority 按 Scenario × Delivery Level 独立授权；禁止全局 `proactive=true`。  
7. Push 仅在具体 Scenario Readiness PASS **且** Scenario×PUSH 授权后才可；Auto Apply/Cancel/Reroute 永关。  
8. DoD：完整旅行周期可持续高价值、低打扰，用户愿意长期保留主动关系（非单次提示有用）。

### Nara V1 Productization & Release Readiness（第十七阶段）完成当且仅当：

1. 六条 V1 Journey（Query / Decide / Adjust / Live / Import / Proactive）合同冻结。  
2. 产品 Golden 可核验 NL → Canonical Result → Card → CTA → Confirm → Apply → Receipt → 页面刷新。  
3. 统一 Product State 对用户隐藏内部架构。  
4. Closed Beta 以真实 Trip 驱动 Incident / Regression；变更仅允许阻断/数据质量/理解/性能/稳定/恢复。  
5. 禁止新增 Harness / DI / Temporal / Proactive 抽象；禁止全局 proactive 与 Auto Apply/Cancel/Reroute。  
6. Push 仍按 Scenario × Delivery Level。  
7. DoD：用户无需理解内部架构，也能稳定完成真实旅行中的查询、选择、调整、执行应对与确认闭环（Capability Ready ≠ Product Ready）。

### Closed Beta Operations & Release Validation（第十八阶段）完成当且仅当：

1. Beta Trip Cohort 与 Trip Quality Scorecard 可对真实完整 Trip 计分。  
2. Nara Incident Record 覆盖真实事故；**P0/P1 修复必须沉淀 Regression**。  
3. Real-world Regression Golden 与 Recovery Golden 可跑且进 Release Gate。  
4. Release Gate 检查 Safety / Reliability / Task Success / Experience；三类零容忍计数 = 0。  
5. 放量路径 Invite-only→5%→20%→50%→100%；Trust/Safety 回归可 Pause/Rollback。  
6. 研发任务仅 Evidence-driven；Architecture Freeze。  
7. DoD：多趟真实旅行连续稳定、可恢复、可解释、不越权，用户愿意继续依赖（非“功能都在”）。

### Release Operations（第十九阶段）完成当且仅当：

1. 无默认「下一 Sprint 新能力」；Backlog 仅来自真实 Beta 证据源。  
2. P0/P1 必须完成 Trace → Root Cause → Fix → Regression 才可结案。  
3. Release Candidate 冻结且 Model/Prompt/Rule/Knowledge/Decision Policy 版本化入 Trace。  
4. Release Review 按 Safety→Reliability→Task Success→Experience；Safety/Authority/Hard Constraint **不可被平均抵消**。  
5. 产品北极星转为：用户在完整旅行中愿意把重要旅行决策交给 Nara。  
6. 没有真实证据的问题原则上不进入 V1。

### V1 Roadmap Seal（封板）完成当且仅当：

1. 宣布不再新增架构层；运营状态机为真实 Trip 证据驱动。  
2. 三套机制落地：Weekly Review / RC Discipline / Trip Review。  
3. North Star 收敛为「每趟旅行有效辅助决策数」；拒绝以 DAU/对话次数/Token 为主指标。  
4. 能力新增必须过 Evidence→任务存在→现有不可解→分类；仅 NEW_CAPABILITY_CANDIDATE 可提交人工审批。  
5. 核心问题切换为：哪些决策用户愿交 Nara、哪些不愿、为什么。

### Operations Verification（运营验证期）完成当且仅当：

1. 无真实 Trip/Incident/行为证据的动作一律不做。  
2. Weekly Decision Page 可产出；允许「零新研发任务」周。  
3. North Star 与 Regret↓ / Unauthorized=0 同时约束。  
4. V1.1 入口条件存在且默认不立项。  
5. 主循环收敛为 Use→Observe→Diagnose→Fix→Verify→Release。

---

## 16. 研发启动检查清单（Gap Analysis 模板）

对每条主链回答：

| 问题 | 现状文件/函数 | Gap | Owner |
|------|---------------|-----|-------|
| TaskContract 在哪生成？ | `compile-agent-task-contract.util.ts` + entry fork | ✅ | |
| 谁 enforce deny PLAN？ | `assert-task-capability` + Admission 编译 | ✅ Guard 入口 | |
| Context 谁按需加载？ | `resolve-task-context-slice` + lodging/timeline fact | ✅ 6 Fast Query key | |
| Trace 字段是否齐全？ | observability `agent_task_contract` | ✅ 最小投影 | |
| Golden Case 是否 CI？ | harness + decision + adjust + trip-slice e2e | ✅ Sprint1–3 子集 | |

---

## 附录 A. 与现有代码映射（起步）

| 概念 | 现有落点 | 迁移方向 |
|------|----------|----------|
| Admission | `planning-admission-gate.util.ts` | → TaskContractCompiler |
| Intent hint | `orchestration-signals.util.ts` | hint only；不写死 runtime |
| SM 入口 | `request-router.util.ts` | Runtime Guard |
| ModeLock | `orchestration-stability.util.ts` | operation-scoped（已改） |
| 路由协议 | `ROUTE_AND_RUN_ROUTING_PROTOCOL.md` | 与 Runtime Matrix 对齐 |
| UI ABI | ConversationTurnResult / cards | 保持稳定，内部换 Runtime |

---

## 附录 B. 冻结给团队的架构句

> Nara 的统一，不是把所有请求统一送进一个 Agent 状态机，而是统一 **Task Contract、Context Contract、Evidence Contract、Authority Contract 和 Result Contract**。不同旅行任务运行在不同 Runtime 中；**LLM 负责理解与推理，Harness 负责状态、边界、验证、权限和执行。**

> **Memory ≠ Truth**：TravelWorldState / Ledger / Episodic / Outcome 都是投影或学习信号；实时事实路径仍只能走 Evidence、Gate、Verify。Reasoning ≠ Authority 继续冻结。

> **Learning ≠ Policy Mutation**：Learning Signal 只可观测 / Context Hint / Replay Compare；禁止改 Contract、Rule、Gate、Solver 权重或 Runtime Capability。

> **Prediction ≠ Decision**；**Counterfactual ≠ Observed Outcome**：评价与归因必须区分预测、正式决策、反事实假设与真实观测。Candidate 晋升以证明优于 Production 为准，而非新模型上线。

> **Offline Better ≠ Production Better**：离线 Benchmark / Shadow 优越不能直接当作生产 Canary 优越；须在真实 Eligible Sample 上、Safety/Feasibility 零退化，才能证明生产侧更优。

> **Canary Passed ≠ Policy Proven**：实验/单测通过不能替代晋升证据；须满足最小有效样本、观察周期与 Outcome 证据。真实数据积累完成前，不进入 Temporal & Proactive Decision。

> **Real Decision Pilot**：暂停扩基础设施。先用四类低风险 Decision 积累 Eligible Episode 与高质量 Dataset；Evaluation 必须 Slice 化；Temporal Readiness Gate 未开之前，禁止 Temporal / Proactive。

> **Pilot Operations**：用 Runbook + Outcome Contract + Drop Reason + 分维度 Readiness 解释「为何不能进 Temporal、缺什么数据」；阈值先看分布再冻结，禁止 Gate 机械翻转。

> **Pilot Calibration**：Top Data Gap 驱动研发；Threshold Proposal 人工批准后按 Scenario 冻结；用真实数据解释场景资格，禁止全局 Temporal Gate。

> **Temporal Scenario Graduation**：**Scenario Qualified ≠ Temporal Authorized**。无合格场景则继续 Pilot。仅 deterministic Shadow Projection → TemporalImpact（预测证据）→ Quality Gate 后才可 User-visible；禁止通用 Temporal Runtime / Proactive / Causal。

> **Temporal Shadow Validation**：**Future Evidence ≠ Past Prediction Evidence**。Graduation 架构冻结。真实 Shadow 须冻结 prediction-time Snapshot；按场景报告何时准/不准/为何不准与置信度校准；禁止仅全局分裁决用户可见；Proactive / Auto Action 仍关。

> **Temporal Decision Utility**：**Accurate Prediction ≠ Useful Intervention**；UI 表达精度不得高于预测真实精度。User-visible 仅主动提问/Decision Runtime；效用与 LeadTime 证明后再建 Intervention Shadow；Proactive 仅可提交 Readiness Review，Notification / Auto Action 仍禁。

> **Intervention Intelligence**：**Useful Information ≠ Worth Interrupting**。三级 Shadow（不通知）+ 人工 GT + Over/Miss/Timing 评价 + Dedup/Cooldown/Hysteresis + Active State；三闸未齐前禁止真通知；Push / Auto Apply 全关。

> **Proactive Surface Pilot**：**Interrupt Candidate ≠ Notification Authorization**。Gate PASS 后仅 L1 PASSIVE；Delivery Policy 独立定渠；必须能保持沉默；L1 效用非 CTR；L2 小范围 Canary；Push 需独立 Notification Gate（当前关）；Auto Apply/Cancel/Reroute 始终关。

> **Proactive Behavior Validation**：**Useful Surface ≠ Sustainable Proactive Experience**；**Notification Permission ≠ Notification Authority**。纵向 Trip/Day 评价 + Silence 双侧；Authority 按 Scenario×Level；禁全局 proactive；Push 须综合 Readiness+授权；Auto Action 永关。

> **Nara V1 Productization**：**Capability Ready ≠ Product Ready**。验收单位是用户任务闭环；六 Journey 冻结；Product Golden + Product State + Closed Beta；不新增智能体架构层；Push 按 Scenario×Level；Auto Apply/Cancel/Reroute 关闭。

> **Closed Beta Operations**：**Architecture Freeze, Evidence-driven Fix**。Cohort + Scorecard + Incident→Regression + Recovery + Release Gate；Invite-only→100% 放量；Trust/Safety 回归 Pause/Rollback；零越权。

> **Release Operations**：停止路线图新能力。Backlog 只认真实 Trip 证据；P0/P1=Trace→RootCause→Fix→Regression；RC 五类版本入 Trace；Release Review 四层且 Safety 不可平均抵消；目标是用户愿意把重要旅行决策交给 Nara。

> **V1 Seal**：架构弧封板（Reasoning→…→Release Operations）。只跑 Weekly Review / RC Discipline / Trip Review；North Star=每趟有效辅助决策数；下一步由真实 Beta 决定，不再预写「下一能力」。

> **运营验证期**：建设期结束。动作须绑定真实 Trip/Incident/行为证据；Weekly 一页决策且 New Capability 默认为 NO；North Star 受 Regret/Unsafe 约束；V1.1 不立项；主循环 Use→Observe→Diagnose→Fix→Verify→Release。

> **运营系统期**：**No evidence, no feature.** 下一版本由真实旅行暴露。只看信任增长/失败集中/重复不可解需求；Trust Map 指导 V1.1 优先区；非使用诊断到最后才议新能力；无系统性问题就继续跑 Trip。
