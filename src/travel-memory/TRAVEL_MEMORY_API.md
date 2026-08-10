# Travel Memory Runtime · API

> 就绪：[`TMR_READINESS.md`](./TMR_READINESS.md) · 验证：[`MEMORY_VALIDATION_LOOP.md`](./MEMORY_VALIDATION_LOOP.md)  
> **✅ Evidence Ingestion Ready · ❌ Decision Consumption Not Ready**

## 一句话

TMR 是 **决策经验采集系统**（Assembly Shadow + 选择性 Consume Preview），还不是 **决策增强系统**。  
智能体主路径仍走旧 Memory OS；写入已挂线；装配默认 **off**。

## 边界

| 输入 | 角色 |
|------|------|
| Decision Contract | 当前应遵守什么 |
| Self-drive World | 道路/车辆/季节（≠ Memory） |
| Travel Memory | 过去发生过什么 |

三者经 **Context Assembly** 分槽并列，禁止互相吞并。

## 已有 Runtime

**写侧：** `ingestCgusOutcomeLoop` · 热路径 Ledger · 可选 Prisma Durable · Attribution · Lifecycle  

**读侧（审计，非 Agent 决策）：**  
- `GET /decision/:decisionId/explanation`  
- `GET /memory/:memoryEventId/evidence`  

**Context Assembly / CGUS soft：**  
- env `TRAVEL_CONTEXT_ASSEMBLY=off|shadow|consume`  
- 可选 `TRAVEL_CONTEXT_CONSUME_TASKS` · `TRAVEL_MEMORY_CGUS_SOFT=active|shadow|off`  
- consume 门控 → `__travelMemoryDecisionHints` → DSO `systemState` → CGUS `scoringHints`  
- 证明：`optimizationHints.memoryDecisionTrace`（偏好序翻 top1 → `used=true`）  
- Trip Shadow：`tripShadowPair` / `tripShadowPairRecord`（OPTIMIZE）  
- Outcome 回填：`writeCgusDecisionOutcomeLoop` → `tripShadowCaseLog` + `tripShadowNorthStar`  
- 观测：`travel_context_assembly` · `memory_decision_trace` · `trip_shadow_pair`  
- 汇总：`evaluateTripShadowCases` / `summarizeTripShadowNorthStar`  
- **未**取代 `MemoryContextAssemblerService`

## Staging

见 [`TMR_READINESS.md`](./TMR_READINESS.md)「Staging 验证清单」。

## 下一阶段

生产库 migrate → 冰岛真 Trip 运营批量验收（Benefit/Harm）
