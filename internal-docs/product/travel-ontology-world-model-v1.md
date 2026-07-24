# TripNARA 旅行本体与旅行世界模型架构说明

## ——以冰岛旅行世界模型为首个 Destination Pack

**文档版本：** 1.0.0  
**状态：** Draft（架构 SSOT 草案）  
**生效日期：** 2026-07-05  
**作者：** Product / Architecture  

**上位文档：**

- [TripNARA AI Native 产品定位与收敛战略](./TRIPNARA_AI_NATIVE_POSITIONING.md)
- [RFC-003 — Travel Context Protocol](./rfc-travel-context-protocol-v1.md)
- [Travel Compiler 集成设计](./travel-compiler-integration-v1.md)

**下位文档：**

- [冰岛 P0 差距清单](./travel-ontology-world-model-p0-gap-backlog.md)
- [旅行决策基础设施 — 产品叙事与融资框架](./tripnara-decision-infrastructure-narrative-v1.md)

**相关实现（现状）：**

- `src/travel-ontology/contracts/` — TravelWorldFact、核心实体、Snapshot 投影 adapter
- `src/travel-context/` — Travel Context Snapshot（RFC-003）
- `src/decision-runtime/packs/` — Destination Pack
- `src/decision-runtime/constraints/` — Constraint Gateway
- `src/travel-compiler/` — Travel Compiler
- `src/harness/evals/fixtures/ontology-world-model/` — §24 典型决策场景 Harness

---

## 一、文档目的

TripNARA 不应只构建一个用于生成行程的知识库，也不应为冰岛、新西兰、挪威等国家分别复制一套决策系统。

TripNARA 真正需要构建的是：

> 一套全球通用的旅行本体，一套能够持续描述具体行程状态的旅行世界模型，以及多个可插拔的目的地规则包。

这套系统需要让 TripNARA 持续回答：

* 用户是否能够合法进入目的地；
* 当前车辆是否适合规划路线；
* 租车合同是否允许执行该路线；
* 已购买保险是否覆盖主要风险；
* 实时天气、道路、活动状态是否影响行程；
* 当前计划是否仍然可执行；
* 发生变化后是否需要提醒、阻止、替代或重规划；
* AI 是否可以自动处理，还是必须先询问用户。

冰岛可以作为 TripNARA 第一套完整 Destination Pack，但冰岛不应拥有一套独立的旅行本体。

---

# 二、核心结论

TripNARA 需要区分三个核心概念：

| 概念                    | 解决的问题                 |
| --------------------- | --------------------- |
| Travel Ontology       | 旅行世界由什么构成，以及对象之间是什么关系 |
| Travel World Model    | 某个具体时间，真实旅行世界当前是什么状态  |
| Travel Decision Model | 基于当前状态，系统应该做出什么判断和行动  |

可以概括为：

> 旅行本体定义世界，旅行世界模型描述世界，旅行决策系统判断并改变世界。

三者关系如下：

```text
Travel Ontology
定义实体、关系、状态、语义
        ↓
Travel World Model
保存事实、状态、时间、证据和不确定性
        ↓
Constraint Gateway
判断条件是否满足、冲突、缺失或过期
        ↓
Decision Runtime
生成提醒、阻止、替代、重规划和执行动作
```

---

# 三、旅行本体与旅行世界模型的关系

## 3.1 旅行本体是什么

旅行本体是 TripNARA 理解旅行的统一语言。

它定义：

* 旅行世界中存在哪些对象；
* 对象之间有什么关系；
* 对象可以处于什么状态；
* 哪些关系在语义上是合法的；
* 决策、约束、风险和事实如何表达。

例如，旅行本体定义：

```text
Traveler 持有 Passport
Traveler 参与 Trip
Trip 包含 Plan
Plan 包含 Activity
Activity 发生在 POI
Activity 依赖 RouteSegment

Driver 驾驶 Vehicle
Vehicle 受 RentalContract 约束
RentalContract 包含 InsurancePolicy

WeatherHazard 影响 RouteSegment
Constraint 作用于 Activity
Decision 修改 Plan
Decision 必须引用 Fact 或 Constraint
```

这些定义不属于冰岛，也不属于任何单一国家，而是全球旅行领域的通用语义。

---

## 3.2 旅行世界模型是什么

旅行世界模型是旅行本体的运行时实例。

它保存某一趟具体旅行当前已经发生、正在发生或即将发生的事实。

例如：

```text
用户 A 持中国护照
用户 A 已获得申根签证
用户 A 计划在冰岛停留 8 天

用户 A 租用了 Toyota Yaris 2WD
租车合同禁止进入 F 路
保险包含碎石险
保险是否覆盖底盘损伤尚未确认

行程第 4 天包含 F208
F208 当前处于关闭状态
明天下午该区域存在强风预警
```

这些不是本体定义，而是依据本体结构保存的具体事实。

---

## 3.3 决策运行时是什么

决策运行时使用世界模型中的事实进行判断。

例如：

```text
路线要求 4WD
当前车辆为 2WD
租车合同禁止进入 F 路
道路当前关闭
保险不覆盖涉水风险
```

