# Slice 4 — Internal Dual-Read BFF 对接说明

**状态：** Internal Dual-Read Deployment **PASS** · Smoke Test **PASS**（2026-07-12 devbox）  
**阶段：** `INTERNAL_DUAL_READ`（**不是** Primary SSO，**不是** Visible Queue Cutover）  
**Feature flags：** `ATTENTION_INTERNAL_DUAL_READ_ENABLED=1` · `ATTENTION_ROOT_CAUSE_ORCHESTRATION=1` · `ATTENTION_ROOT_CAUSE_PRIMARY_SSO=0`

**Ops：** [`../operations/SLICE-4-INTERNAL-DUAL-READ-GO-2026-07-12.md`](../operations/SLICE-4-INTERNAL-DUAL-READ-GO-2026-07-12.md)  
**Smoke 证据：** [`../operations/evidence/slice4-internal-dual-read-smoke-closure-2026-07-12.json`](../operations/evidence/slice4-internal-dual-read-smoke-closure-2026-07-12.json)

---

## 0. 现实约束（必读）

**当前两个 Canary Trip 的 `attentionPrimaryItems` 均为空数组 `[]`。**

| Trip | 当前 Smoke 快照 | 含义 |
|------|-----------------|------|
| Exec Slip `c0c77777-7777-4777-8777-777777777777` | `current=3`, `attention=0`, `canonical=1` | 接口/权限/只读不变量已验证；**尚未形成可见 Primary Item** |
| Weather `a0a99999-9999-4999-8999-999999999999` | `current=2`, `attention=0`, `canonical=1` | 同上；队列中暂无 `WEATHER_*` 可见项 |

因此：

1. **BFF 与 Internal Comparison UI 可以先接通** — 空 Primary、非空 Current 是合法状态。
2. **暂时无法在产品页证明「多卡收敛成一张 Primary 卡」** — 需先 seed 强风因果链（见 §8）。
3. **前端禁止自行聚类** — 只展示后端投影；不得用 `semanticKey` 本地 merge。

**推荐实施顺序：**

```
BFF Handoff（本文档）
  → Internal Comparison UI
  → Seed 强风因果链 fixture（STG-REPLAY-10 / slice4-10）
  → 24–48h Observation
  → 决定是否进入 Internal Primary Projection
```

---

## 1. 接口

### 1.1 请求

```
GET /api/trips/:tripId/internal/attention-dual-read
Authorization: Bearer <JWT>
```

| 参数 | 说明 |
|------|------|
| `tripId` | 须在 Dual-Read allowlist（见 §2） |
| JWT | 须能解析出 `userId`；建议携带 `email` 或 `roles` |

**Base URL（devbox）：** `http://<devbox-ip>:3002/api`（Nest :3002，勿用 :3000）

### 1.2 成功响应

