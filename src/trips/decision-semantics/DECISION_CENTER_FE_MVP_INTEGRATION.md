# Decision Center 前端 MVP 联调说明（V1.6.2 Release Gate）

**读者：** 前端 / 联调 QA  
**开发基线：** [HARNESS_DECISION_CENTER_BASELINE.md](./HARNESS_DECISION_CENTER_BASELINE.md)（当前 Sprint / Release Gate DoD）  
**产品目标：** [DECISION_CENTER_V1.0.md](./DECISION_CENTER_V1.0.md)（完整 V1.0 能力边界，非本 Sprint 全量交付）  
**契约：** `DECISION_SEMANTICS_FRONTEND_API.md` §4.1  
**RFC-002 Canonical L2：** [UNIFIED_DECISION_FRONTEND_INTEGRATION.md](./UNIFIED_DECISION_FRONTEND_INTEGRATION.md)  
**后端 gate：** 6 blocker cases / 7 tests — `npm run harness:blockers` + `npm run harness:replay`

---

## 阶段判断

| | 状态 |
|---|------|
| 后端 Release Gate | ✅ 已闭环 |
| 产品 Release Gate | ⏳ 待前端消费 V1.6.2 执行态 |

**Sprint 唯一主目标：** 任何非真正完成的 apply，不得被用户误认为成功。

---

## 0. 后端联调注意（必读）

联调时确认以下字段**已出现在响应 JSON 中**（非 `null`、非仅靠前端推断）：

| 场景 | 要求 |
|------|------|
| **幂等第二次 `POST decisions`** | 至少其一：`idempotentReplay: true` **或** `executionStatus: 'IDEMPOTENT_REPLAY'`（当前实现**两者都回**）；否则前端无法走 `neutral_replay`，会误刷新行程 / 绿 success |
| **`GET decision-center/overview`** | `recentDecisions[]` 每项须含 **`executionStatus`**；半成功还须 **`needsRepair: true`**，L1 待处理条带与 badge 才出现 |

首次 POST（非重放）：`idempotentReplay: false` + 正常 `executionStatus`（如 `APPLIED` / `RECORDED`）。

验收用例：`DC-FE-015`（E2E）、`DS-BLOCKER-IDEMPOTENCY-001`（harness）。

**road_class 单段距离文案：** 须读 `c_max_segment_distance` 当前值生成 `>Nkm`，禁止写死冰岛默认 250 — 见 `TRIP_CONSTRAINTS_API.md` §`c_max_segment_distance` → 用户可见文案。

---

## 1. MVP 范围 — 按决策链路（非按页面模块）

### 链路 1–2：Problem 读模型 + Preview

- 主读模型 **仅** `GET decision-problems` / `GET decision-problems/:id`（禁止拼 feasibility/Gate 冲突中心）
- Preview 与 Apply 同一 `problemId` + `optionId` + 版本

### 链路 3–6：Apply / Poll / 半成功 / Stale（ticket 映射）

| ID | 做什么 | 验收 |
|----|--------|------|
| DC-FE-001 | `@/generated/decision-semantics-contracts` + 状态机 helper | `npm run decision-center:contract` |
| DC-FE-003 | 稳定 `idempotencyKey` + SUBMITTING 状态锁 | 连点 2 次 → replay；revision +1 |
| DC-FE-004 | POST 后 `classifyCreateDecisionOutcome` | 非 in_progress 不乱 poll |
| DC-FE-005 | 轮询至终态（含 `IDEMPOTENT_REPLAY` / `PARTIALLY_APPLIED` / `ROLLED_BACK`） | 禁止 HTTP 200 = success |
| DC-FE-006 | variant UI 映射（§3） | replay / stale / partial 禁绿 success |
| DC-FE-009 | 仅 `shouldRefreshItinerary` 时 invalidate 行程 | replay / stale 不刷新 |

**L1（DC-FE-007，强烈建议同 PR）：** `isDecisionPendingAttention('PARTIALLY_APPLIED')` → 待处理 badge，不算已解决。  
`GET decision-center/overview` → `recentDecisions[]` 每项含 **`executionStatus`**、**`recordStatus`**、**`needsRepair`**（勿只读 `status` 或仅 `decisionId`）。

