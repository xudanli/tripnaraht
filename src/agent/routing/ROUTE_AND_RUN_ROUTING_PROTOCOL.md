# route_and_run 路由协议（Routing Protocol SSOT）

> **代码 SSOT**：`route-and-run-route-class.util.ts` · `route-and-run-routing-protocol.types.ts`  
> **Golden Eval**：`route-and-run-golden-eval-fixtures.ts`（28+ 条）· `route-and-run-route-class.util.spec.ts`  
> **导出**：`npx ts-node scripts/export-route-and-run-golden-eval.ts`  
> **能力边界**：见 [AGENT_UNIFIED_INTERFACE_SCOPE.md](../delivery/AGENT_UNIFIED_INTERFACE_SCOPE.md)

---

## 0. 为什么要有这层协议

`route_and_run` 是**唯一产品入口**。自然语言进来后，必须先落到**可测试的路由类**，再决定：

- 跑多深的编排（NONE → FULL_CHAIN）
- 要不要 `trip_id` / 澄清
- 能不能直接写行程
- 成功时读哪些 payload 字段
- 门控失败时什么 `result.status`
- 是否触发 **Deep Research V7.1**（Exa `deep_researcher_*`）

**两层路由勿混**（见 [ROUTING_SIGNALS_FEATURE_DICTIONARY.md](./ROUTING_SIGNALS_FEATURE_DICTIONARY.md)）：

| 层 | 枚举 | 用途 |
|----|------|------|
| **产品路由类** | `RouteAndRunRouteClass` | 用户意图 · Golden Eval · 前端 UX |
| **System 1/2 投影** | `RoutingClassifierTier` | Shadow eval · 观测 |

---

## 1. 决策树（自然语言 → 路由类）

```
message + trip_id? + options
        │
        ▼
┌───────────────────────┐
│ 1. 高风险 / 支付 / 退款 │──► SAFETY_CONSENT_OR_BLOCK
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ 2. CRUD profile + trip │──► CRUD_EDIT
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ 3. 槽位放置（哪/day）   │──► SLOT_PLACEMENT_CLARIFY
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ 4. 条件分支 if/Plan B   │──► CONDITIONAL_BRANCH
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ 5. 局部重排（非整单）   │──► PARTIAL_REPLAN
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ 6. 咨询快答 profile    │──► QUICK_ANSWER
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ 7. 显式规划 / 整单重排  │──► FULL_DEEP_PLAN
└───────────┬───────────┘
            ▼
        QUICK_ANSWER（默认）
```

**异步续跑**不属于 NL 分类：Worker Lease 在 `task/status.task_lease_v1` 层处理（见 [FRONTEND_ASYNC_TASK_LEASE.md](../delivery/FRONTEND_ASYNC_TASK_LEASE.md)）。

---

## 2. 意图路由表

| 路由类 | 触发条件（摘要） | trip_id | 先澄清？ | 可直接改行程？ | 成功输出 | 门控/失败默认 | Deep Research V7.1 |
|--------|------------------|---------|----------|----------------|----------|---------------|-------------------|
| **QUICK_ANSWER** | DATA_LOOKUP profile · 事实/餐饮/酒店/单日可行性 · 看某日 | 可选 | 否 | 否 | `answer_text` · 可选 `accommodations[]` | `OK` | **OFF** |
| **CRUD_EDIT** | delete/update/add profile + trip | **必需** | 否 | **是** | `payload.timeline` patch | `OK` | **OFF** |
| **SLOT_PLACEMENT_CLARIFY** | 「哪一天/加在哪」+ trip | **必需** | **是** | 否 | `NEED_MORE_INFO` + `answer_html` | 澄清终端 | **OFF** |
| **PARTIAL_REPLAN** | 改节奏/挪 POI/SKU(F路/旺季) · 非整单重排 | **必需** | 否 | 是（门控可挡） | `ui_display` + timeline | `OK` / `NEED_CONFIRMATION` | **ELIGIBLE** |
| **FULL_DEEP_PLAN** | 「规划 N 天」· 整单重排 · 无 trip 新规划 | 可选/无 | 缺日期时可要 | 否（写新草案） | 完整 `ui_display` | `OK` / 澄清 / 瑕疵 opt-in | **ELIGIBLE/REQUIRED** |
| **CONDITIONAL_BRANCH** | 「如果…就…」· Plan B | 建议有 | 否 | 否 | `dual_track_itinerary` | `OK` | **OFF** |
| **SAFETY_CONSENT_OR_BLOCK** | 支付/护照/退款投诉 | 无关 | 否 | 否 | `NEED_CONSENT` | 硬阻断 | **OFF** |

