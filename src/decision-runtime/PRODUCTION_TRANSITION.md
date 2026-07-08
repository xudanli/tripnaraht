# Decision Runtime v2 — Production Transition

> **Status:** Active（2026-07-02）  
> **Phase:** Production Transition（非继续建设六层骨架）  
> **Related:** [DECISION_RUNTIME_ROADMAP](./DECISION_RUNTIME_ROADMAP.md) · [CANONICAL_DEFAULT_PRODUCTION_FLIP](./p4-phase/CANONICAL_DEFAULT_PRODUCTION_FLIP.md) · [LEGACY_FALLBACK_RUNBOOK](./p4-phase/LEGACY_FALLBACK_RUNBOOK.md)

## 1. 阶段定位

TripNARA 已越过 **工程搭建期**，进入 **生产治理与默认链路切换期**。

| 维度 | 状态 |
|------|------|
| 架构合同 | 基本完成 |
| Gateway 骨架 | 基本完成 |
| Dev/Staging 验证 | 基本完成 |
| **Production 默认启用** | **大部分未完成** |
| **生产验收** | **大部分未勾选** |
| **Legacy 退役条件** | **尚未满足** |

**当前矛盾：** 不是「有没有能力」，而是 **「能否安全地让能力成为默认」**。

---

## 2. 依赖链（不可跳过）

```
30 天生产观察窗
        ↓
Canonical Default 生产 flip（10% → 48h → 100%）
        ↓
Constraint 核心场景 DEFAULT_ON
        ↓
持续稳定运行与生产验收
        ↓
LEGACY_DEPRECATED Ready（+ 90d lint）
```

跳过任一步，后续状态都会失真。

---

## 3. 第一优先级：30 天生产观察窗

观察窗 **不是** 单纯等待 30 天。必须持续采集六类指标（SSOT：`production-observation.catalog.ts`）。

### 3.1 Trigger Gateway 覆盖率

- 正式 Decision 请求总数 / 经 Gateway 数 / 旁路数
- **目标：** coverage ≥ 90%；新增旁路 = 0
- 按入口拆分：plan-selection、Guide import/accept、monitoring、user repair、`route_and_run`、Decision Center evaluate

### 3.2 Constraint 一致性

- Legacy boolean vs Canonical Report：一致率、Legacy PASS / Canonical BLOCK（高风险）、UNKNOWN 比例、Provider 缺失、超时

### 3.3 Authorization 完整率

- execute 总数 / 经 Gateway 数 / 未授权 execute
- **零容忍：** 未授权 Effective Plan 写入 = 0

### 3.4 Executor 安全

- duplicate execution、rollback 失败、Write Guard 阻断、Shadow 尝试写入
- **零容忍：** 非 Executor 写 Effective = 0；Shadow 写 Effective = 0

### 3.5 Monitoring 触发质量

- Detector 事件、去重前后、Decision Run 数、false/missed trigger、STALE、local repair vs full replan 比例

### 3.6 延迟与错误率

- P50/P95/P99、timeout、Gateway error、Provider error、fallback rate

### 3.7 观察窗通过判定

`30/30` 天 **≠** 自动通过。处置：

| 处置 | 含义 |
|------|------|
| `PASS` | 全部零容忍项满足 + 可容忍项在门槛内 |
| `PASS_WITH_CONDITIONS` | 有签字豁免的可容忍项 |
| `FAIL` | 任一零容忍项违反 |
| `INCOMPLETE` | 生产指标尚未采集 |

```bash
npm run production-observation:report
# 可选：拉取生产 runtime-capabilities
DECISION_RUNTIME_BASE_URL=https://prod.example.com npm run production-observation:report
```

---

## 4. 第二优先级：Canonical Default 生产 Flip

观察窗 `PASS` 后，按 [CANONICAL_DEFAULT_PRODUCTION_FLIP.md](./p4-phase/CANONICAL_DEFAULT_PRODUCTION_FLIP.md) 执行。

**明确：** CANONICAL_DEFAULT 切换的是 **运行时治理主链**，**不等于** Lex 成为 Optimization Authority。生产仍可：

```
Canonical Trigger → Snapshot → Constraint Gateway → Assembler → legacy-frozen → finalize → Auth → Executor
```