系统因此得出：

```text
当前路线不可执行
阻止将该计划标记为 READY
建议更换车辆或替换路线
```

所以：

> 本体不是事实，世界模型不是规则目录，决策运行时也不是另一个知识库。

三者必须形成一条清晰链路。

---

# 四、TripNARA 的整体架构

建议 TripNARA 最终形成以下七层结构：

```text
1. Travel Ontology
旅行领域统一语义
        ↓
2. Global Rule Packs
全球通用规则
        ↓
3. Destination Packs
冰岛、新西兰、挪威等目的地特殊规则
        ↓
4. Travel World Model
官方事实、供应商合同、用户订单、实时状态
        ↓
5. Trip World State
某一具体行程的世界状态 SSOT
        ↓
6. Constraint Gateway + Decision Runtime
约束判断、风险识别、替代和执行
        ↓
7. Context Snapshot / Agent Context / Product UI
面向页面、Agent 和用户的不同投影
```

---

# 五、旅行本体应该包含什么

完整的 Travel Ontology 不应只包含 Decision Semantics。

建议至少包括以下子域：

```text
Travel Domain Ontology
├── Traveler Ontology
├── Trip & Plan Ontology
├── Place & Route Ontology
├── Mobility Ontology
├── Booking & Contract Ontology
├── Accommodation Ontology
├── Activity Ontology
├── Immigration Ontology
├── Insurance Ontology
├── Risk & Constraint Ontology
├── World Fact Ontology
└── Decision Semantics Ontology
```

---

## 5.1 核心实体

```text
Traveler
Passport
Visa
Trip
Plan
Day
Activity
POI
Route
RouteSegment
Driver
Vehicle
RentalContract
InsurancePolicy
Booking
Accommodation
Flight
WeatherCondition
RoadCondition
Hazard
Constraint
Decision
Alternative
Evidence
Outcome
```

**TypeScript 契约：** `src/travel-ontology/contracts/core-entities.types.ts`

---

## 5.2 核心关系

```text
Traveler participatesIn Trip
Trip hasPlan Plan
Plan contains Activity
Activity occursAt POI
Activity dependsOn RouteSegment

Traveler holds Passport
Traveler hasVisa Visa
Traveler operates Vehicle

Vehicle governedBy RentalContract
RentalContract includes InsurancePolicy
InsurancePolicy covers DamageCause
InsurancePolicy excludes DamageCause

Hazard affects RouteSegment
Constraint appliesTo Activity
Decision resolves Constraint
Decision modifies Plan
Decision produces Outcome
```

---

## 5.3 通用状态

### 道路状态

```text
OPEN
OPEN_WITH_CAUTION
DIFFICULT
IMPASSABLE
CLOSED
SEASONALLY_CLOSED
UNKNOWN
```

### 预约状态

```text
UNCONFIRMED
HELD
CONFIRMED
CANCELLED
EXPIRED
```

### 计划项状态

```text
PLANNED
BOOKED
READY
AT_RISK
BLOCKED
COMPLETED
SKIPPED
```

### 证据状态

```text
VERIFIED
UNVERIFIED
CONFLICTING
STALE
EXPIRED
```

### 决策状态

```text
OPEN
AWAITING_USER
APPROVED
REJECTED
EXECUTING
EXECUTED
FAILED
ROLLED_BACK
```

**TypeScript 契约：** `src/travel-ontology/contracts/common-states.types.ts`

---

## 5.4 基础语义约束

旅行本体还需要定义基础语义：

```text
驾驶车辆的人必须满足 DriverEligibility

进入某条道路的车辆必须满足 VehicleCapability

一个 Booking 必须对应 Activity、Transport 或 Accommodation

一个 Fact 必须包含来源、观察时间和有效期

一个 Decision 必须引用其依据的 Fact 或 Constraint

一个已过期事实不能被用于当前决策

车辆或计划版本变化后，相关决策必须重新评估
```

---

# 六、TripNARA 的旅行世界模型

旅行世界模型不是一个巨大的 JSON，也不是按照“签证、天气、租车、景点”划分的知识库目录。

它需要具备：

* 统一实体标识；
* 对象关系；
* 时间有效性；
* 版本；
* 权威来源；
* 证据；
* 冲突管理；
* 不确定性表达；
* 状态变化；
* 决策依赖；
* 事件演化。

建议统一事实结构：

```typescript
interface TravelWorldFact<T> {
  factId: string;

  subjectType: string;
  subjectId: string;

  predicate: string;
  value: T;

  scope: {
    country?: string;
    region?: string;
    geometry?: unknown;
    tripId?: string;
    travelerId?: string;
    bookingId?: string;
  };

  authorityLevel:
    | 'GOVERNMENT'
    | 'OFFICIAL_OPERATOR'
    | 'SUPPLIER_CONTRACT'
    | 'USER_BOOKING'
    | 'USER_DECLARATION'
    | 'MODEL_INFERENCE'
    | 'THIRD_PARTY';

  source: {
    provider: string;
    evidenceId?: string;
    contractVersion?: string;
  };

  validFrom?: string;
  validTo?: string;

  observedAt: string;
  expiresAt?: string;

  confidence: number;

  freshness:
    | 'LIVE'
    | 'FRESH'
    | 'STALE'
    | 'EXPIRED';

  verificationStatus:
    | 'VERIFIED'
    | 'UNVERIFIED'
    | 'CONFLICTING'
    | 'INFERRED';
}
```

