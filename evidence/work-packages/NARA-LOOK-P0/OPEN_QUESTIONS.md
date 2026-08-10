# Open Questions — S1 Pre-Code Decisions

**Status:** CLOSED  
**Decision date:** 2026-07-25  
**Scope:** NARA Look P0 / S1  
**Rule:** 本文件冻结 S1 编码前必须明确的产品与架构决策。后续如需修改，必须通过 RFC 或变更评审，不得在实现中隐式偏离。

---

## Decision Summary

| ID | Decision | Result |
| -- | -------- | ------ |
| Q1 | ACCEPT | 新增独立 `ObservationChannel`，不复用 Assessment Lane |
| Q2 | ACCEPT | Look 不新增 Apply 链路，复用现有 Preview / Confirm / Apply |
| Q3 | ACCEPT | P0 不修改核心 `VehicleProfile` 契约 |
| Q4 | CHANGE | 默认 TTL 改为 `min(72h, tripEnd+24h)`，不保存至7天 |
| Q5 | ACCEPT | 无 GPS 仅允许视觉 INFO，不形成正式道路或入口结论 |
| Q6 | ACCEPT | 未完成时 Assessment GET 返回 409 |
| Q7 | ACCEPT | 补拍沿用同一 `observationId` |
| Q8 | CHANGE | 冻结角色权限、驾驶员安全限制和中英文 CTA |

**Canonical product freeze for Q8 CTA/roles:** [`s0-contracts/CTA_AND_ROLES.md`](./s0-contracts/CTA_AND_ROLES.md)

---

# Q1 — Observation channel naming

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **Question** | PRD “Observed Lane” vs repo `UnifiedAssessmentLaneKind`                                |
| **Decision** | **ACCEPT**                                                                             |
| **Final**    | Code 使用 `ObservationChannel = 'LOOK_FIELD'`；文档明确映射，不扩展、不复用 `UnifiedAssessmentLaneKind` |
| **Owner**    | Arch                                                                                   |

## Rationale

`Observation` 是事实采集来源，不是评估结论的逻辑车道。

两者职责不同：

```text
Observation Channel
= 事实从哪里来

Assessment Lane
= 事实在哪个评估维度被解释
```

将 `LOOK_FIELD` 加入 Assessment Lane 会导致：

* 采集来源与评估维度耦合；
* 未来眼镜、车载摄像头、用户上传等来源不断污染 Lane 枚举；
* 同一个 Observation 无法同时服务 planning、executability 或 risk assessment；
* 容易让下游误以为 Observation 已具备权威结论。

## Frozen contract

```ts
export type ObservationChannel =
  | 'LOOK_FIELD';
```

为未来保留扩展，但 S1 不提前定义：

```ts
// Future candidates, not part of S1:
'USER_UPLOAD'
'SMART_GLASSES'
'VEHICLE_CAMERA'
'PARTNER_FEED'
```

## Documentation mapping

文档中原“Observed Lane”统一改为：

* `Observation Channel`
* `Observed Evidence`
* `Observed State`

不得称为：

* Assessment Lane；
* Authoritative Lane；
* Executability Lane。

---

# Q2 — Itinerary change path

|              |                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| **Question** | SUGGEST_REPLACE / safety alternate route via new UWC Look slice vs existing DecisionProblem / Arrange Preview |
| **Decision** | **ACCEPT**                                                                                                    |
| **Final**    | **NARA Look 不新增 Apply 能力。** CTA 打开现有 Decision Gateway、Repair Preview 或 Arrange UWC                            |
| **Owner**    | Arch + PM                                                                                                     |

## Frozen rule

Look 的职责终止于：

```text
Observation
→ Grounding
→ Assessment
→ DecisionProblem / ActiveRisk
→ Existing Preview Entry
```

Look 不负责：

```text
Apply
PlanVersion Write
Route Mutation
Activity Mutation
Booking Mutation
```

## CTA routing priority

```text
1. Existing DecisionProblem already exists
   → open Decision detail / existing proposal

2. Repair candidate can be expressed by current Repair Preview
   → open Repair Preview

3. Arrangement change can be expressed by Arrange UWC
   → open Arrange Preview

4. No existing corridor can express the proposal
   → return UNSUPPORTED_ACTION_CORRIDOR
   → open RFC, not ad hoc Look Apply
```