| 阶段 | 范围 |
|------|------|
| 10% | 内部用户、测试账号、低风险目的地、无支付、可回滚 |
| 48h | 错误率、timeout、Constraint 差异、Authorization ASK、rollback |
| 扩量 | 25% → 50% → 100%，每阶段独立签字 |

**回退：** `CANONICAL_DEFAULT → SELECTIVE / LEGACY`，不依赖重新部署代码。

---

## 5. 第三优先级：Constraint DEFAULT_ON

**不与** Canonical flip 完全同时。推荐顺序：

1. Canonical 主链先切换，Constraint 保持 SELECTIVE / ON_FOR_SELECTED  
2. 治理稳定后，核心场景 DEFAULT_ON  
3. 再扩展 catalog

**第一批 DEFAULT_ON：** ROAD_CLOSED、ACTIVITY_PROHIBITED、EXCESSIVE_DRIVE、明确营业时间/预约冲突  

**不第一批：** 模糊偏好、主观疲劳、低置信天气、不稳定数据源规则

---

## 6. 第四优先级：Legacy Deprecated

`LEGACY_DEPRECATED` 是 **结果**，不是开关。需满足 Runtime / Constraint / Authorization / Executor / Monitoring 五层条件 + **90 天** lint 与调用量持续下降。

退役顺序：禁止新增 → Warning → 默认不路由 → 仅 fallback → 删除写能力 → 删除代码。

---

## 7. Gateway Rollout 模型统一（目标）

Constraint 已有 `OFF → SHADOW → SELECTIVE → ON`。其他 Gateway 应从 boolean 迁移至：

```typescript
type GatewayRolloutMode = 'OFF' | 'SHADOW' | 'SELECTIVE' | 'ON';
```

适用于：Trigger、Authorization、Replanning Trigger Policy、Provider Registry 灰度。

详见 `production-transition/gateway-rollout-mode.types.ts`。

---

## 8. 观察窗 / Flip 期间冻结项

**冻结：** Objective 语义、Constraint 严重度、Lex 层级、Effective Plan 模型、Authorization 核心规则、Snapshot hash、Lineage 字段  

**允许：** 日志、指标、看板、非语义 Bug、运维脚本、UI 展示  

语义变更须 **重置** 相关观察窗口。

---

## 9. 实施节奏

| 周 | 重点 |
|----|------|
| Week 1 | 开启 Shadow 指标、六层 Dashboard、旁路盘点、回退开关验证 |
| Week 2–4 | 每日自动报告、每周人工审查、累积 30 天证据 |
| Week 5 | 10% Canonical flip + 48h |
| Week 6 | 25% → 50% → 100% |
| Week 7+ | Constraint DEFAULT_ON 分批 |
| +90d | Legacy 退役观察 |

---

## 10. 当前最不应该做的事

- Lex 直接切 Authority  
- 同时开启所有 Gateway  
- Constraint 全量 ON  
- 自动开启 Monitoring 重规划  
- 删除 Legacy 代码  
- 观察窗内调整 Objective  
- 为「六层全绿」勾选未验证项  
- 继续新增 Agent 编排路径  

---

## 11. 运维命令

**Layer 1 Trigger Gateway：** catalog **12/12 dispatch** 工程收口完成（`npm run trigger-wiring:status`）。

**配置模板：** 项目根目录 [`.env.production-transition.example`](../../.env.production-transition.example)  
**本地观察一键启动：** `npm run production-transition:dev-3000`

```bash
npm run trigger-wiring:status           # 12/12 dispatch 收口
npm run p4-observation:status              # 观察窗天数
npm run production-observation:report      # 六类指标报告
npm run trigger-bypass-priority            # 旁路入口接线优先级（bypass=0 时无动作）
npm run m7-trigger-center:preview          # M7 内部触发中心 UI
npm run p5-weekly-ops                      # 每周巡检（含观察报告）
npm run p4-production-flip:advisory        # flip 门槛（生产勿设 P4_FLIP_DEV_DRILL）
npm run p5-phase:closure                   # P5 退役就绪
```

**生产 selective 推荐 env：**

```bash
DECISION_TRIGGER_GATEWAY_ENABLED=1
DECISION_TRIGGER_LINEAGE_ENABLED=1
CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE
REPLANNING_TRIGGER_POLICY_ENABLED=1   # 观察期可 SHADOW 记录，不强制自动重规划
```