**实现 SSOT：** `src/travel-ontology/contracts/travel-world-fact.types.ts`  
**Snapshot 投影：** `src/travel-ontology/contracts/world-fact-to-snapshot.adapter.ts`

---

# 七、世界模型中的权威层级

冰岛旅行世界模型中的事实至少来自三类权威来源。

## 7.1 国家级权威

适合处理：

* 签证和入境规则；
* 道路状态；
* 天气预警；
* 驾驶法规；
* 火山、地震、洪水和雪崩预警；
* 应急救援信息；
* 环境保护与露营规则。

---

## 7.2 供应商合同权威

适合处理：

* 租车年龄要求；
* 车辆可进入的道路范围；
* 押金；
* 租车保险保障范围；
* 保险免赔额；
* 保险除外责任；
* 活动参加条件；
* 活动取消政策；
* 住宿晚到规则。

供应商合同事实不能被通用攻略覆盖。

---

## 7.3 用户订单权威

适合处理：

* 用户实际租赁的车辆；
* 实际驾驶人；
* 实际购买的保险产品；
* 实际合同版本；
* 实际取还车时间；
* 已确认住宿；
* 已预约活动；
* 用户实际支付或锁定的订单条件。

用户几个月前签订的合同，不一定等于供应商官网当前显示的条款。

---

## 7.4 权威冲突原则

推荐优先级不是简单的全局排序，而应按问题范围判断：

```text
法律与国家规则
→ 国家或政府权威

具体道路当前状态
→ 官方道路管理机构

具体租车保障范围
→ 用户订单合同和保险合同

具体活动是否确认
→ 用户订单与运营商确认记录

未来风险预测
→ 官方预警优先，模型推断作为补充
```

系统不能在来源冲突时静默选择其中一个。

---

# 八、冰岛旅行世界模型的五层结构

## 8.1 长期规则层

变化频率较低，通常需要人工审核和版本管理。

包括：

* 申根入境体系；
* 驾照和驾驶资格规则；
* 道路等级；
* F 路基本规则；
* 交通法规；
* 露营与环境保护；
* 应急联系电话；
* 国家级安全规则。

---

## 8.2 半动态目的地事实层

按季节、季度或供应商变化。

包括：

* 某道路通常开放的季节；
* 景点冬季开放时间；
* 露营地季节状态；
* 区域通信覆盖；
* 住宿晚到规则；
* 活动最低年龄、身高、体重；
* 租车车型许可范围；
* 保险套餐和免赔额。

---

## 8.3 实时世界状态层

按分钟、小时或每天更新。

包括：

* 道路封闭；
* 结冰、积雪、湿滑；
* 风速和阵风；
* 黄色、橙色、红色天气预警；
* 火山活动；
* 地震；
* 洪水和雪崩；
* 黑沙滩海浪风险；
* 景点临时关闭；
* 活动取消；
* 航班和渡轮变化；
* 当前日照时间。

---

## 8.4 行程实例层

描述用户这趟旅行已经确认的具体状态。

包括：

* 护照；
* 居留身份；
* 签证状态；
* 航班；
* 驾驶人；
* 租用车辆；
* 驱动方式；
* 租车合同；
* 保险范围；
* 免赔额；
* 已确认住宿；
* 已预约活动；
* 取消政策；
* 计划路线。

---

## 8.5 决策状态层

记录系统当前已经识别的问题和决定。

包括：

* 当前 Blocker；
* 当前 Warning；
* 开放决策；
* 已选替代方案；
* 用户授权状态；
* 自动监控项；
* 执行状态；
* 执行结果；
* 是否需要重新评估。

---

# 九、冰岛世界模型的十二个核心领域

| 领域      | 需要建模的信息             | 系统需要回答的问题   |
| ------- | ------------------- | ----------- |
| 入境与签证   | 护照、国籍、居留、签证、停留时长    | 是否可以合法入境    |
| 航班与机场   | 航班、机场、抵达、柜台营业时间     | 是否能顺利取车和入住  |
| 驾驶资格    | 驾照、语言、年龄、驾龄、国际驾照    | 是否符合驾驶与租车条件 |
| 租车合同    | 车型、驱动、押金、里程、道路限制    | 车辆合同是否支持计划  |
| 租车保险    | 保障、免赔额、除外责任、理赔要求    | 风险是否获得保障    |
| 道路网络    | 路面、道路等级、F 路、涉水、实时路况 | 当前路线是否可走    |
| 天气环境    | 风、雪、雨、能见度、结冰、预警     | 是否适合驾驶或活动   |
| 自然灾害    | 火山、地震、洪水、雪崩、高浪      | 是否应避开特定区域   |
| POI 与活动 | 营业、预约、装备、年龄、天气门槛    | 项目是否可执行     |
| 住宿与露营   | 入住、晚到、停车、营地开放       | 改线后能否住宿     |
| 人员与体能   | 老人、儿童、疲劳、驾驶经验       | 行程是否适合同行者   |
| 应急与保障   | 医疗、救援、通信、旅行保险       | 出现问题如何处置    |