---

## 2. 推荐 import（不要手写 if 链）

```typescript
import {
  buildDecisionIdempotencyKey,
  classifyCreateDecisionOutcome,
  classifyExecutionStatusPoll,
  shouldPollDecisionExecution,
  isDecisionPendingAttention,
} from '@/generated/decision-semantics-contracts';
```

**IdempotencyKey（同一用户意图稳定）：**

```typescript
const idempotencyKey = buildDecisionIdempotencyKey({
  tripId,
  problemId,
  selectedOptionId,
  clientAttemptId: 'default', // 换方案时换 optionId 即可；勿每次 random
});
```

**POST 后分类：**

```typescript
const outcome = classifyCreateDecisionOutcome(createResponse.data);
if (outcome.shouldShowSuccessToast) toast.success(outcome.defaultTitle);
if (outcome.shouldRefreshItinerary) queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
if (!outcome.isTerminal && shouldPollDecisionExecution(createResponse.data.executionStatus!)) {
  startPoll(decisionId);
}
```

**轮询 tick：**

```typescript
const poll = await api.getExecutionStatus(tripId, decisionId);
const outcome = classifyExecutionStatusPoll(poll.data);
// 用 poll.explanation 覆盖 defaultTitle；规则与 POST 相同
```

---

## 3. UI variant 速查

| `variant` | 颜色 | 刷新行程 | Success toast | 主 CTA |
|-----------|------|----------|---------------|--------|
| `success` | 绿 | ✅ | ✅ | 查看变更 |
| `in_progress` | Loading | ❌ | ❌ | — |
| `neutral_replay` | Info | ❌ | ❌ | 查看原决策 → `effectiveDecisionId` |
| `warning_needs_repair` | 橙 | ✅ | ❌ | 继续修复 |
| `error_rolled_back` | 红 | ✅ | ❌ | 重新选方案 |
| `blocked_stale_evidence` | 黄 | ❌ | ❌ | 刷新路况/证据 |
| `error_failed` | 红 | ❌ | ❌ | 重试 / 换方案 |

---

## 4. API 字段（POST + poll 都要读）

```typescript
// POST /api/trips/:tripId/decisions
{
  idempotencyKey?: string;
  // … problemId, selectedOptionId, acknowledgement, execute
}

// Response data
{
  executionStatus?: DecisionExecutionStatus;
  idempotentReplay?: boolean;
  effectiveDecisionId?: string;
  needsRepair?: boolean;
  postApplyCoherence?: { outcome; failureMessage?; needsRepair? };
  evidenceFreshnessBlock?: { blocked; reasonCode?; staleEvidenceTypes; requiresEvidenceRefresh? };
  applyResult?: { status; message; blockerId? };
}
```

**识别规则（与后端 Release Gate 一致）：**

1. `evidenceFreshnessBlock.blocked` → 未改行程，引导刷新证据  
2. `idempotentReplay` 或 `executionStatus === 'IDEMPOTENT_REPLAY'` → 不二次成功  
3. `needsRepair` 或 `postApplyCoherence.outcome === 'PARTIALLY_APPLIED'` → 半成功，禁绿 success  
4. `postApplyCoherence.outcome === 'ROLLED_BACK'` 或 `executionStatus === 'ROLLED_BACK'` → 回滚说明  

---

## 5. 契约级 E2E 场景（前端 `decision-center:e2e`）

| # | 场景 | 断言要点 |
|---|------|----------|
| 1 | 重复点击 | 同 key；第二次 neutral_replay；revision +1；无二次 success 动画 |
| 2 | APPLIED + validation pending | 不绿 success；继续 poll 至终态 |
| 3 | PARTIALLY_APPLIED | 不绿 success；needsRepair 可见；problem 不关闭 |
| 4 | IDEMPOTENT_REPLAY | 不失败 toast；从服务端拉最新行程 |
| 5 | DATA_STALE | Apply 禁用 → 刷新 → 重 preview → 再 apply |
| 6 | 轮询中断恢复 | 刷新/断网后用原 key/ref；终态与服务端一致 |

## 6. 手工联调清单（QA）

### 6.1 API 自动化（本地 / staging）