### 2.1 失败 / 门控不过时怎么回

| 场景 | `result.status` | 客户端动作 |
|------|-----------------|------------|
| 缺参 / 选日 | `NEED_MORE_INFO` | 渲染澄清卡 |
| Abu REJECT / 三人格 | `NEED_CONFIRMATION` | 协商 UI → `confirm_negotiation` |
| 支付/敏感 | `NEED_CONSENT` | consent 流 |
| Readiness BLOCK | 通常 `NEED_MORE_INFO` 或 FAILED | 不可静默写行程 |
| REPAIR 预算耗尽 | 默认澄清（`repair_halt_confirmation`） | 见下「瑕疵 opt-in」 |
| 硬失败 | `FAILED` / `TIMEOUT` | explain 面板 |

### 2.2 瑕疵行程 opt-in

| 条件 | 行为 |
|------|------|
| 默认 | REPAIR/效用超预算 → **澄清终端**，无 SUCCESS 草案 |
| `options.allow_flawed_draft_narrate=true` | SUCCESS + `flawed_draft_v1` Banner |
| `gate ADJUST_REQUIRED` + 未消解 VERIFY | SUCCESS 可能带 Banner（见 [FRONTEND_FLAWED_DRAFT_DELIVERY.md](../delivery/FRONTEND_FLAWED_DRAFT_DELIVERY.md)） |

---

## 3. 三人格硬门控规则

| 人格 | 必须阻断（不可静默写） | 必须用户确认 | 可自动继续 + Banner | 备注 |
|------|------------------------|--------------|---------------------|------|
| **Abu** | Readiness **BLOCK** · 硬违规 · 高风险日坚持原方案 | Abu REJECT → `NEED_USER_CONFIRM` | `ADJUST_REQUIRED` + 未消解 VERIFY | BLOCK 不升格辩论 |
| **Dr.Dre** | 极端疲劳/不可行日界 | 大幅改节奏 trade-off | 日程偏紧 warning | 走 REPAIR/Neptune |
| **Neptune** | — | 大幅改线 trade-off | 替补路段建议 | VERIFY 后 REPLACE |

**代码 SSOT**：[ORCHESTRATION_GOVERNANCE_MATRIX.md](../orchestration/ORCHESTRATION_GOVERNANCE_MATRIX.md) · `orchestration-governance-matrix.constants.ts`

---

## 4. Deep Research V7.1 触发条件

**原则**：V7.1 **不是**每次请求主流程。仅 `deepResearchV71 !== 'OFF'` 时编排可挂载 Exa deep researcher。

| 级别 | 何时 | 示例 |
|------|------|------|
| **OFF** | 快答 · CRUD · 条件分支 · consent | 「第3天能徒步吗」「删掉蓝湖」 |
| **ELIGIBLE** | F路/旺季/冰岛深度/政策关键词 | 「2WD 走 F208」「七月错开高峰」「整单重排冰岛」 |
| **REQUIRED** | 首次复杂多国 + 政策/供应商研究 | 「14天环欧+签证政策变化+库存」（协议目标态） |

普通 **QUICK_ANSWER / CRUD** 若误开 V7.1 → 延迟与成本失控；Golden Eval 对 `deepResearchV71` 有断言。

---

## 5. Golden Eval（28 条，可扩到 30+）

| ID | 断言要点 |
|----|----------|
| `golden-full-tokyo-5d-family` | 深规划 |
| `golden-quick-day3-hike-feasibility` | 快答 |
| `golden-crud-delete-blue-lagoon` | CRUD |
| `golden-slot-waterfall-which-day` | 先澄清 |
| `golden-conditional-sunset-yokohama` | 条件分支 / 双轨 |
| `golden-safety-payment-consent` | consent |
| `golden-gate-abu-need-confirm-note` | 局部重排 + 门控确认 |
| `golden-full-replan-bound-trip` | 整单重排 → 深规划 |

