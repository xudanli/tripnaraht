# Agent Phase Executor Module

Phase Executors 实现专利「Conductor 只调 Kernel」：业务逻辑从 Orchestrator 迁移至 Kernel，Conductor 仅负责状态机与异常恢复。

## 架构

```
Conductor (claude-orchestrator.service.ts)
  └─ KERNEL_NATIVE_EXECUTION=true 时
       └─ Kernel.executeResearch / executeGateEval / executePlanGen / executeVerify / executeRepair
            └─ ResearchExecutorService / GateEvalExecutorService / PlanGenExecutorService / VerifyExecutorService / RepairExecutorService
  └─ KERNEL_NATIVE_EXECUTION=false 时（降级）
       └─ executePhaseViaKernel(..., () => execute*Step(...))
```

## 模块结构

| 文件 | 职责 |
|------|------|
| `research-executor.service.ts` | RESEARCH：Skills + WorldModel + Prediction |
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
```

默认 `false`，保持 callback 降级路径，便于回滚。

## 测试

```bash
npm test -- execution
```

覆盖：TripContextExtractor、WorldModelCollector、PredictionCollector、ResearchExecutor、GateEvalExecutor、PlanGenExecutor、VerifyExecutor、RepairExecutor。

## 参考

- `docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md`
- `docs/DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN.md`
