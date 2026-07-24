# Decision Semantics — 已知语义缺口与下一步

> **状态（2026-06-30）：** 后端 Release Gate ✅；前端 MVP ✅；**语义可信** tradeoff + affectedScopeDisplay ✅；**staging API QA** ✅（§6.1）；剩余 FE fixtures + §6.2 手工三项。

---

## 一、已关闭的语义缺口（2026-06-30）

### 1. Tradeoff：避免明显错误 ≠ 方案级预测

**状态：batch 1–3 ✅** — payload / preview / `getOptions` 预览增强已覆盖主要修法；无 delta 时仍仅 direction + explanation。

| 方案 | 效果来源 |
|------|----------|
| +30 / +60 / shift | `payload.shiftMinutes` / `bufferMinutes` |
| 删除 POI | `payload.savedMinutes` |
| 更换住宿 / 拆分行程 | `payload.expectedDriveReductionMinutes` |
| 提前出发 | `payload.advanceMinutes`（`shift_earlier`） |
| 无 payload | `getOptions` 尝试 `previewRepair`；preview 端点同路径 |

**代码锚点：** `tradeoff.normalizer.ts`、`repair-preview-tradeoff.util.ts`、`resolve-option-tradeoffs.util.ts`

---

### 2. AffectedScope：缺前端可直接消费的展示层

**状态：P1 ✅** — `GET decision-problems/:id` 返回 `affectedScopeDisplay[]`（投影层，本体 `affectedScope` 不变）。

```typescript
interface AffectedScopeDisplay {
  scopeType: 'DAY' | 'ITEM' | 'LEG' | ...;
  scopeId: string;
  label: string;           // e.g. 第 4 天 · 阿克雷里 → 米湖
  secondaryLabel?: string; // e.g. 462km 自驾路段
  dayIndex?: number;
  placeNames?: string[];
  memberNames?: string[];
}
```

**代码锚点：** `read/affected-scope-display.util.ts`；`DecisionSemanticsService.getProblem()`

**Tradeoff 优先级规则：**

1. repair `payload` 中已有明确 delta → 直接使用  
2. preview 能模拟 before/after → 使用模拟差值（`getOptions` 对无数值方案自动尝试）  
3. 无法计算 → **不填数值**，只输出 `direction` + `explanation`  
4. **禁止**用问题总缺口冒充方案效果  

---

## 二、语义可信回归测试清单

| # | 场景 | 断言 | 测试位置 |
|---|------|------|----------|
| 1 | 幂等 POST ×2 | 单条有效 record；`idempotentReplay`；`effectiveDecisionId`；不重复 apply；`shouldRefreshItinerary=false`；非绿 success | `DS-BLOCKER-IDEMPOTENCY-001`、`DC-FE-015`、harness replay |
| 2 | 时间缺口门禁 | 90min→可有+30/+60；121min→无分钟缓冲；7.5h→可保留有限调整；8.1h→无分钟修法；32h→仅结构性修法；无「增加 597 分钟缓冲」 | `travel-timing-repair.util.spec.ts`、`feasibility-assembler.util.spec.ts`、`semantic-trust-regression.spec.ts` |
| 3 | 用户距离约束 | 默认 250 / 用户 380 / 路段 462 → 判断与文案用 380，不含 250 | `segment-distance-threshold.util.spec.ts`、`feasibility-assembler.util.spec.ts` |
| 4 | 缓存失效 | `constraintsVersion` N→N+1 后 cache key 不同、文案用新阈值 | `planning-conflicts-cache-key.util.spec.ts` |
| 5 | Overview 重放态 | `PARTIALLY_APPLIED` / `ROLLED_BACK` / `IDEMPOTENT_REPLAY` / `needsRepair` 不误判为新成功 | `decision-center-execution-state-machine.util.spec.ts`、`decision-center-overview.spec.ts` |

---

## 三、推荐工作顺序

### P0 — 前端 fixtures（剩余）

至少增加：

- `idempotent-replay`
- `large-shortfall-structural-options`
- `custom-segment-distance-constraint`
- `partially-applied-needs-repair`

### P0 — Staging 手工 QA

API 自动化：`npm run decision-center:staging-qa`（见 `DECISION_CENTER_FE_MVP_INTEGRATION.md` §6.1，2026-06-30 本地绿）。

剩余 **§6.2 前端手工**：证据过期、半成功、轮询（需 staging fixture 或真实场景）。

### P1 — 完整 Gate

```bash
npm run contracts:decision-semantics
npm test -- --testPathPatterns=decision-semantics
npm run harness:blockers
npm run harness:replay
```

确认：修法过滤不误删小缺口有效方案；cache key 变更不导致 planning-conflicts 漂移；contract re-export 完整。

---

## 四、2026-06-30 工作评价

今日修改**未扩大** Decision Center 功能面积，而是修复三个最易伤害用户信任的问题：

1. **重复请求不能伪装成第二次成功**（幂等 + 执行态契约）  
2. **荒谬量级修法不能进入方案对比**（时间缺口门禁）  
3. **用户约束不能被默认值覆盖或错误表述**（`c_max_segment_distance` 文案 + 缓存失效）  

保证：用户看到的状态是真的，方案是有意义的，约束解释与设置一致。

这是 Decision Center 从「接口可用」走向「**语义可信**」的关键一步。

---

## 五、文档索引

| 文档 | 用途 |
|------|------|
| `HARNESS_DECISION_CENTER_BASELINE.md` | Release Gate / Sprint 边界 |
| `DECISION_CENTER_FE_MVP_INTEGRATION.md` | 前端联调与手工 QA |
| `TRIP_CONSTRAINTS_API.md` §`c_max_segment_distance` | 单段距离文案契约 |
| `../trip-constraint-solver/ROAD_CLASS_SEGMENT_DISTANCE_BFF.md` | road_class 文案 + 缓存 + 前端约定 |