**工程差距清单：** [travel-ontology-world-model-p0-gap-backlog.md](./travel-ontology-world-model-p0-gap-backlog.md)

---

# 十、签证与入境模型

签证模型不能只保存：

```text
visaRequired = true
```

应该拆分为用户身份、国家规则和资格判断。

## 10.1 用户身份

```text
TravelerIdentity
├── nationality
├── passportCountry
├── passportExpiryDate
├── residenceCountry
├── residencePermitType
├── previousSchengenStayDays
├── travelPurpose
└── plannedStayDays
```

## 10.2 入境规则

```text
EntryRule
├── destinationCountry
├── passportCountry
├── visaRequirement
├── allowedStayRule
├── passportValidityRule
├── requiredDocuments
├── transitRule
├── effectiveFrom
├── effectiveTo
└── sourceEvidence
```

## 10.3 入境资格结果

```text
EntryEligibility
├── status
│   ├── ELIGIBLE
│   ├── NEEDS_ACTION
│   ├── BLOCKED
│   └── UNKNOWN
├── visaRequired
├── passportValiditySatisfied
├── stayDurationSatisfied
├── missingDocuments[]
├── recommendedActions[]
└── evidenceFreshness
```

系统应该输出：

> 当前护照和居留身份需要申根短期签证，但系统尚未确认有效签证状态。行程可以继续编辑，但不能进入“可预订确认”状态。

---

# 十一、自驾模型

冰岛自驾至少需要拆成四个核心对象。

## 11.1 驾驶人

```text
Driver
├── age
├── licenceCountry
├── licenceLanguage
├── licenceCategories
├── issueDate
├── drivingExperienceYears
├── internationalPermit
├── winterDrivingExperience
├── gravelRoadExperience
└── fatigueState
```

## 11.2 车辆

```text
RentalVehicle
├── vehicleClass
├── makeModel
├── drivetrain
│   ├── 2WD
│   ├── AWD
│   └── 4WD
├── fuelType
├── tyreType
├── seats
├── luggageCapacity
├── groundClearance
├── permittedRoadClasses[]
├── prohibitedRoadClasses[]
├── riverCrossingAllowed
├── winterEquipment
└── roadsideAssistance
```

## 11.3 租车合同

```text
RentalContract
├── supplier
├── pickupLocation
├── pickupWindow
├── returnLocation
├── returnWindow
├── minimumDriverAge
├── youngDriverFee
├── depositAmount
├── creditCardRequirement
├── mileagePolicy
├── fuelPolicy
├── additionalDriverRule
├── lateReturnRule
├── prohibitedUse[]
└── contractVersion
```

## 11.4 路线区段

```text
RouteSegment
├── roadId
├── roadClass
├── surfaceType
├── fRoad
├── seasonalRoad
├── riverCrossing
├── elevation
├── distance
├── expectedDuration
├── currentRoadStatus
├── weatherExposure
├── nearestServiceDistance
└── requiredVehicleCapability
```

最终判断公式：

```text
驾驶人资格
× 车辆能力
× 合同许可
× 道路要求
× 实时天气与路况
= 当前路线可执行性
```

---

# 十二、租车保险模型

租车保险是冰岛世界模型的重点领域。

不应保存：

```text
insurance = "full coverage"
```

“全险”不能被视为标准化保障结论。

## 12.1 保险保障类型

标准化分类可以包括：

```text
ThirdPartyLiability
CollisionDamageWaiver
SuperCollisionDamageWaiver
TheftProtection
GravelProtection
SandAndAshProtection
WindshieldProtection
TyreProtection
RoadsideAssistance
PersonalAccidentProtection
```

这些只是标准语义，具体保障仍以用户合同为准。

---

## 12.2 保障对象

```text
CoverageScope
├── bodywork
├── windshield
├── windows
├── tyres
├── wheels
├── undercarriage
├── engine
├── interior
├── doors
├── towing
└── thirdPartyLiability
```

---

## 12.3 损失原因

```text
DamageCause
├── collision
├── gravel
├── sandAndAsh
├── wind
├── theft
├── animalCollision
├── waterCrossing
├── offRoadDriving
├── tyrePuncture
├── doorDamage
└── negligence
```

---

## 12.4 财务责任

```text
FinancialLiability
├── deductibleAmount
├── depositAmount
├── maximumLiability
├── preAuthorizationAmount
├── claimAdministrationFee
├── towingCostRule
└── lossOfUseRule
```

---

## 12.5 除外责任

```text
InsuranceExclusion
├── excludedCause
├── excludedComponent
├── excludedRoadType
├── excludedDriver
├── negligenceCondition
├── geographicalRestriction
└── evidenceSource
```