```bash
npm run decision-center:staging-qa
npm run decision-center:staging-qa -- 3e4a1058-9218-467f-988a-c18008a14385
```

**2026-06-30 本地结果（`npm run dev` + 上述脚本）：**

| 检查项 | `807b3c54…`（默认） | `3e4a1058…`（冰岛） |
|--------|---------------------|---------------------|
| 问题列表 | ✅ 10 | ✅ 3 |
| `affectedScopeDisplay` | ✅ `第 5 天` | ✅ 多天/POI/路段标签 |
| 数值 tradeoffs | —（无交通时间不足问题） | ✅ 3/5 options |
| buffer +30/+60 区分 | SKIP（无 preset） | SKIP（跨天修法） |
| preview tradeoffs | — | ✅ |
| 正常 apply | fallback `RECORDED` + 幂等 ✅ | ✅ `APPLIED` |
| 连点幂等 | ✅ `IDEMPOTENT_REPLAY` | ✅ |
| road_class 无 `>250km` | ✅ | — |
| overview `executionStatus` | ✅ | ✅ |

`buffer-add-30/60` 区分由单测覆盖（`travel-timing-repair.util.spec.ts`、`tradeoff.normalizer.spec.ts`）；fixture 行程多为跨天/结构性修法时脚本 **SKIP** 该项。

Apply 需带 `acknowledgement: ['已确认应用该修复方案']`（BLOCK 策略）。

### 6.2 前端手工项（staging）

在 staging 对**同一问题 + 同一方案**：

- [x] **正常 apply** → 绿 success + 行程 refresh + 问题 RESOLVED（冰岛 `add_buffer` → `APPLIED`）  
- [x] **连点确认 2 次** → 第二次 `idempotentReplay` / `IDEMPOTENT_REPLAY`，无二次副作用（API 已验）  
- [ ] **证据过期**（`staleRepairEvidence` fixture 或真实 stale）→ 黄提示，行程不变  
- [ ] **半成功**（route recalc fail 注入）→ 橙 warning + L1 待处理 +1  
- [ ] **轮询** → `APPLYING` 时 spinner；进入终态后停止 poll  

后端本地回归（改 decision-semantics / harness 时）：

```bash
npm run harness:blockers
npm run harness:replay
npx jest src/trips/decision-semantics/frontend/decision-center-execution-state-machine.util.spec.ts
```

---

## 7. 常见问题

**Q：200 但 `executionStatus` 是 `RECORDED`？**  
A：`execute: false` 或 repair deferred；不是成功 apply，不要 success toast。

**Q：`DATA_STALE` 出现在 validation 和 apply 前阻断有什么区别？**  
A：§4 `evidenceFreshnessBlock` 是 **apply 前**策略阻断；validation 里的 `DATA_STALE` 是 Ledger 重算后预测过期。UI 文案不同。

**Q：幂等 key 要不要 uuid 每次新建？**  
A：**不要。** 同一 problem+option 应用同一 key；否则无法防连点重复副作用。

**Q：私密愿望会不会出现在其他成员 UI？**  
A：Member digest 不会（MEM-BLOCKER-PDI-001）。Planner Agent 匿名块是另一路径，不在本 MVP 范围。

---

## 8. 文档索引

| 文档 | 用途 |
|------|------|
| `HARNESS_DECISION_CENTER_BASELINE.md` | 阶段判断 / Sprint 边界 / DoD |
| `DECISION_SEMANTICS_FRONTEND_API.md` | 全量 API + §4.1 Release Gate |
| `decision-center-execution-state-machine.util.ts` | 状态机 SSOT + 单测 |
| `DECISION_CENTER_V1.0.md` | 页面 L1–L4 产品结构 |
| `DECISION_SEMANTICS_KNOWN_GAPS.md` | 语义缺口、回归清单、明日 P0/P1 |

**持久化：** 决策与 problem resolution 当前写在 `Trip.metadata.decisionSemantics`；独立 `trip_decision_*` 表 **不进本 Sprint**（见 `DECISION_CENTER_V1.0.md` §P2 触发条件）。

前端 PR 合并前：完成 §5 checklist；后端相关 PR 需 `Harness Release Gate` CI 绿。
