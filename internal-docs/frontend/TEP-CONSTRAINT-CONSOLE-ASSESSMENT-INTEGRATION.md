# P1-A — Constraint Console Assessment 化（前端对接）

**状态：** Phase 0 后端已验收 · **2026-07-13**  
**前置：** P0-1 Assessment Merge（`GET /constraint-assessments`）  
**受众：** Plan Studio / Web 约束控制台  
**关联：** [TRAVEL_DECISION_CONTRACT_FRONTEND_API.md](../../src/trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md) · [CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md](../product/CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md) · [TEP-SELF-DRIVE-FRONTEND-HANDOFF.md](./TEP-SELF-DRIVE-FRONTEND-HANDOFF.md)

---

## 0. 目标

从 **合同视角** 升级为 **合同 + 验证视角**：

| 之前 | 之后 |
|------|------|
| `GET /constraints` 单源 | `GET /constraints` + `GET /constraint-assessments` |
| 卡片色由 `type === HARD` 推断 | 卡片色由 `aggregateStatus` 驱动 |
| 只展示「要求 ≤6h」 | 展示「要求 ≤6h」+ 规划/执行双 lane 验证 |

**用户可见闭环：**

```
用户约束 → 系统验证 → 执行判断 → 风险解释
```

---

## 1. 读模型职责（冻结）

| 页面 / 场景 | API | 职责 |
|-------------|-----|------|
| Constraint Console | `GET /constraint-assessments` | 每条约束在不同验证阶段的状态 |
| Executability Page | `GET /executability` | Can I execute?（GO / NO-GO） |
| Debug / Support | `GET /constraint-trace` | 为什么产生这个 assessment? |

**禁止** 把 assessment 塞进 `/constraints` 或 `/constraint-trace`。

---

## 2. 复制到 Plan Studio 的文件

| 文件 | 用途 |
|------|------|
| `dto/frontend-travel-decision-contract-api.types.ts` | 合同 + Console 类型（含 `capability`） |
| `dto/frontend-constraint-assessment-api.types.ts` | Assessment bundle + `ConstraintCardView` |
| `dto/frontend-travel-decision-contract-api-client.ts` | `fetchConstraintAssessments` 等 |
| `dto/frontend-constraint-card-view.util.ts` | 合并 contract + assessment |
| `dto/frontend-travel-decision-contract-view.util.ts` | section 投影 |
| `dto/frontend-constraint-assessments.hooks.example.ts` | React Query 模板 |

路径（本仓库）：`src/trips/trip-constraint-solver/dto/`

---

## 3. API

### 3.1 新增

```
GET /api/trips/:tripId/constraint-assessments
GET /api/trips/:tripId/constraint-assessments?refresh=true
```

响应：`UnifiedConstraintAssessmentBundle`（`success` 壳）

Phase 0 覆盖 `constraintKey`：

- `MAX_DAILY_DRIVE` ↔ SDR-101
- `NO_NIGHT_DRIVE` ↔ SDR-202
- `OFFICIAL_IS_FROAD_2WD` ↔ SDR-001
- `NO_UNPAVED_ROAD` ↔ SDR-003
- `FIXED_APPOINTMENTS` ↔ SDR-203

### 3.2 保留

```
GET /api/trips/:tripId/constraints          # 合同 + 卡片元数据
GET /api/trips/:tripId/executability        # 提交门控（不拆）
```

---

## 4. Hooks（推荐）

### 4.1 `useConstraintAssessments(tripId)`

与现有 `useTripConstraints`（或 `fetchConstraintConsole`）**并行**加载。

```typescript
const { data: assessments } = useConstraintAssessments(tripId);
const { data: console } = useTripConstraints(tripId);
// join in render via buildConstraintConsoleWithAssessments
```

### 4.2 `useConstraintConsoleWithAssessments(tripId)`（Console 页推荐）

一次请求合并为 `ConstraintCardView[]`：

```typescript
const { data } = useConstraintConsoleWithAssessments(tripId, { refresh });
// data.sections[].cards → 直接渲染
```

### 4.3 失效时机

约束 PATCH、`POST feasibility-report/validate`、行程 PUT 后 invalidate：

- `constraint-assessments`
- `constraint-console-with-assessments`
- `constraints`
- `executability`

---

## 5. 数据模型

