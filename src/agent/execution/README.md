# Agent Phase Executor Module

Phase Executors 实现专利「Conductor 只调 Kernel」：业务逻辑从 Orchestrator 迁移至 Kernel，Conductor 仅负责状态机与异常恢复。

## 架构

```
Conductor (claude-orchestrator.service.ts)
  └─ KERNEL_NATIVE_EXECUTION=true 时
       └─ Kernel.executeResearch / executeGateEval / executePlanGen / executeVerify / executeRepair
            └─ ResearchPipelineService / GateEvalExecutorService / PlanGenExecutorService / VerifyExecutorService / RepairExecutorService
  └─ KERNEL_NATIVE_EXECUTION=false 时（降级）
       └─ executePhaseViaKernel(..., () => execute*Step(...))
```

## 模块结构

| 文件 | 职责 |
|------|------|
| `research-executor.service.ts` | **弃用占位**：仅 re-export `ResearchPipelineService`；实现见 `../teams/research/research-pipeline.service.ts` |
| `../teams/research/research-pipeline.service.ts` | RESEARCH：拓扑管线 + Member 调度（MAT 3.0） |
| `gate-eval-executor.service.ts` | GATE_EVAL：Readiness + GatekeeperAgent |
| `plan-gen-executor.service.ts` | PLAN_GEN：itinerary.generate |
| `verify-executor.service.ts` | VERIFY：itinerary.verify |
| `repair-executor.service.ts` | REPAIR：LocalInsightAgent + repair.apply |
| `shared/world-model-collector.service.ts` | 世界模型数据收集 |
| `shared/prediction-collector.service.ts` | 预测数据收集 |
| `shared/trip-context-extractor.service.ts` | TripContext 提取 |

## 启用

```bash
KERNEL_NATIVE_EXECUTION=true
# 可选灰度：KERNEL_NATIVE_EXECUTION_GRAY_PERCENT=50
```

默认 **`true`**（Kernel Phase Executors 为主路径）。设为 `false` 可回退到 orchestrator callback；**任何降级必须**写入 `phase_execution_path_v1`（`KERNEL_LEGACY_FALLBACK` / `NARRATOR_AGENT_FALLBACK`），禁止静默。

## 测试

```bash
npm test -- execution
```

覆盖：TripContextExtractor、WorldModelCollector、PredictionCollector、ResearchExecutor、GateEvalExecutor、PlanGenExecutor、VerifyExecutor、RepairExecutor。

## 参考

- `docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md`
- `docs/DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN.md`