特别需要识别：

* 涉水；
* 底盘；
* 轮胎；
* 被风吹坏车门；
* 非许可道路；
* 越野驾驶；
* 无登记驾驶人；
* 违反合同使用车辆。

---

## 12.6 理赔义务

```text
ClaimRequirement
├── policeReportRequired
├── supplierNotificationDeadline
├── photosRequired
├── accidentStatementRequired
├── thirdPartyInformationRequired
├── vehicleReturnInspection
└── emergencyContact
```

---

# 十三、冰岛特有的 Destination Pack

冰岛 Destination Pack 不应重新定义 Vehicle、Road、Insurance 等通用实体。

它负责增加冰岛特有的：

* 风险类型；
* 规则；
* 数据源适配器；
* 语义映射；
* 约束模板；
* 决策阈值；
* 解释文案。

建议包含：

```text
Iceland Destination Pack
├── Immigration Rules
├── Driving Rules
├── F-Road Rules
├── Road Status Adapter
├── Weather Warning Adapter
├── Natural Hazard Adapter
├── Camping Rules
├── Iceland Risk Vocabulary
├── Rental Contract Parsers
├── Activity Rules
└── Decision Templates
```

---

## 13.1 冰岛特有风险词汇

```text
SandAndAshDamage
GravelDamage
RiverCrossingDamage
WindDoorDamage
UndercarriageDamage
FroadViolation
OffRoadDriving
GlacialFlood
VolcanicHazard
AvalancheHazard
SneakerWaveHazard
```

这些词汇扩展全球风险本体，但不形成另一套独立系统。

---

## 13.2 道路状态

```text
RoadState
├── OPEN
├── OPEN_WITH_CAUTION
├── DIFFICULT
├── IMPASSABLE
├── CLOSED
├── SEASONALLY_CLOSED
└── UNKNOWN
```

每条状态应包含：

* 影响道路；
* 影响区段；
* 生效时间；
* 更新时间；
* 车辆限制；
* 状态原因；
* 预计恢复时间；
* 官方证据；
* 数据有效期。

---

## 13.3 路线天气暴露

天气不能只绑定城市，还要绑定 RouteSegment。

```text
RouteWeatherExposure
├── windSpeed
├── windGust
├── precipitation
├── snow
├── visibility
├── temperature
├── icingProbability
├── warningLevel
└── exposedVehicleTypes[]
```

相同天气对不同对象影响不同：

```text
小型两驱车
高顶露营车
四驱 SUV
摩托车
徒步者
老人
儿童
```

---

## 13.4 日照窗口

```text
DaylightWindow
├── sunrise
├── sunset
├── civilTwilightStart
├── civilTwilightEnd
├── usableDrivingWindow
└── usableOutdoorWindow
```

需要影响：

* 每日驾驶窗口；
* 户外活动返回时间；
* 偏远道路夜间暴露；
* 景点到达时间；
* 极光计划；
* 疲劳风险。

---

## 13.5 自然危险

```text
NaturalHazard
├── hazardType
├── affectedGeometry
├── severity
├── validFrom
├── validTo
├── accessRestriction
├── recommendedAction
└── authoritySource
```

危险类型包括：

* 火山；
* 地震；
* 冰川洪水；
* 雪崩；
* 暴雪；
* 强风；
* 沙尘；
* 高浪；
* 冰川裂缝。

---

# 十四、POI 和活动模型

POI 不能只保存名称、经纬度和描述。

```text
ActivityCapability
├── openingWindow
├── lastEntryTime
├── reservationRequired
├── capacity
├── minimumAge
├── minimumHeight
├── maximumWeight
├── fitnessRequirement
├── equipmentRequirement
├── weatherThresholds
├── cancellationPolicy
├── operatorQualification
└── fallbackOptions[]
```

冰川徒步是否可执行，应综合：

```text
活动是否开放
+ 用户年龄
+ 用户体能
+ 天气条件
+ 道路状态
+ 到达时间
+ 装备状态
+ 预约状态
+ 运营商状态
```

而不是只判断用户是否喜欢冰川徒步。

---

# 十五、住宿、露营、补给和应急模型

## 15.1 住宿与露营

需要包含：

* 入住和退房时间；
* 晚到方式；
* 自助入住；
* 停车条件；
* 供暖；
* 厨房；
* 取消政策；
* 露营地开放季节；
* 露营车型限制；
* 电源；
* 加水；
* 排污；
* 最近替代住宿。

## 15.2 能源和补给

需要包含：

* 加油站位置；
* 营业时间；
* 充电桩类型；
* 当前车辆续航；
* 补给间隔；
* 超市营业时间；
* 餐厅营业时间；
* 偏远区域服务密度。

## 15.3 通信能力

需要包含：

* 手机网络覆盖；
* 离线地图；
* 设备电量；
* 紧急通信能力；
* 是否携带卫星通信设备。

## 15.4 医疗与救援

需要包含：

* 最近医疗机构；
* 紧急救援号码；
* 救援距离；
* 预计响应时间；
* 旅行保险；
* 撤离能力；
* 用户健康与行动能力约束。

