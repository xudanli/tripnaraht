# TripNARA 冰岛 P0 差距清单

**文档版本：** 1.0.0  
**状态：** 工程 Backlog（对照 [travel-ontology-world-model-v1.md](./travel-ontology-world-model-v1.md) §23 P0）  
**生效日期：** 2026-07-05  
**契约落点：** `src/travel-ontology/contracts/`

---

## 使用说明

| 列 | 含义 |
|----|------|
| **现状** | 代码中已有能力 |
| **差距** | 与 Ontology SSOT 的差异 |
| **动作** | 建议工程任务（可开 issue） |
| **优先级** | P0 内排序 |

**Harness 场景：** §24 五个场景见 `src/harness/evals/fixtures/ontology-world-model/`。

---

## 1. 签证与入境资格

| 项 | 内容 |
|----|------|
| **系统问题** | 是否可以合法入境 |
| **现状** | `readiness.service` + ABU gatekeeper（`entry_transit`、`health_insurance`）；`TripWorldState` 无 `EntryEligibility` 一等字段 |
| **差距** | 无 `TravelerIdentity` → `EntryRule` → `EntryEligibility` 结构化链路；`visaRequired=true` 级别判断散落 |
| **动作** | ① `travel-ontology` 已有 `EntryEligibility` — 实现 `EntryEligibilityEvaluator` ② 编译用户护照/居留为 `TravelWorldFact` ③ Snapshot `world.facts` 投影 `ENTRY_ELIGIBILITY` ④ Harness: `ONT-SCENARIO-004` 接 Gateway |
| **代码落点** | `src/trips/readiness/`、`src/travel-ontology/contracts/core-entities.types.ts` |
| **优先级** | P0-1 |

---

## 2. 驾驶人资格

| 项 | 内容 |
|----|------|
| **系统问题** | 是否符合驾驶与租车条件 |
| **现状** | `HumanCapabilityModel`、`VehicleProfile`（`world-model.types.ts`）；租车年龄零散校验 |
| **差距** | 无 `Driver` 本体实体；驾龄、国际驾照、冬季/碎石经验未进入事实层 |
| **动作** | ① 扩展 `Driver` fact 采集（订单 + 用户声明）② Destination Pack 驾驶规则 bundle ③ Constraint: `DRIVER_ELIGIBILITY` |
| **代码落点** | `src/trips/decision/shared/world-model.types.ts`、`src/decision-runtime/packs/` |
| **优先级** | P0-2 |

---

## 3. 租车车辆能力

| 项 | 内容 |
|----|------|
| **系统问题** | 当前车辆是否适合规划路线 |
| **现状** | `VehicleProfile`、`VehicleClass`（hazard 模块）；冰岛 F 路脚本与 e2e |
| **差距** | 无 `RentalVehicle` 合同级能力（drivetrain、permittedRoadClasses）与计划路线联动 |
| **动作** | ① 订单 → `RentalVehicle` facts ② `RouteSegment.requiredVehicleCapability` 对比 ③ Harness: `ONT-SCENARIO-001` |
| **代码落点** | `src/trips/decision/hazard/`、`src/e2e/iceland-world-model.e2e.spec.ts` |
| **优先级** | P0-1 |

---

## 4. 租车合同

| 项 | 内容 |
|----|------|
| **系统问题** | 租车合同是否允许执行该路线 |
| **现状** | 自然语言/ReAct 提及 gravel、F-road；无 `RentalContract` 结构化存储 |
| **差距** | `prohibitedUse[]`、取还车窗口、夜间取车未进入 Trip World State |
| **动作** | ① 合同 PDF/订单 parser → `RentalContract` ② `USER_BOOKING` 权威优先 ③ Harness: `ONT-SCENARIO-005` |
| **代码落点** | `src/travel-compiler/`（LINKING 阶段）、新建 `src/travel-ontology/adapters/rental-contract/` |
| **优先级** | P0-1 |

---

## 5. 租车保险