HTTP 通常为 **200**，信封为 StandardResponse：

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.attention_internal_dual_read@v1",
    "phase": "INTERNAL_DUAL_READ",
    "tripId": "c0c77777-7777-4777-8777-777777777777",
    "generatedAt": "2026-07-12T12:00:00.000Z",
    "primarySsoEnabled": false,
    "notificationsEnabled": false,
    "currentQueueItems": [],
    "attentionPrimaryItems": [],
    "comparison": {
      "currentVisibleCount": 0,
      "attentionVisibleCount": 0,
      "reductionCount": 0,
      "hiddenProblemIds": [],
      "primaryProblemIds": [],
      "missedProblemIds": [],
      "openClusterCount": 0,
      "canonicalProblemCount": 0
    },
    "shadowVerdict": "INCONCLUSIVE",
    "shadowVerdictReason": "..."
  }
}
```

### 1.3 错误响应

HTTP 常为 **200**，须检查 `success === false` 与 `error.code`：

| `error.code` | 典型 `error.message` | 场景 |
|--------------|----------------------|------|
| `UNAUTHORIZED` | `Authentication required` | 未登录 / 无 Bearer |
| `FORBIDDEN` | `需要为行程成员` | 非 trip collaborator |
| `FORBIDDEN` | `user_not_eligible_for_attention_internal_dual_read` | 非内部账号 |
| `FORBIDDEN` | `trip_not_on_attention_internal_dual_read_allowlist` | 非 Canary Trip |
| `FORBIDDEN` | `ATTENTION_INTERNAL_DUAL_READ_DISABLED` | 环境未开 Dual-Read |
| `FORBIDDEN` | `ATTENTION_ROOT_CAUSE_ORCHESTRATION disabled` | Shadow runtime 未开 |
| `FORBIDDEN` | `ATTENTION_ROOT_CAUSE_PRIMARY_SSO must remain OFF...` | 误开 Primary SSO |

### 1.4 TypeScript 契约（前端可直接引用）

契约源文件：`src/trips/guardian-decision-core/contracts/attention-orchestration.types.ts`

```typescript
interface AttentionDualReadResponse {
  schemaId: 'tripnara.attention_internal_dual_read@v1';
  phase: 'INTERNAL_DUAL_READ';
  tripId: string;
  generatedAt: string;
  primarySsoEnabled: false;
  notificationsEnabled: false;

  currentQueueItems: CurrentQueueItem[];
  attentionPrimaryItems: UnifiedDecisionItemProjection[];

  comparison: {
    currentVisibleCount: number;
    attentionVisibleCount: number;
    reductionCount: number;
    hiddenProblemIds: string[];
    primaryProblemIds: string[];
    missedProblemIds: string[];
    openClusterCount: number;
    canonicalProblemCount: number;
  };

  shadowVerdict?: AttentionShadowVerdict;
  shadowVerdictReason?: string;
}

interface CurrentQueueItem {
  problemId: string;
  semanticKey: string;
  title: string;
  workflowStatus: string;
  enforcement?: 'BLOCK' | 'REQUIRE_ADJUSTMENT' | 'REQUIRE_CONFIRMATION' | string;
}

interface UnifiedDecisionItemProjection {
  clusterId: string;
  tripId: string;
  primaryProblemId: string;
  primarySemanticCapability: string;
  headline: string;
  explanation: string;
  causalStory: CausalNode[];
  attentionLevel: AttentionLevel;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  relatedEffects: Array<{
    problemId: string;
    semanticCapability: string;
    label: string;
  }>;
  confirmationEntry: {
    problemId: string;
    actionRoute: 'decision-queue';
  };
  firstObservedAt: string;
  lastUpdatedAt: string;
}

type AttentionLevel =
  | 'SILENT' | 'LOG_ONLY' | 'SUMMARY' | 'QUEUE' | 'INTERRUPT' | 'SAFETY_STOP';