---

# 十六、Trip World State

Travel World Model 描述完整旅行世界，而 Trip World State 是某个具体行程的运行时状态 SSOT。

例如：

```text
Trip World State
├── Trip Goal
├── Travelers
├── Active Plan
├── Entry Eligibility
├── Confirmed Bookings
├── Vehicles
├── Contracts
├── Insurance Coverage
├── Route Conditions
├── Weather State
├── Hazards
├── Constraints
├── Current Blockers
├── Current Warnings
├── Open Decisions
├── Monitoring Items
├── Execution State
└── Evidence Index
```

Trip World State 必须具备：

* 当前版本；
* 计划版本；
* 事实版本；
* 证据引用；
* 更新时间；
* 过期状态；
* 决策依赖；
* 重新评估状态。

**运行时协议 SSOT：** [RFC-003 Travel Context Protocol](./rfc-travel-context-protocol-v1.md) — Snapshot 为读模型投影，非写模型。

---

# 十七、与现有 Decision Semantics 的关系

TripNARA 现有的旅行本体工作，更接近：

```text
旅行问题
→ 事实断言
→ 影响范围
→ 可选方案
→ 决策
→ 执行状态
```

这套设计是正确的，但它不是完整 Travel Ontology，而是其中的：

```text
Risk & Constraint Ontology
+
Decision Semantics Ontology
```

因此不需要推翻已有工作。

应该将现有 Decision Semantics 重新定位为：

> Travel Ontology 中的决策语义子域。

然后补充：

* Traveler；
* Immigration；
* Vehicle；
* Route；
* Contract；
* Insurance；
* Accommodation；
* Activity；
* Booking；
* World Fact。

---

# 十八、与 Travel Compiler 的关系

Travel Compiler 是将用户输入和外部信息转化为标准世界模型对象的编译主链。

```text
用户自然语言
订单
合同
官方数据
供应商数据
实时状态
        ↓
Travel Compiler
        ↓
Lexical Analysis
Entity Recognition
Canonicalization
Identity Resolution
Linking
Fact Validation
Conflict Detection
        ↓
Travel World Model
```

例如用户输入：

> 我租了一辆丰田 Yaris，买了全险，准备走 F208。

Travel Compiler 应编译成：

```text
VehicleClass = CompactCar
Drivetrain = 2WD

RoadSegment = F208
RoadClass = F_ROAD

UserClaimedInsurance = FULL_COVERAGE
ActualInsuranceCoverage = UNKNOWN
```

随后系统识别：

```text
F208 要求车辆能力检查
当前车辆为 2WD
“全险”无法映射为标准保障范围
缺少保险合同证据
```

最终生成：

```text
BLOCKER:
车辆能力与道路要求不匹配

MISSING_EVIDENCE:
无法确认保险实际保障范围
```

所以：

> 本体是 Travel Compiler 的目标语言，世界模型是 Travel Compiler 的编译结果。

**集成 SSOT：** [travel-compiler-integration-v1.md](./travel-compiler-integration-v1.md)

---

# 十九、与 Constraint Gateway 和 Decision Runtime 的关系

世界模型不会直接决定用户界面上显示什么。

中间还需要统一的 Constraint Gateway。

```text
Trip World State
        ↓
Constraint Gateway
        ↓
Constraint Evaluation
        ↓
Decision Runtime
```

Constraint Gateway 负责：

* 判断条件是否满足；
* 判断事实是否缺失；
* 判断证据是否过期；
* 判断多个事实是否冲突；
* 判断计划与合同是否冲突；
* 判断用户能力与活动要求是否冲突；
* 将结果统一为 Blocker、Warning、Info 或 Unknown。

Decision Runtime 负责：

* 是否阻止；
* 是否提醒；
* 是否提出替代；
* 是否触发重规划；
* 是否自动监控；
* 是否需要用户授权；
* 是否自动执行；
* 如何记录执行结果。

---

# 二十、与 Context Snapshot 的关系

Context Snapshot 不是世界模型本身，而是面向页面的统一读模型。

```text
Travel World Model
        ↓
Trip World State
        ↓ projection
Trip Context Snapshot
```

完整世界模型可能包含大量事实，但行程页面只需要返回当前有用的信息。

例如行程详情页：

```text
TripContextSnapshot
├── tripGoal
├── activePlan
├── travelerEligibility
├── confirmedBookings
├── currentBlockers
├── currentWarnings
├── liveWorldChanges
├── openDecisions
└── monitoringItems
```

租车页面：

```text
RentalContextSnapshot
├── driverEligibility
├── vehicleCapability
├── contractRestrictions
├── insuranceCoverage
├── routeCompatibility
└── liveRoadRisks
```

---

# 二十一、与 Agent Context Package 的关系

Context Package 面向 Agent 和 Kernel，而不是前端。

它需要从 Trip World State 中选择与当前任务相关的内容。

```text
Trip World State
        ↓
Context Builder
        ↓
Context Package
```

Context Package 需要处理：

