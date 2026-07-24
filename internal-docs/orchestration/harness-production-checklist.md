# Agent Harness 生产落地 Checklist（State / Control / Observability）

> **Companion** to [harness-1x-roadmap.md](./harness-1x-roadmap.md) · [harness-architecture-map.md](./harness-architecture-map.md)  
> **背景**：Agent Harness 三支柱（状态、控制、可观测）对照本仓库现状与缺口；支持 demo → 试点 → 生产的渐进式建设。  
> **图例**：✅ 已有 · 🟡 部分 · ❌ 缺口

---

## 1. 总览矩阵

| 能力域 | 成熟度 | 一句话 |
|--------|--------|--------|
| **State** | 🟡 | DSO + Memory OS + agentic checkpoint/rollback 有；Redis 多 Pod 待运维验收 |
| **Control** | 🟡 | GATE/VERIFY/REPAIR + policy DSL + subagent 链 sandbox 有；`HARNESS_KERNEL_HARD` 待运维签字启用 |
| **Observability** | 🟡 | trace + badcase + cost 看板 + 质量环 batch/采样；前端面板待补 |
| **Cost（横切）** | ✅ | token budget + cost_est + Grafana + llm_routing 报表 |

---

## 2. State（状态 / Memory）

**原则**：不要把 chat history 当 workflow state；分短期 / 情景 / 长期三层；支持 recall 与 rollback。

### 2.1 短期记忆（Session / Request）

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| 单次请求 Working Memory | ✅ | `src/agent/interfaces/agent-state.interface.ts` | 部分路径仍散落临时 state |
| PA 多轮对话持久化 | ✅ | `internal-docs/agent/pa-context-memory-p0.md` · Redis `pa_conversation:*` | `DISABLE_REDIS=true` 时多 Pod 失忆 |
| 滑动窗口桥接 Decision OS | ✅ | 最近 10 条 → `conversation_context.recent_messages` | Gateway 入口 SSOT + `ContextSlidingWindowAdapter` |
| DSO 为编排真源 | ✅ | `DecisionState` + Kernel phase | — |
| Prompt 即 workflow state 反模式 | 🟡 | `OrchestratorContextLintService` · `ORCHESTRATOR_CONTEXT_LINT_ENABLED` | 未全路径强制；Agentic loop 仍可能靠 prompt 堆上下文 |

### 2.2 情景记忆（Episodic / 决策链 / Rollback）

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| 决策账本（为何选/弃方案） | ✅ | `decisionLedger` · `explain.optimization.decision_verdict` | 前端 L1/L2 依赖各产品仓 |
| Harness 失败事件摘要 | ✅ | `last_harness_failure_events` · `HARNESS_TRACE_MODE=on-failure` | 默认 `off`，生产需主动开 |
| ReAct decision_log | ✅ | `AgentState.react.decision_log` | 与 DSO 账本未完全统一视图 |
| Governance 分支账本 | ✅ | `src/governance/` · `governance-ledger` | 偏规划域，非通用 agent 工具链 |
| 行程版本 rollback | ✅ | `ItineraryRollbackService` · revision timeline | **域内** rollback，非任意 agent step 回滚 |
| VERIFY → RESEARCH 回环 | ✅ | `verify-return-to-research-retry.runner.ts` | 上限 1（`DECISION_MAX_VERIFY_RESEARCH_RETRIES`） |
| Agent 任务级 rollback | ✅ | `agentic-task-rollback.util.ts` · `agentic_rollback_to_step_v1` | 客户端须回传 checkpoint catalog |
| AI 参与情景 memory 压缩 | 🟡 | `EpisodicMemorySummarizerService` · `HARNESS_EPISODIC_SUMMARIZER=1` | LLM 路径：`HARNESS_EPISODIC_SUMMARIZER_LLM=1`（失败回落 deterministic） |

### 2.3 长期记忆（Persona / Profile / Trip）

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| 统一 Memory Contract | ✅ | `AgentMemoryContext` · `MemoryWritePipelineService` | 写入经 pipeline；覆盖度需按模块审计 |
| 用户画像 L0–L3 | ✅ | `userProfile` · `activeTripState` | — |
| Persona 多 agent 管理 | 🟡 | `persona-state-manager.service.ts` | 缺 persona 重要性自动 pruning |
| Memory 快照 replay 锚点 | ✅ | `snapshotId` · `agent:mem_snapshot:v1:*` | 运维需熟悉 Redis key |
| Chat 与决策状态分离 | ✅ | PA doc §2 分工表 | 防新模块打破 |

