# Travel Memory Runtime · API

> 就绪：[`TMR_READINESS.md`](./TMR_READINESS.md) · 验证：[`MEMORY_VALIDATION_LOOP.md`](./MEMORY_VALIDATION_LOOP.md) · ADR：`internal-docs/architecture/ADR-TRAVEL-MEMORY-RUNTIME.md`  
> **✅ Evidence Ingestion · ⚠️ ETC/Soft 可选 Active · ❌ 默认未全面取代旧 Memory OS**

## 一句话

TMR / Traveler Memory 是 **决策经验与旅行者模型系统**。  
默认：旧 Memory OS 主硬读；写入与 ETC 投影已挂线。  
开关：`EFFECTIVE_TRAVELER_CONTEXT_CONSUME` / `TRAVELER_MEMORY_WRITE_GATE` 可启用读取闭环与脏写收口。

## 边界

| 输入 | 角色 |
|------|------|
| Decision Contract | 当前应遵守什么 |
| Self-drive World | 道路/车辆/季节（≠ Memory） |
| Travel Memory / ETC | 过去证据 + L1/L2 旅行者模型 |

**冻结：** Planner / CGUS / Recommendation 应读 **EffectiveTravelerContext**，不直读 Ledger / 旧 OS。  
**ETC：** 纯投影（read-only derived）；冲突优先级与 authority 消费面见 ADR「ETC 四纪律」。  
**旧 Memory OS：** 过渡上游兼容输入，不是永久下游契约。  
**V1 边界：** M1–M6；下一阶段用真 Trip 验证，不扩 Ontology。

## Runtime API

### 写侧

- `ingestCgusOutcomeLoop` · 热 Ledger · 可选 Prisma Durable  
- `writeCandidate` / `confirm` / `invalidate`  
- `writeTravelerMemory` — Traveler Memory Contract（8 Domain × 5 Semantic）  
- Trip Override：`TripOverrideService.applyHabitInherit` / `applyTripDifferent`  
- 脏写桥：Standing / PreferenceLearning / DNA → `TRAVELER_MEMORY_WRITE_GATE`

### 读侧

- `buildContext` / `getProfile` / `getTripMemory`（含 `travelerMemories` / `travelerOverrides`）  
- `resolveEffectiveTravelerContext`（prepareTick）  
- `listTravelerMemories`  
- Accountability：`GET /decision/:id/explanation` · `GET /memory/:id/evidence`

### HTTP · Traveler Memory 产品入口

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/traveler-memory/travelers/:userId/habit-summary` | 习惯摘要卡 |
| POST | `/traveler-memory/travelers/:userId/registration-seed` | 注册轻量种子（显式 L1） |
| POST | `/traveler-memory/trips/:tripId/inherit-habit` | 按我的习惯 |
| POST | `/traveler-memory/trips/:tripId/trip-different` | 这次不一样 |
| GET | `/traveler-memory/trips/:tripId/overrides` | 列出 L2 |
| DELETE | `/traveler-memory/trips/:tripId/overrides` | 清除 L2 |

`registration-seed` body（至少一项）：

```json
{
  "pace": "SLOW",
  "riskTolerance": "LOW",
  "dietaryRestrictions": ["no_pork"],
  "maxDailyDrivingHours": 3,
  "hotelAvoid": ["street_facing"],
  "travelPhilosophy": "RELAXED",
  "syncOsL1": true
}
```

`trip-different` body 示例：

```json
{
  "userId": "uuid",
  "overrides": [
    { "domain": "PACE", "semantic_type": "PREFERENCE", "key": "pace", "value": "FAST" }
  ]
}
```

## 环境变量

| 变量 | 作用 |
|------|------|
| `TRAVEL_CONTEXT_ASSEMBLY=off\|shadow\|consume` | TMR 装配 / CONSUME |
| `TRAVEL_MEMORY_CGUS_SOFT=active\|shadow\|off` | CGUS soft 是否改线上 |
| `EFFECTIVE_TRAVELER_CONTEXT_CONSUME=off\|shadow\|active` | ETC → Injector + soft hints |
| `TRAVELER_MEMORY_WRITE_GATE=off\|shadow\|active` | 脏写收口到 Contract |

## 观测字段（route_and_run）

- `effective_traveler_context`（含 `consumeMode` / `softHintsAudit`）  
- `travel_context_assembly` · `travel_memory_consume`  
- `memory_decision_trace` · `trip_shadow_pair`  
- Injector：`etcDecisionParamsAudit`（挂 exec ALS）

## Staging

见 [`TMR_READINESS.md`](./TMR_READINESS.md)。

## 下一阶段

真 Trip 运营验收（Benefit/Harm）→ 默认开启 ETC active + WRITE_GATE shadow/active 灰度。