```bash
npm run ci:route-and-run-routing          # Jest + Golden 28/28 + fork-aware drift 28/28
npx ts-node scripts/export-route-and-run-golden-eval.ts
npx ts-node scripts/export-route-class-drift-report.ts
```

**CI**：`.github/workflows/route-and-run-routing-gate.yml` · Readiness P1 套件 `ci:route-and-run-routing`（`READINESS_P1_SKIP_ROUTE_ROUTING_GATE=1` 可本地跳过）。

```bash

---

## 6. Production Fork：`route_class_fork_v1`（Orchestrator 真分支）

**代码 SSOT**：`route-and-run-route-class-fork.util.ts`

挂载点：

1. **入口** — `ExecutionGateway.runRouteAndRun` / `AgentService.routeAndRun` → `applyRouteAndRunEntryRoutingInPlace()`  
2. **主链** — `resolveRoutingSignals` 之前已写入 `request.options`；`routePolicy()` 之后 → `applyRouteClassForkPolicyOverrides()` 强制 SM / DYNAMIC 与协议深度一致

环境变量：`ROUTE_CLASS_FORK=1`（**默认开**）；`0` 关时回退 legacy `signalsFromRequest` + bound-trip DATA_LOOKUP override。

| 路由类 | fork 动作（摘要） |
|--------|-------------------|
| QUICK_ANSWER / SAFETY | `intent_mode=DATA_LOOKUP` · `use_state_machine_orchestration=false` |
| CRUD_EDIT | `use_state_machine_orchestration=true`（INTAKE CRUD 短路） |
| PARTIAL / FULL / SLOT / CONDITIONAL | `intent_mode=TRIP_PLANNING` · `use_state_machine_orchestration=true` · 可选 `route_class_deep_research_v71` |

**Observability**：

- `observability.trace.route_class_fork_v1`
- `observability.route_class_fork_v1`（Response 镜像，与 trace 同源；`attachObservability` 双向补齐）

Fork 开启时 `inferProductionRouteClassProxy` 读取 `__routeClassDecision`，shadow drift 应恒为 `NONE`（验证 fork 生效）。

---

## 7. Shadow Hook：`route_class_eval_v1`（协议 vs 生产 drift）

挂载点：`routePolicy()` 之后，与 `shadow_routing_eval_v1` 并列。

| 字段 | 含义 |
|------|------|
| `protocolRouteClass` | `classifyRouteAndRunRouteClass`（Golden SSOT） |
| `productionRouteClass` | `inferProductionRouteClassProxy`（当前 signals 路径近似） |
| `mismatchType` | `NONE` · `OVER_DEPTH` · `UNDER_DEPTH` · `CLASS_MISMATCH` |
| `protocolDepth` / `productionDepth` | 路由深度 1–5 |

环境变量：`ROUTE_CLASS_SHADOW_EVAL=1`（默认开，`0` 关）。

**Observability 路径**：

- `observability.trace.route_class_eval_v1`
- `observability.route_class_eval_v1`（Response 镜像，与 trace 同源）

Drift 批量报告：`artifacts/route-class-drift-report.json`（`scripts/export-route-class-drift-report.ts`）。

**当前 Golden 集**：28/28 protocol ↔ production proxy 对齐（2026-06-13）。

**解读**：

- `OVER_DEPTH`：生产比协议更重（例：应快答却进 System2）→ 优先修 routing / intent  
- `UNDER_DEPTH`：生产比协议更轻（例：应深规划却快答）→ 漏交付  
- `CLASS_MISMATCH`：同深度不同类（例：CRUD vs PARTIAL）

---

## 8. 与 System 1/2 Shadow 的关系

- **产品路由类**决定 UX 与 payload 轮廓。  
- **Shadow Hook**（`ROUTING_SHADOW_EVAL`）在 `routePolicy` 后对比 System tier，**不改变**产品路由。  
- 后续 ML 头应替换 `predictExperimentalRoutingTier`，**不应**绕过 `classifyRouteAndRunRouteClass` Golden 集。

---

## 9. 规划成功产物 Schema

见 [ROUTE_AND_RUN_SUCCESS_ARTIFACTS_SCHEMA.md](./ROUTE_AND_RUN_SUCCESS_ARTIFACTS_SCHEMA.md)（能看 / 能改 / 能订 / 能分享）。

---

*维护：改决策树 = 改 util + 更新 golden fixtures + 跑 spec + 导出 JSON。*