### 2.5 State 优先补项

| 优先级 | 任务 | 验收 | 状态 |
|--------|------|------|------|
| **P0** | 生产 Redis 必开 + PA 多 Pod 验收 | `internal-docs/agent/pa-context-memory-p0.md` §4 清单全绿 | 📋 运维 |
| **P1** | 统一 `conversation_context` 窗口 SSOT | 见 `context-sliding-window-adapter-p1.md` | ✅ Gateway 入口 + util + adapter |
| **P2** | Agentic loop 执行图 checkpoint | 支持「回滚到 step N」产品与 API | ✅ util + trace.checkpoints + resume option |
| **P3** | 情景 memory 异步 summarizer | 长 session token 可观测下降 | ✅ env + async persist + ingress compaction + observability |

---

## 3. Control（控制 / 边界 / 认证）

**原则**：人认证是根；每次 tool call / 决策需 policy；agent 间不能互相「学」到越权能力。

### 3.1 人 → Agent 边界

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| 用户认证 | ✅ | `AuthModule` | — |
| PA 会话 userId 防串 | ✅ | `PaConversationContextService` | — |
| Identity Governance | ✅ | `src/identity-governance/` | 偏发布/资质，非 agent runtime policy |
| HITL / 需确认挂起 | ✅ | PlanExecute SUSPENDED · `NEED_USER_CONFIRM` | Agentic fast path 另有一套 |
| 防客户端伪造 trace | ✅ | `src/trips/decision/ADR-005-Decision-Trace-Observability.md` | 新 DTO 需持续审查 |

### 3.2 Agent → Tool 边界

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| Tool governance deny/ask/auto | ✅ | `agentic-tool-governance.util.ts` · `McpAgentExecutorService` | 默认仅少量 ask；需运营扩展 policy |
| Pre-approved tool invocations | ✅ | `governanceApprovedToolInvocations` | 产品「批准后继续」待打通 |
| Runtime MCP allowlist | 🟡 | `runtimeMcpToolAllowlist` | 非默认全开；缺 per-tenant UI |
| Core Gateway action budget | ✅ | `core-gateway.service.ts` | 未覆盖全部 MCP 路径 |
| Destructive side-effect 审计 | 🟡 | `AuditRecordService` | 无统一「留痕不可删」MCP 策略 |
| 统一 Policy Gateway | ✅ | `execution-policy-gateway-manifest.util.ts` · `policy_manifest_v1` | external API enforce 默认 observe；开 `HARNESS_EXECUTION_POLICY_EXTERNAL_API=1` |

### 3.3 Agent → Agent / 编排边界

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| GATE / VERIFY / REPAIR 矩阵 | ✅ | `ORCHESTRATION_GOVERNANCE_MATRIX.md` | — |
| Harness 硬门禁 + 失败路由 | ✅ | `HarnessFailureRouterService` · `HARNESS_KERNEL_HARD=1` | 代码已接；见 [harness-kernel-hard-runbook.md](./harness-kernel-hard-runbook.md) 签字启用 |
| Context Lint（DSO 白名单） | ✅ | `OrchestratorContextLintService` | STRICT 默认未开 |
| Subagent 权限隔离 | ✅ | `subagent-message-chain-sandbox.util.ts` · conversation + skill handoff | 非 Claude 编排路径待审计 |
| RL 约束 preDecision | 🟡 | `RLIntegrationService` | 默认关；非主路径 |

### 3.4 Cost 控制（横切）

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| Agentic loop token 上限 | ✅ | `AGENTIC_LOOP_MAX_TOTAL_TOKENS` | per-user/global/session 配额见 `AGENTIC_*_TOKEN_*` |
| Deadline 剩余时间门禁 | ✅ | `AGENTIC_LOOP_MIN_REMAINING_MS` | — |
| 响应 `cost_est_usd` | ✅ | `route-and-run-cost-est.util.ts` · `LlmUsageRecorder` 累加 · `cost_governance_v1` | Grafana：`monitoring/grafana/harness-cost-token-dashboard.json` |
| Context token budget | ✅ | `context-engineer.service.ts` | 警告有，无 hard block |
| 多模型 cost-aware 路由 | ✅ | `llm_routing_v1` · `HarnessLlmRoutingDiagnosticsService` | per-request + 7d admin provider share |
| Session/org spend cap | ✅ | `AGENTIC_SESSION_TOKEN_CAP` · `AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG` · `cost_governance_v1` | 需客户端传 `options.organization_id`；Grafana + admin alerts |