| 项 | 内容 |
|----|------|
| **系统问题** | 已购保险是否覆盖主要风险 |
| **现状** | `iceland-insurance-arbitrator.util`、`constraint-registry` insurance.* 键；「全险」NL 映射 |
| **差距** | 无 `InsurancePolicy` / `DamageCause` / `InsuranceExclusion` 结构化；底盘、涉水、风损车门未统一 |
| **动作** | ① 升格 arbitrator 为 Insurance Ontology adapter ② 用户声明 vs 合同 parsed coverage 分离 ③ Harness: `ONT-SCENARIO-002` |
| **代码落点** | `src/skills/itinerary/iceland-insurance-arbitrator.util.ts`、`src/agent/services/constraint-registry.ts` |
| **优先级** | P0-1 |

---

## 6. 道路分类

| 项 | 内容 |
|----|------|
| **系统问题** | 路线是否含 F 路 / 涉水 / 季节性道路 |
| **现状** | `destination-road-ontology.types.ts`、`is-route-templates.catalog`、F 路数据文件 |
| **差距** | 道路分类与 `RouteSegment` 本体未统一 ID；Compiler graph edge 未强制 `roadClass` |
| **动作** | ① `RouteSegment` 稳定 segmentId ② CanonicalTravelGraph 边属性含 `roadClass`/`fRoad` ③ Pack ontology loader 对齐 |
| **代码落点** | `src/decision-runtime/packs/ontology/`、`src/travel-compiler/contracts/canonical-travel-graph.types.ts` |
| **优先级** | P0-2 |

---

## 7. 实时道路状态

| 项 | 内容 |
|----|------|
| **系统问题** | 当前路线是否可走 |
| **现状** | `ontology-road-status-provider.service.ts`、`RoadStatusUpdate`、`REPLAN-ROAD-CLOSURE-001` harness |
| **差距** | 道路事实未统一为 `TravelWorldFact`；过期事实 re-eval 不完整 |
| **动作** | ① road.is adapter → `TravelWorldFact`（`CURRENT_ROAD_STATUS`）② `world-model-push.scheduler` 绑定 `expiresAt` ③ 冲突时显式 `CONFLICTING` |
| **代码落点** | `src/infrastructure/external/road-is/`、`src/trips/decision/schedulers/world-model-push.scheduler.ts` |
| **优先级** | P0-1 |

---

## 8. 天气与官方预警

| 项 | 内容 |
|----|------|
| **系统问题** | 是否适合驾驶或活动 |
| **现状** | `WeatherAlert`、`RouteWeatherExposure` 接口（unified-world-model）；Neptune 天气 issue |
| **差距** | 预警绑定城市而非 `RouteSegment`；高顶车阈值在 Pack 未配置化 |
| **动作** | ① 路线暴露模型 → segment 级 facts ② Iceland Pack 风阈值 modifier ③ Harness: `ONT-SCENARIO-003` |
| **代码落点** | `src/skills/world/interfaces/unified-world-model.interface.ts`、`src/decision-runtime/packs/` |
| **优先级** | P0-2 |

---

## 9. POI 开放与预约

| 项 | 内容 |
|----|------|
| **系统问题** | 项目是否可执行 |
| **现状** | `ActivityCapability` 契约已定义；CPRE POI 解析；POI 营业时间部分覆盖 |
| **差距** | `ActivityCapability` 未接入 Constraint Gateway；预约状态非 `BookingStatus` 枚举 |
| **动作** | ① POI adapter → `OPERATING_STATUS` facts ② 活动门槛（年龄、天气）evaluate ③ Compiler VALIDATION 只读断言 |
| **代码落点** | `src/travel-ontology/contracts/core-entities.types.ts`、`src/poi-access-capacity/` |
| **优先级** | P0-3 |

---

## 10. 住宿确认和入住窗口

| 项 | 内容 |
|----|------|
| **系统问题** | 改线后能否住宿；晚到是否可行 |
| **现状** | Trip 预订表、hotel nouns（travel-ontology-constraints 预算）；无 check-in 窗口约束 |
| **差距** | 无 `accommodation.checkInWindow` fact；晚到未确认 → WARNING 未统一 |
| **动作** | ① 订单 → accommodation facts ② 改线后 re-eval 住宿可达性 ③ 与 `ONT-SCENARIO-005` 联动 |
| **代码落点** | `src/trips/readiness/`、`src/decision/kernel/travel-ontology-constraints.ts` |
| **优先级** | P0-3 |