interface CausalNode {
  code: string;
  label: string;
  problemId?: string;
  order: number;
}
```

---

## 2. 使用限制

| 限制 | 说明 |
|------|------|
| 仅内部账号 | `@tripnara.dev` 邮箱域，或 `ADMIN` / `OPERATOR` role，或 env 配置的 `ATTENTION_INTERNAL_DUAL_READ_USER_IDS` |
| 必须是行程成员 | JWT 用户须为 trip collaborator |
| 仅 Canary Trip | 默认 allowlist 见下表 |
| 只读 | 不写入 Queue、PlanVersion、Ledger、通知 |
| 不替换 decision-queue | 用户确认仍走 `GET/POST .../decision-queue` |
| 不能作为 C 端接口 | 无内部权限则拒绝；勿暴露给 Native 正式行中页 |
| `attentionPrimaryItems=[]` 合法 | **不代表接口失败** |

**默认 Canary Trip allowlist：**

| tripId | 用途 | 测试账号 |
|--------|------|----------|
| `c0c77777-7777-4777-8777-777777777777` | Execution Slip Canary | `exec-slip-canary@tripnara.dev` |
| `a0a99999-9999-4999-8999-999999999999` | Weather Canary | Weather canary 用户 |

---

## 3. 响应字段语义

### 3.1 `currentQueueItems`

**Current Unified Queue** 的只读投影 — 与正式 `GET /trips/:tripId/decision-queue` 可见集合对齐（legacy admission 规则），**不是** Attention SSOT。

| 字段 | UI 映射 |
|------|---------|
| `title` | 卡片标题 |
| `problemId` | 审计 ID（可复制） |
| `semanticKey` | **type** — 语义能力（如 `EXECUTION_SCHEDULE_INFEASIBLE`） |
| `enforcement` | **severity** — 见 §6.2 |
| `workflowStatus` | **status** — 如 `OPEN` / `WAITING_DECISION` |

**source：** 固定展示 `Current Unified Queue`（本接口不返回独立 source 字段）。

### 3.2 `attentionPrimaryItems`

Attention Runtime 投影出的 **Unified Primary Item** 列表。每条对应一个 OPEN cluster 的可见 Primary。

| 字段 | UI 映射 |
|------|---------|
| `headline` / `explanation` | Primary 卡片主文案 |
| `primaryProblemId` | Primary Problem ID |
| `primarySemanticCapability` | Primary 类型 |
| `relatedEffects[]` | **Related Problems**（含 `label`） |
| `causalStory[]` | **Causal Chain**（按 `order` 排序） |
| `attentionLevel` | **Attention Level** |
| `confirmationEntry.problemId` | 用户确认入口 — 跳转 `decision-queue/{problemId}` |

**Root Cause：** 取 `causalStory` 首节点（通常为 `WEATHER_STRONG_WIND`）的 `label`；若无 chain，展示 `primarySemanticCapability`。

**Primary 选择原因（UI 文案，非 API 字段）：**

后端按「决策驱动优先级」选 Primary，不是「最早创建」：

| `primarySemanticCapability` | 建议展示文案 |
|----------------------------|--------------|
| `EXECUTION_SCHEDULE_INFEASIBLE` | 决策驱动能力：后续行程不可行，需用户确认调整方案 |
| `ACTIVITY_WINDOW_MISSED` | 决策驱动能力：活动窗口已错过 |
| `ROAD_SEGMENT_UNAVAILABLE` / `ROAD_CLOSED` | 决策驱动能力：道路不可用（首版 wind chain 场景通常不出现） |
| `WEATHER_STRONG_WIND` | 根因型：强风为链首，暂无更高优先级决策项 |

规则源：`primary-problem-selector.util.ts` — **前端只读展示，不重算。**

### 3.3 `comparison` — 重点解释

| 字段 | 语义 | UI 注意 |
|------|------|---------|
| `currentVisibleCount` | Current Queue 可见卡片数 | 须等于 `currentQueueItems.length` |
| `attentionVisibleCount` | Attention Primary 可见卡片数 | 须等于 `attentionPrimaryItems.length` |
| `reductionCount` | `current − attention`（≥0） | **只是数量差，不能单独证明聚类正确** |
| `hiddenProblemIds` | 在 Current 中可见、被收入 Cluster、**不再作为独立 Primary 展示** 的 problemId | **不是删除**；底层 Canonical Problem 仍保留 |
| `primaryProblemIds` | 各 Primary Item 的 `primaryProblemId` | 用户确认入口应对准这些 ID |
| `missedProblemIds` | Current 中有，但未进入任何可见 Primary 投影 | **内部审计红灯** — 可能漏卡或 ingest 缺口 |
| `openClusterCount` | OPEN 状态 cluster 数 | 顶部 **Clusters** |
| `canonicalProblemCount` | 进入 Attention ingest 的 RFC001 canonical 数 | 顶部 **Canonical Problems** |

### 3.4 `shadowVerdict` / `shadowVerdictReason`

Shadow 启发式分类（`CORRECT_MERGE` / `FALSE_MERGE` / `INCONCLUSIVE` 等）。  
Internal UI 可在审计区展示，**不作为 C 端文案**。当前 Canary 常为 `INCONCLUSIVE`（缺完整 wind chain seed）。

---

## 4. 页面状态机

| 状态 | 条件 | 页面表现 |
|------|------|----------|
| 正常对比 | `currentQueueItems.length > 0` 且 `attentionPrimaryItems.length > 0` | 左右并排；顶部展示 reduction |
| Primary 空 | `current > 0` 且 `attention === 0` | 右侧：**「当前未形成 Attention Primary」** + 提示 seed 观察样本（§8） |
| 两侧都空 | `current === 0` 且 `attention === 0` | **「当前无开放决策问题」** |
| Missed 告警 | `comparison.missedProblemIds.length > 0` | 顶部 **红色内部审计条**：「存在未投影 Canonical Problem，请工程排查」 |
| 无权限 | `error.code === 'FORBIDDEN'`（非成员 / 非内部） | **「无内部 Dual-Read 访问权限」** |
| 未开放 | `trip_not_on_attention_internal_dual_read_allowlist` | **「该行程未开放 Dual-Read」** |
| 未登录 | `error.code === 'UNAUTHORIZED'` | 跳转登录 |

**Polling 建议：** 30–60s 刷新；Dual-Read 只读，可安全轮询。  
**勿**与 decision-queue 轮询合并写操作。

---

## 5. Internal Comparison UI — 最小布局

### 5.1 页面定位

- **内部审计页** — Engineering / Ops / Product 观察 Slice 4 收敛行为
- **不是** Native 行中决策页
- 路由建议：`/internal/trips/:tripId/attention-dual-read`（前端路由自定）

### 5.2 顶部指标条

| 标签 | 数据源 |
|------|--------|
| Current Queue | `comparison.currentVisibleCount` |
| Attention Primary | `comparison.attentionVisibleCount` |
| Reduction | `comparison.reductionCount` |
| Clusters | `comparison.openClusterCount` |
| Canonical Problems | `comparison.canonicalProblemCount` |
| Missed | `comparison.missedProblemIds.length` — **>0 时红色** |

示例：`Current Queue：3 · Attention Primary：1 · Reduction：2 · Clusters：1 · Canonical Problems：4 · Missed：0`

### 5.3 左侧 — Current Queue

每张卡：

| 元素 | 字段 |
|------|------|
| 标题 | `title` |
| problemId | `problemId`（ monospace，可复制） |
| type | `semanticKey` |
| severity | `enforcement` → §6.2 |
| source | 固定文案 `Current Unified Queue` |
| status | `workflowStatus` |

可选：链接到 `GET /api/trips/:tripId/decision-queue/:problemId` 查看 hydrate 详情（**仍走正式 Queue，非 Dual-Read 写**）。

### 5.4 右侧 — Attention Primary

每张 Primary 卡：

| 元素 | 字段 |
|------|------|
| Primary Problem | `primaryProblemId` + `headline` |
| Root Cause | `causalStory[0].label` 或 fallback |
| Related Problems | `relatedEffects[]` → `{ label, problemId, semanticCapability }` |
| Causal Chain | `causalStory[]` 时间线 |
| Attention Level | `attentionLevel` |
| 为何是 Primary | §3.2 文案表（由 `primarySemanticCapability` 映射） |

`attentionPrimaryItems.length === 0` 时展示占位（§4），**不要**隐藏右侧栏。

### 5.5 底部 — 审计信息

| 区块 | 内容 |
|------|------|
| Hidden | `comparison.hiddenProblemIds[]` — 文案：**「已收入 Cluster、未独立展示（未删除）」** |
| Primary | `comparison.primaryProblemIds[]` |
| Missed | `comparison.missedProblemIds[]` — 非空时红色 |
| Shadow | `shadowVerdict` + `shadowVerdictReason` |
| Raw JSON | `<details>` 展开完整 `data` |

---

## 6. 展示映射参考

### 6.1 `workflowStatus`

| 值 | 中文 |
|----|------|
| `OPEN` / `WAITING_DECISION` / `WAITING_HUMAN` | 待决策 |
| `ASSESSING` / `EVALUATING` | 评估中 |
| `RESOLVED` / `DISMISSED` | 已解决 |

### 6.2 `enforcement` → severity 标签

| enforcement | 标签 |
|-------------|------|
| `BLOCK` | 紧急 |
| `REQUIRE_ADJUSTMENT` | 需调整 |
| `REQUIRE_CONFIRMATION` | 需确认 |
| 其他 / 空 | — |

### 6.3 `attentionLevel`

| 值 | 标签 |
|----|------|
| `SAFETY_STOP` | 安全停止 |
| `INTERRUPT` | 强打断 |
| `QUEUE` | 队列可见 |
| `SUMMARY` | 摘要 |
| `LOG_ONLY` / `SILENT` | 静默 |

---

## 7. BFF 集成示例

```typescript
const BASE = process.env.TRIPNARA_API_BASE ?? 'http://127.0.0.1:3002/api';