* 任务相关事实选择；
* Token 控制；
* 证据压缩；
* 权威来源标识；
* 事实新鲜度；
* 决策依赖；
* 冲突事实；
* 不确定性；
* 当前可用工具和授权边界。

因此：

```text
Travel Ontology
定义语义

Travel World Model
保存完整事实

Trip World State
保存具体行程当前状态

Context Snapshot
服务前端

Context Package
服务 Agent
```

---

# 二十二、与 Harness 的关系

本体和世界模型必须进入 Harness，否则容易变成不可验证的架构概念。

Harness 至少需要验证三类问题。

## 22.1 本体一致性

```text
每个 Decision 必须引用 Fact 或 Constraint

每个 Fact 必须包含来源和 observedAt

每个 Booking 必须绑定具体资源或活动

每个 InsurancePolicy 必须绑定 Vehicle、Driver 或 Booking

每个 RouteSegment 必须有稳定身份标识
```

---

## 22.2 世界状态一致性

```text
过期道路事实不能用于当前决策

用户订单合同优先于供应商当前营销页面

官方来源冲突时不能静默选一个

车辆更换后必须重新评估路线

计划版本变化后必须重新验证旧决策

保险合同版本变化后必须重新解析保障
```

---

## 22.3 决策行为正确性

```text
2WD + 明确要求 4WD 的道路
→ BLOCK

租车合同禁止进入 F 路
→ BLOCK

道路关闭
→ BLOCK

黄色强风 + 高顶露营车
→ WARNING 或 BLOCK，取决于阈值

保险保障缺失
→ WARNING 或 MISSING_EVIDENCE

签证状态未知
→ 阻止 READY，不阻止继续编辑

住宿晚到未确认
→ WARNING 或 NEEDS_ACTION
```

完整验证链路：

```text
Ontology
   ↓
World Fact
   ↓
Trip World State
   ↓
Constraint Evaluation
   ↓
Decision
   ↓
Action
   ↓
Outcome
   ↓
Harness Verification
```

**§24 场景 Harness：** `src/harness/evals/fixtures/ontology-world-model/`

---

# 二十三、冰岛 MVP 优先级

## P0：决定能不能去、能不能走

1. 签证与入境资格；
2. 驾驶人资格；
3. 租车车辆能力；
4. 租车合同；
5. 租车保险；
6. 道路分类；
7. 实时道路状态；
8. 天气与官方预警；
9. POI 开放与预约；
10. 住宿确认和入住窗口；
11. 用户年龄与体能；
12. 应急与安全信息。

---

## P1：显著影响行程质量

* 日照时间；
* 加油和充电；
* 活动天气门槛；
* 露营规则；
* 通信覆盖；
* 替代住宿；
* 航班延误；
* 极光条件；
* 疲劳和连续驾驶；
* 偏远区域补给能力。

---

## P2：体验增强

* 餐厅排队；
* 景点拥挤度；
* 摄影光线；
* 风景路线；
* 用户情绪；
* 叙事体验；
* 个性化停留节奏。

---

# 二十四、典型决策场景

## 场景一：车辆与路线不匹配

```text
计划包含 F 路
当前车辆为 2WD
合同不允许进入 F 路
```

系统输出：

> 当前车辆与计划路线不匹配，并且租车合同不允许进入该类道路。该路段无法标记为可执行，建议更换车辆或更换路线。

**Harness：** `ONT-SCENARIO-001-VEHICLE-ROUTE-MISMATCH`

---

## 场景二：保险存在缺口

```text
保险覆盖碰撞和碎石
未确认底盘和涉水保障
计划包含涉水风险
```

系统输出：

> 当前保险没有确认底盘和涉水损失保障，而计划路线存在涉水风险。建议确认保险合同或替换该路线。

**Harness：** `ONT-SCENARIO-002-INSURANCE-GAP`

---

## 场景三：强风影响高顶露营车

```text
官方强风预警
当前车辆为高顶露营车
计划经过开放且暴露的道路
```

系统输出：

> 明天下午路线区域存在强风预警，高顶露营车受侧风影响较大。建议提前通过该路段，或将住宿调整到上一站。

**Harness：** `ONT-SCENARIO-003-STRONG-WIND-CAMPER`

---

## 场景四：签证状态未确认

```text
行程日期已确定
护照需要签证
系统未获取有效签证证据
```

系统输出：

> 当前尚未确认有效签证。行程可以继续规划，但不能进入“可预订确认”状态。

**Harness：** `ONT-SCENARIO-004-VISA-UNCONFIRMED`

---

## 场景五：航班与取车柜台冲突

```text
航班预计到达时间
晚于租车柜台营业时间
订单没有夜间取车说明
```

系统输出：

> 当前航班到达时间晚于租车柜台营业时间，且订单未确认夜间取车方式。需要联系租车公司、调整取车时间或增加机场住宿。

**Harness：** `ONT-SCENARIO-005-FLIGHT-RENTAL-CONFLICT`

---

# 二十五、推荐统一命名

为避免“本体、世界模型、上下文、规则包”混乱，建议固定以下名称。