## Required references

`ObservationAssessment.actions[]` 只允许传递：

```ts
type ObservationAction =
  | {
      type: 'NAVIGATION';
      routeRef: string;
    }
  | {
      type: 'PREVIEW';
      previewRef: string;
    }
  | {
      type: 'ACKNOWLEDGE';
    }
  | {
      type: 'RECAPTURE';
      captureInstruction: string;
    };
```

禁止新增：

```ts
type: 'APPLY'
type: 'EXECUTE'
type: 'UPDATE_PLAN'
```

## Write-safety invariant

```text
Look assessment:
writesPlanVersion = false
planVersionWriteCount = 0
```

---

# Q3 — Vehicle drivetrain model

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Question** | Extend `VehicleProfile` with `drivetrain` now?                                        |
| **Decision** | **ACCEPT**                                                                            |
| **Final**    | P0 不直接修改核心 `VehicleProfile`；使用 `ObservationContext.drivetrain` 映射现有 intake / metadata |
| **Owner**    | CS + Arch                                                                             |

## Frozen P0 model

```ts
export type LookDrivetrain =
  | '2WD'
  | '4WD'
  | 'UNKNOWN';
```

P0 不增加 `AWD` 作为独立决策值。

原因是冰岛 P0 当前需要回答的核心问题是：

```text
车辆是否满足 F-road / 高地道路要求
```

现阶段 TripNARA 的权威判断应依赖：

* intake 明确选择；
* 租车订单元数据；
* 用户确认；
* `VehicleClass`；
* 租车公司车型等级；
* 已有车辆道路适配规则。

图片识别只能作为辅助观察。

## Resolution order

```text
1. User-confirmed intake / booking metadata
2. Structured rental provider metadata
3. Existing VehicleClass mapping
4. Image observation
5. UNKNOWN
```

图片结果不得覆盖更高等级的结构化数据。

## Image ambiguity

图片识别为 UNKNOWN 时：

```text
UNKNOWN
→ request recapture
→ request rear badge / contract / dashboard
→ user confirms
```

不得自动推断：

* SUV = 4WD；
* 高车身 = 4WD；
* AWD = 满足所有 F-road；
* 品牌或车型外观足以确定租车公司实际配置。

## Follow-up RFC

另开 RFC 处理：

* `AWD` 与 `4WD` 的领域差异；
* 低速四驱；
* 涉水资质；
* 离地间隙；
* 轮胎类型；
* 高车身侧风风险；
* 房车和露营车；
* 租车公司道路限制。

---

# Q4 — Original media retention days

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Question** | Cloud original TTL                                            |
| **Decision** | **CHANGE**                                                    |
| **Final**    | `LOOK_MEDIA_SHORT_TERM_V1 = min(72h, tripEnd + 24h)`；用户删除立即生效 |
| **Owner**    | SEC + Legal                                                   |

## Why change

默认7天对 P0 来说偏长。

原始照片可能包含：

* 人脸；
* 车牌；
* 车辆合同；
* 精确位置；
* 活动订单；
* 行程时间；
* 同行成员；
* 支付或身份信息。

NARA Look 的核心价值来自结构化 Observation 和 Evidence Summary，而不是长期保留原图。

## Frozen retention policy

```ts
LOOK_MEDIA_SHORT_TERM_V1 = min(
  capturedAt + 72 hours,
  tripEnd + 24 hours
);
```

解释：

* 正常情况下原图最多保存72小时；
* 若行程更早结束，则在行程结束后24小时内删除；
* 用户主动删除立即进入删除流程；
* 安全事件不会自动延长原图保存时间；
* 如确需保留，必须由用户单独选择并授权。

## Derived data

原始媒体删除后，可保留：

* 结构化 Observation；
* OCR 后必要字段；
* 脱敏证据摘要；
* 模型版本；
* 判断结果；
* 官方数据引用；
* DecisionProblem；
* Ledger 记录。

不得默认保留：

