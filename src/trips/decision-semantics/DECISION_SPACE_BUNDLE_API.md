# 决策空间 Bundle API

**Schema:** `tripnara.decision_space_bundle@v1`  
**目标：** 将决策空间首屏 5–7 次 HTTP 合并为 1 次读 + 按需写（preview）  
**实现：** Phase 1 — 并行双读（独立接口保留，bundle 失败可回退）

---

## 端点

### 主 Bundle

```
GET /api/trips/:tripId/decision-space-bundle
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `problemId` | 二选一 | 决策问题 ID |
| `proposalId` | 二选一 | 编排草案 ID |
| `conflictId` / `focusConflictId` | 否 | 聚焦冲突 |
| `optionId` | 否 | 当前选中方案 |
| `surface` | 否 | `default` \| `middle` \| `inspector` \| `full` |
| `include` | 否 | 逗号字段掩码，**覆盖** surface |
| `exclude` | 否 | 从 surface 中排除 |
| `If-None-Match` | 否 | ETag 304 |

**surface 预设**

| surface | 模块 |
|---------|------|
| `default` | problem, basis, pack.summary, inspector.feasibility, orchestration（因果链 lazy） |
| `middle` | problem, basis, pack.full, orchestration |
| `inspector` | inspector 四 Tab 全量 |
| `full` | 全部（Debug） |

**include 可选值：** `problem`, `basis`, `pack`, `pack.summary`, `inspector.causalChain`, `inspector.planDiff`, `inspector.feasibility`, `inspector.memberConsensus`, `inspector.basis`, `negotiation`, `orchestration`

### 增量补全

```
GET /api/trips/:tripId/decision-space-bundle/delta
```

| 参数 | 必填 |
|------|------|
| `problemId` | 是 |
| `include` | 是 |
| `optionId` | 推荐 |
| `since` / `If-None-Match` | 否 |

---

## Response 结构

```json
{
  "success": true,
  "data": {
    "schema": "tripnara.decision_space_bundle@v1",
    "tripId": "...",
    "tripVersion": "tv_42",
    "etag": "W/\"dsb:tv_42:problem_abc:action_a:-:default\"",
    "binding": { "problemId", "proposalId", "conflictId", "optionId", "mode" },
    "problem": { /* Gateway detail 1:1 */ },
    "basis": { /* planning_decision_basis@v1 */ },
    "pack": { /* pack.summary 或 full */ },
    "inspector": { /* 按 include 裁剪字段 */ },
    "negotiation": { /* 可选 */ },
    "orchestration": { "activeProposalId", "pendingProposalCount", "phase" },
    "meta": {
      "included": [],
      "deferred": [],
      "tabEmptyState": {},
      "deferredReason": { "previewRequired": true },
      "refreshHints": { "problem", "preview", "inspector", "causalChain" }
    }
  }
}
```

**错误码**

| HTTP | code | 说明 |
|------|------|------|
| 400 | `BUNDLE_BINDING_REQUIRED` | 缺少 problemId / proposalId |
| 404 | `PROBLEM_NOT_FOUND` | problem 不存在 |
| 304 | — | ETag 命中 |

**缓存：** `Cache-Control: private, max-age=10`；ETag = `hash(tripVersion, problemId, proposalId, optionId, surfaceKey)`

---

## 模块来源（复用现有 schema）

| Bundle 字段 | 来源 |
|-------------|------|
| `problem` | `GET decision-problems/:id` |
| `basis` | `GET arrange-itinerary/decision-basis` |
| `pack` | `proposal.decisionPack` |
| `inspector.*` | `GET decision-inspector`；因果链 Tab 懒加载 `GET decision-causal-chain?problemId=` |
| `orchestration` | `orchestration-state` + pending proposal 计数 |

**Bundle 首包（`surface=default` + `problemId`）保证：**

- `meta.tabEmptyState.causalChain === true`（因果链 deferred，Tab 打开时拉 `decision-causal-chain?problemId=`）
- `inspector.feasibility.canSafelyWrite === false`（无草案写路径）

---

## 前端接入（Phase 1）

```typescript
import { fetchDecisionSpaceBundle } from './dto/frontend-arrange-itinerary-api-client';

const bundle = await fetchDecisionSpaceBundle(token, tripId, {
  problemId,
  proposalId,
  surface: 'default',
});
// bundle 成功 → 跳过 basis / inspector / proposal 独立 GET
// 失败 → 回退现有多接口
```

Tab 增量：

```
GET .../decision-space-bundle?problemId=x&optionId=y&include=inspector.planDiff,inspector.feasibility
```

---

## 实现文件

| 文件 | 职责 |
|------|------|
| `decision-space-bundle.controller.ts` | HTTP + ETag 304 |
| `services/decision-space-bundle.service.ts` | 聚合 Gateway + Arrange BFF |
| `utils/decision-space-bundle.surface.util.ts` | surface / include 解析 |
| `types/decision-space-bundle.types.ts` | envelope 类型 |

**冒烟：** `npx ts-node scripts/decision-space-bundle-test.ts [tripId]`

---

## 开放问题

1. **写路径 authority：** `problem.actions` 为准，`pack.options` 仅展示（当前实现）
2. **planDiff + preview：** 无 proposal 时 planDiff 为空，`meta.deferredReason.previewRequired=true`；选中 option 且 preview 完成后见 [DECISION_INSPECTOR_PLAN_DIFF.md](./DECISION_INSPECTOR_PLAN_DIFF.md)
3. **归属：** Arrange-itinerary BFF 聚合；Gateway 提供 problem 子模块
