# RoutingSignals 特征字典与路由决策拓扑

**SSOT 代码**：`orchestration-signals.util.ts` · `orchestration-policy.util.ts` · `routing/routing-*`

**Shadow Hook**：`ShadowRoutingEvaluatorService` · 开关 `ROUTING_SHADOW_EVAL=1`（默认开启，`0` 关闭）

---

## 1. 两层路由（勿混淆）

| 层 | 产出 | 消费者 |
|----|------|--------|
| **Task 路由** | `RoutingSignals.taskType` + System1/2 tier 投影 | Claude Orchestrator 内 `routingDecision.route` |
| **编排模式** | `routePolicy()` → `CLAUDE_SM \| CLAUDE_DYNAMIC \| LEGACY` | `runRouteAndRunMainChain` 执行 fork |

Shadow Hook 在 **`routePolicy` 之后** 对比 **RoutingClassifierTier**（System1/2 观测平面），并记录 `orchestrationMode`。

---

## 2. 特征字典（Feature Schema）

`buildRoutingSignalsFeatureVector()` 产出；离线评估见 `routing-classifier-eval.schema.json`。

| 特征键 | 类型 | 代码源 | 业务含义 |
|--------|------|--------|----------|
| `taskType` | enum | `signalsFromRequest()` / `intent.recognize` 覆盖 | 任务光谱：规划 / CRUD / 咨询 / 预订 |
| `complexityLevel` | `SIMPLE \| MODERATE \| COMPLEX` | `inferComplexity(msg, recentCount)` | 消息长度、多子句、对话轮次 |
| `complexityScore` | 0.25 / 0.55 / 0.85 | `complexityLevelToScore()` | ML 友好数值投影（**非**原始规则 float） |
| `risk` | `LOW…CRITICAL` | `inferRisk()` | 支付/PII/退款等硬规则 |
| `latencyBudgetMs` | int | `options.max_seconds`（默认 60s cap 5min） | 同步 deadline；逼近阈值 + 重规划 → `async_mode=AUTO` |
| `intentModeRequested` | `AUTO \| TRIP_PLANNING \| …` | `options.intent_mode` | 客户端显式档位 |
| `intentModeResolved` | bucket | `taskTypeToIntentBucket()` | 与 UI surface 对齐 |
| `requiresStructuredOutput` | bool | `inferRequiresStructuredOutput()` | 有 trip_id 或规划类 → 倾向 SM |
| `expectsToolCalls` | bool | `inferExpectsToolCalls()` | MCP / RAG / 实时数据 |
| `needsAudit` | bool | `inferNeedsAudit()` | 结构化多步 / 预订 |
| `legacyWellSupported` | bool | `inferLegacyWellSupported()` | 可否降级 LEGACY |
| `matchedRuleCount` | int | `decision.matchedRules.length` | routePolicy 命中规则数 |
| `orchestrationMode` | enum | `decision.mode` | 实际编排 fork |
| `modeLockActive` | bool | `ModeLock.get(stabilityContext)` | 同 hash 复用上轮成功 mode |
| `hasTripId` | bool | `request.trip_id` | 绑定行程上下文 |
| `entryPoint` | string? | `options.entry_point` | 只读页等入口约束 |

**注意**：L3 偏好不直接进入 `RoutingSignals`；经 Memory OS 注入下游 Gate/Plan，不在本层特征向量（v1）。

---

## 3. routePolicy 决策拓扑（确定性）

```
RoutingSignals + resolveOrchestrationMode(env, options)
        │
        ▼
┌───────────────────┐
│ ModeLock 命中？    │──YES──► 锁定 mode（rule_mode_lock_priority）
└─────────┬─────────┘
          │ NO
┌───────────────────┐
│ Circuit Breaker   │──OPEN──► SM→DYNAMIC→LEGACY 降级链
└─────────┬─────────┘
          │
┌───────────────────┐
│ rule_simple_legacy_fallback          │ 简单 + legacy 支持 + budget<3s → LEGACY
│ rule_explicit_claude_simple_dynamic  │ 显式 Claude + 简单 → DYNAMIC
│ rule_sm_for_complex_structured       │ 结构化 + tools + trip/booking → SM
│ rule_dynamic_for_simple              │ SM + 简单 + 无结构化 → DYNAMIC
└─────────┬─────────┘
          ▼
   decision.mode (frozen)
          │
          ├─ recommendations.requireConsent ← webbrowse 未授权 + 预订/规划
          └─ matchedRules[] → observability
```