* 原始完整照片；
* 未脱敏的人脸；
* 无关车牌；
* 完整合同页面；
* 与结论无关的背景画面。

## User delete semantics

```text
用户点击删除
→ 立即隐藏
→ 撤销访问凭证
→ 进入对象存储删除队列
→ 清理缩略图与派生缓存
→ 返回 deletionReceipt
```

目标：

```text
API access revoked: immediate
Physical object deletion: P95 ≤ 15 minutes
Backup lifecycle deletion: according to security policy
```

---

# Q5 — No GPS mode

|              |                                                     |
| ------------ | --------------------------------------------------- |
| **Question** | Allow analysis without location?                    |
| **Decision** | **ACCEPT**                                          |
| **Final**    | 允许视觉 INFO 和通用解释；禁止形成正式道路适配、入口距离和道路类 EXECUTION_BLOCK |
| **Owner**    | PM + CS                                             |

## Allowed without GPS

无位置时允许：

* OCR 识别道路标志；
* 解释标志的一般含义；
* 识别车辆外观候选；
* 识别活动运营商品牌；
* 识别合同或订单文字；
* 提醒用户开启定位；
* 提供通用安全说明。

例如：

```text
图片中疑似为 F208 道路标志。

由于无法获取当前位置，
NARA 无法确认这是否是你当前路线上的道路，
也不能据此判断当前车辆是否可以通行。
```

## Forbidden without GPS

道路意图下不得生成：

* `VERIFIED` road match；
* 正式 `VehicleRoadFit`；
* entry distance；
* route deviation；
* current route impact；
* road-based `EXECUTION_BLOCK`；
* 替代路线 Preview；
* “你现在就在 F208”；
* “请立即掉头”等定位依赖结论。

## Exception

即使没有 GPS，以下条件也不得被忽略：

* 图片明确显示官方 `ROAD CLOSED`；
* 图片明确显示禁止进入；
* 用户主动选择“这是我眼前的道路”。

但仍只能输出保守安全提示：

```text
图片中出现禁止通行或封路标志。
请不要仅依据应用继续前进，并遵循现场标志。
```

该提示属于：

```text
NOTICE / SAFETY_GENERIC
```

不是基于当前道路匹配形成的正式 `EXECUTION_BLOCK`。

## Capability matrix

| Capability                 | GPS available | No GPS |
| -------------------------- | ------------: | -----: |
| OCR / visual recognition   |             Y |      Y |
| Generic explanation        |             Y |      Y |
| Match current road segment |             Y |      N |
| Formal road-fit            |             Y |      N |
| Entry distance             |             Y |      N |
| Route impact               |             Y |      N |
| Alternate-route Preview    |             Y |      N |
| Road-based EXECUTION_BLOCK |             Y |      N |

---

# Q6 — Assessment GET before complete

|              |                                              |
| ------------ | -------------------------------------------- |
| **Question** | `GET …/assessment` while running             |
| **Decision** | **ACCEPT**                                   |
| **Final**    | 未达到 `COMPLETED` 时返回 `409 Conflict`，响应包含状态和进度 |
| **Owner**    | Arch + iOS                                   |

## Frozen response

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

```json
{
  "code": "OBSERVATION_ASSESSMENT_NOT_READY",
  "observationId": "obs_001",
  "status": "ASSESSING",
  "progress": {
    "stage": "CHECKING_TRIP_IMPACT"
  },
  "retryAfterMs": 1200
}
```

## Why 409

Assessment 资源逻辑上存在，但尚未处于可读取完成状态。

不使用：

* `404`：资源并非不存在；
* `202`：适合任务创建响应，不适合 GET 一个尚不可用的最终资源；
* `200 + partial assessment`：容易让客户端误把中间状态当正式结论；
* `204`：不能携带必要进度信息。

## iOS behavior

```text
GET observation
→ status !== COMPLETED
→ continue status UI

GET assessment
→ only after COMPLETED
```

如果客户端提前请求 Assessment：

```text
409
→ update progress
→ honor retryAfterMs
→ do not show error toast
```

## Terminal failures

当 Observation 进入失败状态时：

```http
422 Unprocessable Entity
```