| 名称                    | 定位                      |
| --------------------- | ----------------------- |
| Travel Ontology       | 旅行领域统一实体、关系、状态和语义       |
| Global Rule Pack      | 全球通用规则                  |
| Destination Pack      | 目的地特殊规则、适配器和扩展词汇        |
| Travel World Model    | 完整旅行世界事实模型              |
| Trip World State      | 某一具体行程当前状态 SSOT         |
| Constraint Gateway    | 统一约束评估入口                |
| Decision Runtime      | 判断、替代、授权和执行系统           |
| Trip Context Snapshot | 面向前端的统一上下文读模型           |
| Context Package       | 面向 Agent 和 Kernel 的上下文包 |
| Harness               | 本体、状态、决策和执行的验证系统        |

---

# 二十六、不建议的实现方式

## 26.1 不要每个国家复制一套决策系统

错误方式：

```text
Iceland Decision Engine
New Zealand Decision Engine
Norway Decision Engine
```

正确方式：

```text
Global Decision Runtime
        +
Iceland Destination Pack
New Zealand Destination Pack
Norway Destination Pack
```

---

## 26.2 不要把本体做成知识目录

错误方式：

```text
签证
天气
道路
保险
景点
住宿
```

这只是信息分类。

本体必须表达：

```text
谁受什么规则影响
什么事实作用于哪个计划项
什么条件会产生什么约束
什么决策解决什么问题
```

---

## 26.3 不要把世界模型做成一个大 JSON

错误方式：

```json
{
  "visa": {},
  "weather": {},
  "car": {},
  "insurance": {},
  "pois": {}
}
```

这种方式缺少：

* 统一身份；
* 关系；
* 时间；
* 版本；
* 权威来源；
* 证据；
* 冲突；
* 决策依赖；
* 状态演化。

---

## 26.4 不要将“全险”等自然语言直接作为事实

```text
用户说购买了全险
≠
已确认所有风险都获得保障
```

正确做法是：

```text
UserClaim:
FULL_COVERAGE

ParsedCoverage:
UNKNOWN

MissingEvidence:
INSURANCE_CONTRACT
```

---

# 二十七、推荐落地顺序

## 第一阶段：统一概念和契约

完成：

* Travel Ontology 核心实体；
* World Fact 契约；
* Evidence 契约；
* Authority 层级；
* Trip World State 契约；
* Constraint 结果契约。

---

## 第二阶段：冰岛 P0 Destination Pack

优先实现：

* 签证；
* 驾驶资格；
* Vehicle Capability；
* Rental Contract；
* Insurance；
* F 路；
* 道路状态；
* 天气预警；
* 住宿入住；
* 活动预约。

---

## 第三阶段：统一决策链

将冰岛 P0 规则全部接入：

```text
Trip World State
→ Constraint Gateway
→ Decision Runtime
→ Decision Semantics
→ Context Snapshot
```

禁止页面或 Agent 绕过统一权威链直接判断。

---

## 第四阶段：接入持续监控

监控：

* 天气；
* 道路；
* 航班；
* 活动状态；
* 住宿；
* 合同状态；
* 签证有效期；
* 计划版本变化。

---

## 第五阶段：建立 Harness

为每个重要场景建立：

* 输入事实；
* 预期约束；
* 预期决策；
* 允许动作；
* 禁止动作；
* 可解释证据；
* 状态变化后的重新评估。

---

# 二十八、最终架构

```text
Global Travel Ontology
        +
Global Rule Packs
        +
Iceland Destination Pack
        +
Official World Facts
        +
Supplier Contract Facts
        +
User Booking Facts
        +
User Profile and Trip Facts
        ↓
Travel Compiler
        ↓
Travel World Model
        ↓
Trip World State
        ↓
Constraint Gateway
        ↓
Decision Runtime
        ↓
Decision Semantics
        ↓
Trip Context Snapshot
        ↓
Frontend / Agent / Automation
        ↓
Execution Outcome
        ↓
Travel Event Store
        ↓
Harness / Evaluation / Learning
```

---

# 二十九、最终结论

TripNARA 确实需要构建旅行世界模型，但旅行世界模型不能取代旅行本体。

最准确的关系是：

> 旅行本体是 TripNARA 理解旅行的语言；旅行世界模型是 TripNARA 使用这套语言记录的现实；Trip World State 是某一趟具体旅行的当前现实；决策运行时则基于这一现实持续判断下一步应该做什么。

冰岛的签证、租车、保险、F 路、天气、火山、住宿和活动，不应该分别形成孤立模块。

它们应统一进入：

```text
本体定义
→ 事实采集
→ 世界状态
→ 约束判断
→ 决策
→ 执行
→ 结果验证
```

TripNARA 的核心差异化不只是“知道冰岛旅行规则”，而是：

> 能够持续理解某个用户、某个时间、某个计划、某份合同和当前真实世界之间的关系，并对这趟旅行是否仍然可执行负责。

这才是 TripNARA 从 AI 行程生成工具，走向旅行决策与执行系统的底层基础。