### 3.5 Control 优先补项

| 优先级 | 任务 | 验收 | 状态 |
|--------|------|------|------|
| **P0** | Destructive MCP tools 默认 `deny`/`ask` + audit id | `agentic-tool-governance.util.ts` · `[AgenticGovernance] audit=gov_*` 日志 | ✅ |
| **P1** | 生产开 `FEATURE_AGENTIC_GOVERNANCE_HITL` + 扩展 `tool_policies` | 关键 tool 无 silent auto | ✅ `.env.harness-production.example` |
| **P1** | per-user / global daily token quota | `AGENTIC_DAILY_TOKEN_QUOTA_*` + `AgenticTokenQuotaService` | ✅ |
| **P2** | 统一 Execution Policy Gateway | 编排 + Agentic + MCP 同一 policy 链 | ✅ 主链 tick hydrate + observability |
| **P3** | Subagent 权限沙箱 | tool 能力不可经 message 传递 | ✅ env + message strip + MCP cap + observability |

---

## 4. Observability（可观测）

**原则**：Agent 是黑盒；需要 trace + 决策链 + 排障归档。

### 4.1 Harness / Trace

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| Harness step 契约 + runner | ✅ | `src/harness/` · `HarnessStepRunnerService` | — |
| Trace 三态 off/full/on-failure | ✅ | `harness-trace-mode.util.ts` | 生产默认 off |
| 失败逆向合成 trace | ✅ | `retrofitTrajectoryOnFailure` | 仅 failure 路径完整 step 轨迹 |
| Trace 落盘 | ✅ | `HARNESS_TRACE_EXPORT_DIR` | 需 volume / 采集 pipeline |
| L1 smoke 指纹门禁 | ✅ | `npm run harness:l1-smoke` | CI 级；非运行时监控 |
| Shadow Harness（phase 后） | ✅ | `HARNESS_SHADOW_AFTER_PHASE=1` · `shadow_harness` admin/CLI | `tripnara harness shadow-harness status` |
| Shadow Grader 异步语义分 | ✅ | `HarnessShadowGraderService` · `HARNESS_SHADOW_GRADER=1` · `DECISION_TRAJECTORY_ENABLED=1` | admin/CLI 注册 active shadow · `trajectory_capture_off` observability |

### 4.2 决策 / 业务可观测

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| 决策闭环 explain 投影 | ✅ | `explain.optimization.*` | 前端见 `docs/frontend-decision-closure-integration.md` |
| Decision log metadata | ✅ | ADR-005 · decision-log-traceability contract | — |
| Route-and-run observability slice | ✅ | `runtime-observability-slice.types.ts` | 需 env 开 materialization |
| Recovery / replan observability | ✅ | route-and-run recovery contract spec | — |
| Governance runtime graph | ✅ | `governance-runtime-graph` | 偏内部 debug |

### 4.3 运维 / 产品面

CLI：`tripnara harness trace *` · `tripnara harness badcase *` · `tripnara harness quality *` · `tripnara harness shadow-harness status` · `tripnara harness llm-routing status` · `tripnara harness kernel-hard status` · `tripnara harness shadow-grader *` · `tripnara harness cost *`

| 项 | 状态 | 锚点 | 缺口 |
|----|------|------|------|
| OpenTelemetry | ✅ | `harness-otel-correlation.util.ts` · `observability.otel_trace_id` | 全路径 auto-instrument 仍依赖部署侧 |
| 前端决策面板 | 🟡 | `docs/frontend-decision-closure-integration.md` | 本仓无前端 |
| Cost / token 看板 | ✅ | `cost_history_v1` · Grafana `harness-cost-token-dashboard.json` | 需 LLM DB + Postgres 数据源 |
| Badcase 自动归档 | ✅ | `tripnara harness badcase *` · `scripts/collect-harness-badcases.sh` | 无 Web UI；cron 见 badcase runbook |
| 在线质量环 | ✅ | L1 + decision-closure batch · `HARNESS_QUALITY_SAMPLE_RATE` · admin/CLI | cron 见 quality-loop runbook |

### 4.4 Observability 优先补项