export async function fetchAttentionDualRead(tripId: string, token: string) {
  const res = await fetch(`${BASE}/trips/${tripId}/internal/attention-dual-read`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!body.success) {
    throw new DualReadError(body.error?.code ?? 'UNKNOWN', body.error?.message ?? 'Dual-read failed');
  }
  return body.data as AttentionDualReadResponse;
}
```

**与正式 Queue 并存：**

```typescript
// 用户确认 — 仍用正式接口，不要用 Dual-Read
POST /api/trips/:tripId/decision-queue/:problemId/accept-recommended
// problemId 取自 attentionPrimaryItems[0].confirmationEntry.problemId
```

---

## 8. 观察前必须补：强风因果链 Seed

当前 Smoke 仅证明 **接口 + 权限 + 只读**。要验证 **多卡 → 单 Primary**，须在 Canary 注入已有 fixture：

```
WEATHER_STRONG_WIND
  → EXECUTION_DEPARTURE_SLIP
  → EXECUTION_SCHEDULE_INFEASIBLE
  → NIGHT_DRIVING_RISK
```

### 8.1 推荐 Profile

| Profile | Scenario | 链 |
|---------|----------|-----|
| `slice4-10` | `STG-REPLAY-10` | wind → slip → infeasible → night（完整链） |
| `slice4-c` | `STG-REPLAY-C` | wind → infeasible → night（无 slip 节点） |

Fixture 源：`scripts/staging-canary-attention-seed-problems.util.ts`（**不修改聚类规则**）。

### 8.2 Exec Slip Canary 上 seed（devbox / prod canary）

**前提：** Trip 已存在（`EXEC_SLIP_DRILL_ALLOW_PROD=1` 时允许 prod DB）。

```bash
# 1. 注入 slice4-10 fixture（prod canary — 需 EXEC_SLIP_DRILL_ALLOW_PROD=1）
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-attention-seed-stg-replay-10.ts