例如：

```json
{
  "code": "OBSERVATION_CONTEXT_INSUFFICIENT",
  "status": "CONTEXT_MISSING",
  "recoverable": true,
  "action": "RECAPTURE_OR_ENABLE_LOCATION"
}
```

---

# Q7 — Recapture identity

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Question** | New observationId vs append media on same id                    |
| **Decision** | **ACCEPT**                                                      |
| **Final**    | 同一用户问题的补拍沿用相同 `observationId`，追加 `mediaRefs` 并重新进入 `EXTRACTING` |
| **Owner**    | Arch                                                            |

## Identity rule

以下条件同时满足时，视为补拍：

* 同一用户意图；
* 同一现实问题；
* 同一 Trip / Day；
* 同一场景上下文；
* 系统明确请求附加视角；
* 用户从当前 Observation 的 Recapture CTA 进入。

处理方式：

```text
same observationId
+ append mediaRefs
+ increment captureRevision
+ re-enter EXTRACTING
```

## Contract

```ts
interface ObservationCaptureRevision {
  observationId: string;
  captureRevision: number;
  mediaRefs: string[];
  addedAt: string;
  reason:
    | 'SYSTEM_RECAPTURE_REQUEST'
    | 'USER_ADDED_VIEW';
}
```

## State transition

```text
INSUFFICIENT
→ MEDIA_APPENDED
→ EXTRACTING
→ GROUNDING
→ ASSESSING
→ COMPLETED
```

## New observationId required when

以下情况必须创建新 Observation：

* 用户切换 Intent；
* 用户开始判断另一个对象；
* 位置明显改变；
* 当前道路段改变；
* 距离原拍摄时间过长；
* 原 Observation 已形成正式 DecisionProblem 后又出现新事件；
* 用户从历史记录点击“重新判断”；
* 图片属于不同日期或不同 Trip。

## Suggested boundary

默认满足任一条件即新建：

```text
distanceFromOriginal > 250m
or
timeSinceOriginal > 30min
or
routeSegmentId changed
or
intent changed
```

具体阈值可配置，但 S1 应保留判断字段。

## Audit requirement

重新分析时不得覆盖旧结果。

需要保留：

```text
assessmentRevision 1
assessmentRevision 2
...
latestAssessmentRevision
```

从而能够解释：

* 补拍前为什么 UNKNOWN；
* 补拍后新增了什么证据；
* 结论为什么发生变化。

---

# Q8 — PM CTA / role matrix freeze

|              |                                                                                  |
| ------------ | -------------------------------------------------------------------------------- |
| **Question** | Exact Chinese/English CTA strings + Organizer/Driver/Member/Advisor Apply rights |
| **Decision** | **CHANGE**                                                                       |
| **Final**    | 冻结中英文 CTA、权限矩阵及驾驶状态安全限制                                                          |
| **Owner**    | PM                                                                               |

**Full freeze tables:** [`s0-contracts/CTA_AND_ROLES.md`](./s0-contracts/CTA_AND_ROLES.md)

---

# Close-out

All questions are now resolved.

| ID | Status |
| -- | ------ |
| Q1 | ACCEPT |
| Q2 | ACCEPT |
| Q3 | ACCEPT |
| Q4 | CHANGE |
| Q5 | ACCEPT |
| Q6 | ACCEPT |
| Q7 | ACCEPT |
| Q8 | CHANGE |

**File status:** CLOSED

---

# S1 Entry Conditions

S1 可以开始编码，但仅允许以下范围：

* 契约和类型；
* Observation 创建与状态机；
* Media append；
* Assessment 409 行为；
* iOS Capture Mock；
* No-GPS 降级；
* 角色权限判断；
* CTA 映射；
* 无写入的 Preview reference。

S1 不允许：

* 新建 Look Apply；
* 修改 PlanVersion；
* 扩展 Assessment Lane；
* 图片识别结果覆盖 VehicleProfile；
* 原始媒体长期保存；
* 无 GPS 输出道路 EXECUTION_BLOCK；
* 使用新 Observation ID 完成同一补拍任务；
* Member 或 Advisor Confirm Apply。