**System1/2 tier 投影**（Shadow / 评估用）：`projectProductionRoutingTier(signals, decision)`

| 条件 | Tier |
|------|------|
| `requireConsent` | `SYSTEM2_CONSENT` |
| `taskType === RAG_QA` | `SYSTEM1_RAG` |
| CRUD / DATA_LOOKUP / GENERIC_QA 且无结构化 | `SYSTEM1_API` |
| TRIP_PLANNING / BOOKING_WORKFLOW / 结构化 | `SYSTEM2_REASONING` |

---

## 4. Shadow Hook 挂载点

`execution-gateway.route-and-run.orchestration.ts` — `routePolicy()` 之后、`traceInfo` 冻结前：

- 同步：`evaluateSync()` → `observability.trace.shadow_routing_eval_v1`

**产品路由类 Shadow**（`ShadowRouteClassEvaluatorService` · `ROUTE_CLASS_SHADOW_EVAL=1`）：

- 同步：`evaluateSync()` → `observability.trace.route_class_eval_v1`
- 协议 SSOT：`classifyRouteAndRunRouteClass` vs 生产 proxy `inferProductionRouteClassProxy`
- Drift 报告：`npx ts-node scripts/export-route-class-drift-report.ts`
- 异步：`scheduleAsyncEvaluation()` — 预留重模型旁路（当前 v0 同 sync 逻辑，fire-and-forget）

试验分类器：`predictExperimentalRoutingTier()` — v0 规则 challenger；替换为 ONNX/DSL 时保持接口不变。

---

## 5. 离线评估

- Schema：`routing-classifier-eval.schema.json`
- 类型：`routing-classifier-eval.types.ts`
- 语料构建：`scripts/build-routing-classifier-eval-corpus.ts` · `scripts/export-routing-classifier-eval-corpus.ts`
- 单测：`routing-signals-feature.util.spec.ts` · `shadow-routing-evaluator.service.spec.ts`

```bash
npx ts-node scripts/build-routing-classifier-eval-corpus.ts
npx ts-node scripts/export-routing-classifier-eval-corpus.ts
npm run ci:routing-classifier-eval
# → artifacts/routing-classifier-eval-export.json（含 shadow_confusion_v0 + labeled_vs_shadow_v1）
```

**P0-4 ground_truth overlay SSOT**：`src/agent/routing/routing-ground-truth-overlay.json`

| fixture id | 问题 | 标注 tier |
|------------|------|-----------|
| `iceland-trip-planning` | webbrowse consent 误投影 | `SYSTEM2_REASONING` |
| `itinerary-adjust` | 同上 | `SYSTEM2_REASONING` |
| `e2e-iceland-reykjavik-plan` | 同上 | `SYSTEM2_REASONING` |
| `e2e-itinerary-adjust-pace` | 同上 | `SYSTEM2_REASONING` |

人工标注覆盖 `ground_truth.targetRouting`；`current_rule_output` 保留生产规则输出（用于追踪 production vs labeled OVER_ROUTING）。

---

## 6. 与白皮书差异校正

| 白皮书表述 | 代码 SSOT |
|-----------|-----------|
| `complexity` float 0–1 | enum + `complexityScore` 投影 |
| `hasModeLock` 客户端开关 | 服务端 `ModeLock`（同 requestHash 自动复用） |
| `userL3Preference` 路由特征 | 不在 v1 特征向量；走 Memory Injector |
| Shadow 在 ExecutionGateway 入口 | 在 **routePolicy 后**（signals 已 resolve） |