| 优先级 | 任务 | 验收 | 状态 |
|--------|------|------|------|
| **P0** | staging/prod 配 on-failure trace + export dir | 失败请求可落盘 JSON | ✅ 见 [harness-trace-deploy-runbook.md](./harness-trace-deploy-runbook.md) |
| **P1** | CLI/前端链到 `observability.harness_trace_export_path` | `tripnara harness trace *` | ✅ |
| **P1** | 前端 L1：路政 Banner + 判决书卡片 | `frontend-decision-closure-integration.md` L1 | ✅ 后端 mock + `decision-closure-l1.util` |
| **P2** | Harness traceId ↔ OTel traceId | 跨系统排障 | ✅ `observability.otel_trace_id` + trace JSON `meta.otelTraceId` |
| **P3** | Shadow Grader 梯队 3 | 见 `harness-1x-roadmap.md` | ✅ env + observability + async schedule + tests |

---

## 5. 分阶段「够用 Harness」清单

可直接作 sprint checkbox。

### 5.1 Demo（周末 QC 级）

- [x] `answer_text` 能跑通（L0）— 主链已有；各产品入口自行验收
- [x] 设 `AGENTIC_LOOP_MAX_TOTAL_TOKENS` — `.env.harness-production.example`
- [x] Destructive tool 本地 policy 默认 deny — `agentic-tool-governance.util.ts`

### 5.2 试点（有真实用户）

- [ ] Redis session + PA 多 Pod 验收（§2.4 P0）— 📋 运维
- [x] `HARNESS_TRACE_MODE=on-failure` + `HARNESS_TRACE_EXPORT_DIR` — 见 trace runbook
- [x] `FEATURE_AGENTIC_GOVERNANCE_HITL` + 关键 MCP ask — `.env.harness-production.example`
- [ ] 前端 L1：`explain.optimization` 判决书 + 路政 Banner — 本仓 doc only
- [x] `npm run harness:l1-smoke` — 脚本就绪；CI 勾选由平台侧

### 5.3 生产（企业级）

- [ ] Context Lint STRICT（`ORCHESTRATOR_CONTEXT_LINT_STRICT=1`）— 见 [harness-context-lint-runbook.md](./harness-context-lint-runbook.md)
- [x] per-org token / cost quota + 告警（`AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG` · `cost_history_v1`）
- [x] 统一 policy gateway（MCP + LLM + external API 同源 DSL；external enforce 可选）
- [x] Shadow Grader ops（`HARNESS_SHADOW_GRADER=1` + `DECISION_TRAJECTORY_ENABLED=1` + admin/CLI register）
- [ ] `HARNESS_KERNEL_HARD=1` 签字上线 — 见 [harness-kernel-hard-runbook.md](./harness-kernel-hard-runbook.md) · `tripnara harness kernel-hard status`
- [x] OTel + Harness trace 关联（`observability.otel_trace_id` · on-failure export）
- [x] badcase 检索（CLI catalog + cron）— 见 [harness-badcase-runbook.md](./harness-badcase-runbook.md)

---

## 6. CLI 速查（Observability P1）

```bash
# 列出 API 落盘 trace
tripnara harness trace list --dir artifacts/harness-on-failure

# 打开 observability 路径
tripnara harness trace open artifacts/harness-on-failure/abc.json --print

# 从保存的 route_and_run 响应提取
tripnara harness trace from-response /tmp/response.json --show

# run-route-and-run debug 模式会提示 open 命令
tripnara run-route-and-run ... --debug --format table

# Cost 历史曲线 + 告警（需 LLM DB + ADMIN_DIAGNOSTICS_TOKEN）
tripnara harness cost history --api-base http://localhost:3000 --token "$ADMIN_DIAGNOSTICS_TOKEN"
tripnara harness cost history --json

# Shadow Grader ops（需 ADMIN_DIAGNOSTICS_HARNESS_ENABLED=1 + token）
tripnara harness shadow-grader status --api-base http://localhost:3000 --token "$ADMIN_DIAGNOSTICS_TOKEN"
tripnara harness shadow-grader register --task-id my-task --adapter-path /app/outputs/my-task --token "$ADMIN_DIAGNOSTICS_TOKEN"
tripnara harness shadow-grader list --token "$ADMIN_DIAGNOSTICS_TOKEN"

# Kernel hard gate sign-off（需 HARNESS_SHADOW_AFTER_PHASE=1 积累 consecutive）
tripnara harness kernel-hard status --api-base http://localhost:3000 --token "$ADMIN_DIAGNOSTICS_TOKEN"

# Badcase catalog（需 on-failure trace 落盘）
tripnara harness badcase collect
tripnara harness badcase list
tripnara harness badcase search VERIFY
bash scripts/collect-harness-badcases.sh   # cron 友好

# 在线质量环 batch + admin 快照
npm run harness:quality-loop
tripnara harness quality status --token "$ADMIN_DIAGNOSTICS_TOKEN"
tripnara harness quality run

# Shadow Harness + LLM provider 报表
tripnara harness shadow-harness status --token "$ADMIN_DIAGNOSTICS_TOKEN"
tripnara harness llm-routing status --token "$ADMIN_DIAGNOSTICS_TOKEN"
```