# 仅复验（不重复写 DB）
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-attention-seed-stg-replay-10.ts --verify-only
```

> **注意：** `staging-canary-attention-shadow-replay.ts` 拒绝 `tripnara_prod` DATABASE_URL；devbox prod canary 请用 `prod-canary-attention-seed-stg-replay-10.ts`。

### 8.3 Seed 后预期（`slice4-10`）— devbox PASS 2026-07-12

| 指标 | 预期 | 实测 |
|------|------|------|
| `attentionPrimaryItems.length` | **1** | **1** |
| `primarySemanticCapability` | `EXECUTION_SCHEDULE_INFEASIBLE` | **PASS** |
| `comparison.hiddenProblemIds` | 含 wind / slip / night | `stg_attn_wind,stg_attn_slip,stg_attn_night` |
| `comparison.missedProblemIds`（seed） | **[]** | **[]** |
| `comparison.reductionCount` | ≥ 1 | **6**（current=7 → attention=1） |
| `shadowVerdict` | `CORRECT_MERGE` | **PASS** |

**Legacy missed（预期内）：** `currentQueueItems` 仍含 plan-object / anchor 类 legacy 项（3 条），计入 `missedProblemIds` 但**不属于 seed 链漏卡**。Internal UI 应区分 `missed(seed)` vs `missed(legacy)`。

证据：[`../operations/evidence/slice4-stg-replay-10-primary-convergence-2026-07-11T19-56-01-446Z.json`](../operations/evidence/slice4-stg-replay-10-primary-convergence-2026-07-11T19-56-01-446Z.json)

### 8.4 UI 接通后检查清单

- [ ] Primary 空状态文案正常
- [ ] Seed 后右侧出现 1 张 Primary 卡
- [ ] `hiddenProblemIds` 在底部审计区展示且标注「未删除」
- [ ] `missedProblemIds > 0` 时红色告警
- [ ] 确认入口链到 `decision-queue/{confirmationEntry.problemId}`

---

## 9. 24–48h Observation 关闭标准

| 指标 | 目标 |
|------|------|
| Wrong Primary | **0** |
| False Merge | **0** |
| Missed Problem | **0**（`missedProblemIds` 持续为空） |
| Duplicate Primary | **0** |
| Resolved Item Removal | **PASS** — resolved 后从 `attentionPrimaryItems` 退出 |
| Dual-Read Mutation | **0** — 轮询前后 canonical / plan / ledger 不变 |
| Notifications | **0** |
| Rollback Failure | **0** |

**须保留逐样本 JSON 或截图：**

- Weather only（`slice4-a` / STG-REPLAY-A）
- Weather + Execution（`slice4-b` / STG-REPLAY-B）
- 完整链（`slice4-10`）
- Weather resolved（`slice4-f`）
- Execution resolved
- 无相关问题（empty queue）

证据目录建议：`internal-docs/operations/evidence/slice4-observation/`

---

## 10. 明确不做

| 禁止 | 原因 |
|------|------|
| `ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1` | Internal Primary Projection 尚未开始 |
| 替换 Visible Queue | Dual-Read 阶段只读 |
| 发 Attention 通知 | Smoke 已验证 `notificationsEnabled=false` |
| 前端本地聚类 | 违反 Slice 4 契约 |
| 扩新聚类规则 | Observation 期间冻结 |
| Road Promotion | `ASSERTION_PROMOTION_ROAD_ENABLED=0` |

---

## 11. 相关文档

| 文档 | 用途 |
|------|------|
| [`SLICE-4-INTERNAL-DUAL-READ-GO-2026-07-12.md`](../operations/SLICE-4-INTERNAL-DUAL-READ-GO-2026-07-12.md) | 部署 / 回滚 / Smoke |
| [`SLICE-4-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md`](../operations/SLICE-4-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md) | Slice 4 验收与 cutover 序列 |
| [`EXECUTION_SLIP_FRONTEND_HANDOFF.md`](../../src/trips/guardian-decision-core/EXECUTION_SLIP_FRONTEND_HANDOFF.md) | 正式 decision-queue 确认链路 |
| `scripts/slice4-internal-dual-read-smoke.ts` | 可重复 Smoke |

---

## 12. 签收

| 角色 | 事项 | 签名 |
|------|------|------|
| Frontend / Internal Tools | BFF 接入 + Comparison UI 按 §5 实现 | |
| Engineering | Seed `STG-REPLAY-10` 后 Dual-Read 预期达标 | |
| Ops | 24–48h Observation 证据归档 | |

**下一里程碑：** Observation PASS → **Internal Primary Projection**（仍 **不开** Primary SSO 直至 Allowlist Canary 阶段）