### 5.1 旧（禁止）

```typescript
interface ConstraintCardProps {
  constraint: TripConstraint;
  status: string; // 来自 type / status
}
```

### 5.2 新（必须）

```typescript
interface ConstraintCardView {
  constraintId: string;
  name: string;
  contractRequirement?: string;   // 合同要求
  assessment: UnifiedConstraintAssessmentView | null;
  aggregateUi: { label; tone; isBlocking; ... };
  laneBadges: ConstraintAssessmentLaneBadge[];  // 规划 / 执行
  repairDeepLink?: string;
}
```

Join 规则（`buildAssessmentLookup`）：

1. `assessment.legacyConstraintId === constraint.id`
2. `constraint.capability.constraintKey`
3. `source.templateId` / legacy id 映射表

---

## 6. UI 规则

### 6.1 卡片状态色 — `aggregateStatus`（不是 `type`）

| aggregateStatus | 用户文案 | UI tone |
|-----------------|----------|---------|
| `PASS` | 满足 | success |
| `WARN` | 需要关注 | warning |
| `PLANNING_BLOCK` | 规划不可行 | danger |
| `EXECUTION_BLOCK` | 不可执行 | danger |
| `RUNTIME_BLOCK` | 当前受阻 | danger |
| `UNKNOWN` | 待验证 | neutral |

`contractCardTone`（冲突/草稿）仅作辅助左边线，**不能**替代验证色。

### 6.2 Executability Badge（双 lane 行）

每条有 assessment 的卡片展示：

```
每日驾驶限制
≤ 6小时
──────────────
规划: ✓ 已满足
执行: ✕ 不可执行 · SDR-101 · Day1 6h56m
```

Lane 文案映射见 `buildLaneBadges()`：

| lane.status | 文案 |
|-------------|------|
| `PASS` | 已满足 |
| `BLOCK` | 不可执行 |
| `WARNING` | 需关注 |
| `REQUIRES_VERIFICATION` | 待确认 |
| `UNKNOWN` | 待验证 |

### 6.3 BLOCK → Repair

`card.repairDeepLink` 指向已有 repair flow（带 `problemId` query）。  
Phase 0 **不**引入 UnifiedDecisionProblem。

---

## 7. 卡片示例（PILOT-IS-01）

### Case A — 120min 驾驶

```json
{
  "constraintKey": "MAX_DAILY_DRIVE",
  "lanes": {
    "planning": null,
    "executability": null
  },
  "aggregateStatus": "PASS"
}
```

### Case B — 330min / SDR-101

```json
{
  "constraintKey": "MAX_DAILY_DRIVE",
  "lanes": {
    "executability": {
      "status": "BLOCK",
      "source": "TEP",
      "ruleId": "SDR-101",
      "evidence": { "day": 1, "actual": "6h56m" }
    }
  },
  "aggregateStatus": "EXECUTION_BLOCK"
}
```

本地验证：

```bash
npm run tep:pilot-seed -- --template=01 --reset
npm run constraint-assessments:pilot-smoke
```

---

## 8. 页面验收清单（PILOT-IS-01）

- [ ] Console 卡片展示「合同要求」+「验证状态」两块
- [ ] `MAX_DAILY_DRIVE` Case A：`aggregateStatus === PASS`，双 lane 无 BLOCK
- [ ] Case B（330min）：executability `BLOCK` + SDR-101 + evidence
- [ ] 卡片色随 `aggregateStatus`，不随 `type === HARD`
- [ ] BLOCK 卡片可跳转 repair（复用现有 problem flow）
- [ ] Executability Page 仍用 `GET /executability`（不混读模型）

---

## 9. 延后（明确不做）

| 项 | 原因 |
|----|------|
| `ConstraintAssessmentTraceService` + TEP | 审计链，非产品链 |
| UnifiedDecisionProblem | Phase 1；`problemIds` 已够 P0 |
| Runtime lane UI | Phase 0 恒 `null` |
| CI 先挂 smoke | Console 对接完成后再纳入 `tep:pilot-ci` |

---

## 10. 完成后下一步

1. PILOT-IS-01 页面人工验收
2. `constraint-assessments:pilot-smoke` → `tep:pilot-ci`（Case A/B 断言，非仅 HTTP 200）
3. P1 DecisionProblem 合并（单独立项）