---

## 7. 分享案例 → 本仓库映射

| 案例 | 现状 | 下一步 |
|------|------|--------|
| Checklist 后 rollback 闪退 | VERIFY→RESEARCH、行程 revision rollback | P2 执行图 checkpoint |
| Agent 删老板邮件 | tool deny/ask | P0 destructive tool deny + audit |
| Less is more（少 skill） | skill-evolver | 定期 validate + 下线低 utility skill |
| Minimal harness 上 leaderboard | L1 smoke + decision closure golden | 在线 eval 采样 |
| 成本 overnight burn | token 上限 | P1 org/session spend cap |

---

## 8. 环境变量速查

模板文件：[`/.env.harness-production.example`](../../.env.harness-production.example)

```bash
# ── State ──
# REDIS_* 必配（多 Pod）；勿 DISABLE_REDIS

# ── Control ──
FEATURE_AGENTIC_GOVERNANCE_HITL=1
AGENTIC_LOOP_MAX_TOTAL_TOKENS=4000
AGENTIC_LOOP_MIN_REMAINING_MS=800
# AGENTIC_DAILY_TOKEN_QUOTA_PER_USER=200000
# AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL=2000000

# ── Observability（排障套餐）──
HARNESS_TRACE_MODE=on-failure
HARNESS_TRACE_EXPORT_DIR=artifacts/harness-on-failure
DECISION_OS_RAG_EVIDENCE_ENABLED=true   # 路政物化 / explain.optimization

# ── 可选进阶 ──
ORCHESTRATOR_CONTEXT_LINT_ENABLED=1
HARNESS_SHADOW_AFTER_PHASE=1
npm run harness:l1-smoke
```

完整 Trace 三态与 Kernel 失败单点见 [harness-architecture-map.md §3](./harness-architecture-map.md#3-trace-三态与-kernel-失败单点)。

---

## 9. 相关文档

| 文档 | 用途 |
|------|------|
| [harness-badcase-runbook.md](./harness-badcase-runbook.md) | Badcase catalog 采集 / cron / CLI 检索 |
| [harness-quality-loop-runbook.md](./harness-quality-loop-runbook.md) | 在线质量环 batch + runtime 采样 |
| [harness-context-lint-runbook.md](./harness-context-lint-runbook.md) | Context Lint 生产 rollout |
| [../../monitoring/GRAFANA_HARNESS_COST_IMPORT.md](../../monitoring/GRAFANA_HARNESS_COST_IMPORT.md) | LLM cost Grafana 看板导入 |
| [harness-kernel-hard-runbook.md](./harness-kernel-hard-runbook.md) | Control：Kernel 硬门禁签字与回滚 |
| [harness-trace-deploy-runbook.md](./harness-trace-deploy-runbook.md) | Observability P0 部署与排障 |
| `tripnara harness trace list/show/open/from-response` | Observability P1 CLI |
| [harness-1x-roadmap.md](./harness-1x-roadmap.md) | 梯队 1–4 演进 |
| [harness-architecture-map.md](./harness-architecture-map.md) | 模块依赖、env 矩阵 |
| [ORCHESTRATION_GOVERNANCE_MATRIX.md](../../src/agent/orchestration/ORCHESTRATION_GOVERNANCE_MATRIX.md) | GATE/VERIFY/REPAIR |
| [pa-context-memory-p0.md](../agent/pa-context-memory-p0.md) | PA Redis 会话 |
| [frontend-decision-closure-integration.md](../../docs/frontend-decision-closure-integration.md) | 前端 L1/L2 |

---

*维护：变更 Harness 语义、新增 env 或关闭缺口项时，同步更新本 checklist 与 [harness-1x-roadmap.md](./harness-1x-roadmap.md)。*