---

## 11. 用户年龄与体能

| 项 | 内容 |
|----|------|
| **系统问题** | 行程是否适合同行者 |
| **现状** | `HumanCapabilityModel`、`TravelPartyPersona`、elderly-curfew harness fixture |
| **差距** | 老人/儿童/疲劳未与 Activity 门槛统一 evaluate |
| **动作** | ① party facts 进入 Trip World State ② Activity `minimumAge` / fitness 对比 ③ 复用 `elderly-curfew-trip-scope.fixture` 模式 |
| **代码落点** | `src/trips/decision/shared/world-model.types.ts`、`src/harness/evals/fixtures/elderly-curfew-trip-scope.fixture.ts` |
| **优先级** | P0-3 |

---

## 12. 应急与安全信息

| 项 | 内容 |
|----|------|
| **系统问题** | 出现问题如何处置 |
| **现状** | 冰岛应急号码静态数据；readiness safety_hazards；通信覆盖未建模 |
| **差距** | 无 `NaturalHazard` 统一事实链；医疗/救援距离未进决策 |
| **动作** | ① Iceland Pack NaturalHazard adapter ② 偏远路线通信覆盖 WARNING ③ P1 再接入撤离能力 |
| **代码落点** | `src/skills/world/`、`data/physical-reality/` |
| **优先级** | P0-4 |

---

## 横切差距（阻塞 P0 闭合）

| ID | 差距 | 动作 | 依赖 |
|----|------|------|------|
| X-1 | 三套 SSOT：`TripWorldState` / `TravelContextSnapshot` / `DecisionState` | Snapshot `world.facts` 强制从 `TravelWorldFact` 投影；禁止旁路 | `world-fact-to-snapshot.adapter.ts` |
| X-2 | `CONSTRAINT_GATEWAY_MODE` 默认 OFF | 冰岛 P0 场景 PROMOTE → DEFAULT_ON | `constraint-gateway-mode.config.ts` |
| X-3 | `WorldModelContext` 与 Ontology 事实双轨 | Physical 层改为 Trip World State 投影 | §28 架构图 |
| X-4 | Exploration BFF 自行判断 BLOCK | 只读 Snapshot blockers | `exploration/` PRD §197 |
| X-5 | Harness 未绑定 Ontology 不变量 | 注册 §22.1–22.3 invariants + §24 scenarios | `context-invariant.registry.ts` |

---

## 推荐 Sprint 顺序

```text
Sprint A（契约 + 投影）✅ 已启动
  travel-ontology contracts ✅
  world-fact-to-snapshot adapter ✅
  trip-world-facts builder → mapWorldFactsFromTripSnapshot ✅
  OntologyConstraintProvider → Constraint Gateway ✅
  §24 Harness evaluator 断言 ✅

Sprint B（Trip Assembler + WorldFactResolver）✅ 已启动
  WorldFactRepository.findLatestFactsForTrip (factKey trip:{tripId}:)
  TripOntologyFactsLoaderService → Assembler → tripOntologyFacts
  buildTripContextWorldFacts 合并 Canonical + DB 事实
  resolveTripExecutabilityStatus（BFF 只读 BLOCKED）
  WorldFactService.appendTripScoped 写入 helper

Sprint B（续）
  Entry + Vehicle + Contract + Insurance evaluators
  ONT-SCENARIO-001..005 Gateway 断言（取消 skip）

Sprint C（权威链闭合）
  CONSTRAINT_GATEWAY DEFAULT_ON（冰岛）
  Exploration / Agent 禁止旁路

Sprint D（监控 + 重评估）
  fact expiry → replan trigger
  Harness invariant 全绿
```

---

## 验收标准（P0 Done）

- [ ] 十二领域均有 ≥1 条 `TravelWorldFact` predicate 定义
- [ ] §24 五个 Harness 场景 Gateway 断言通过（非 skip）
- [ ] 同一 trip 的 Snapshot blockers 与 Decision Runtime 一致
- [ ] 用户订单合同事实优先于供应商营销页（冲突显式 `CONFLICTING`）
- [ ] 过期道路/天气 fact 不参与当前 BLOCK 判定
