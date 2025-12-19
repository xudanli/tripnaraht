# RailPass 合规与订座决策模块

## 概述

将"欧洲铁路 Pass 的规则 + 订座策略"变成可调用的可计算能力，并融入现有的 Decision、Transport、PlanningPolicy、ScheduleAction 层。

## 核心能力

### A. Pass 合规引擎 (Eligibility & Compliance)

根据用户居住国、旅行国家集合判断应该使用 Eurail 还是 Interrail，并检查合规约束。

**关键规则：**
- Pass Family = Eurail（非欧洲居住者）| Interrail（欧洲居住者）
- Interrail 居住国规则：只允许 outbound + inbound 两次旅程在居住国使用

**服务**: `EligibilityEngineService`

### B. Pass 产品决策引擎 (Pass Selection)

根据预期 rail 段数、跨国数量、是否每天都坐火车、停留模式、预算敏感度推荐合适的 Pass 配置。

**关键规则：**
- Global/OneCountry 选择
- Flexi/Continuous 选择
- Class（First/Second）
- Mobile/Paper 选择

**服务**: `PassSelectionEngineService`

### C. 订座决策引擎 (Reservation Requirement & Strategy)

判断某一段 rail 行程是否需要订座，评估费用、风险等级，提供备用方案。

**关键规则：**
- 夜车强制订座
- 高铁/国际列车多数需要订座
- 费用预估（EUR）
- 配额风险评估

**服务**: `ReservationDecisionEngineService`

### D. 订座任务编排 (Reservation Task Orchestration)

将订座变成系统里可追踪的"任务"，管理状态流转。

**状态**: NEEDED → PLANNED → BOOKED → FAILED → FALLBACK_APPLIED

**服务**: `ReservationOrchestrationService`

### E. Travel Day 计算引擎

计算 Flexi Pass 的 Travel Day 消耗，特别是跨午夜规则。

**关键规则：**
- 不跨午夜换乘 → 1 travel day（出发日）
- 跨午夜换乘 → 2 天（出发日 + 到达日）
- Continuous Pass 不涉及 Travel Day 计算

**服务**: `TravelDayCalculationEngineService`

### F. 合规验证服务

验证行程计划是否符合 RailPass 规则。

**服务**: `ComplianceValidatorService`

## API 接口

### 1. 合规与选 Pass

#### POST /railpass/eligibility
检查用户居住国、旅行国家集合是否符合 Eurail/Interrail 规则。

**请求体**:
```json
{
  "residencyCountry": "CN",
  "travelCountries": ["FR", "DE", "IT"],
  "isCrossResidencyCountry": false,
  "departureDate": "2026-07-01"
}
```

#### POST /railpass/recommendation
根据行程特征推荐合适的 Pass 配置。

**请求体**:
```json
{
  "residencyCountry": "CN",
  "travelCountries": ["FR", "DE", "IT"],
  "estimatedRailSegments": 8,
  "crossCountryCount": 3,
  "isDailyTravel": false,
  "stayMode": "city_hopping",
  "budgetSensitivity": "MEDIUM",
  "tripDurationDays": 14,
  "tripDateRange": {
    "start": "2026-07-01",
    "end": "2026-07-14"
  },
  "passFamily": "EURAIL",
  "preferences": {
    "preferFlexibility": true,
    "preferMobile": true
  }
}
```

#### PATCH /trips/:id/railpass-profile
保存 RailPass Profile 到 Trip（待实现）。

### 2. 订座检查与规划

#### POST /railpass/reservation/check
检查单个 rail segment 是否需要订座。

#### POST /railpass/reservation/plan
为所有 rail segments 生成订座任务列表。

#### POST /railpass/reservation/checkout
生成订座清单（外跳链接/指引）。

#### PATCH /railpass/reservation/task/:taskId
更新订座任务状态。

### 3. Travel Day 模拟

#### POST /railpass/travel-days/simulate
计算 Flexi Pass 的 Travel Day 消耗。

### 4. 合规验证

#### POST /railpass/compliance/validate
验证行程计划是否符合 RailPass 规则。

## 数据模型

### RailPassProfile
挂到 Trip 的 Pass 配置。

### RailSegment
Rail 行程段信息，可关联到 ItineraryItem。

### ReservationTask
订座任务状态。

## 约束（Decision 层集成）

### C_reservation_mandatory
若 required=true 且未 booked，则 schedule 不可执行（error）。

### C_home_country_rule
Interrail 居住国使用次数不得超限。

### C_travel_day_budget
Flexi Pass 的 Travel Days 使用不得超限。

### C_reservation_budget
订座费累计不得超预算。

**服务**: `RailPassConstraintsService`

## 关键规则提醒

1. **Pass 不等于有效车票**：必须激活、填写行程/添加 Journey 才能使用
2. **Interrail 居住国限制**：只能 outbound + inbound 各一次，且都消耗 Travel Day
3. **Mobile Pass 24 小时联网要求**：每 24 小时必须联网一次，否则会变为 inactive
4. **夜车跨午夜规则**：Flexi Pass 中，跨午夜换乘消耗 2 个 Travel Day
5. **订座费用**：Pass 不包含订座费，夜车/高铁/国际列车通常需要额外付费订座

## 已完成的集成

### Decision 层动作（Actions）

**服务**: `RailPassActionsService`

提供以下动作，供 Neptune 策略调用进行最小改动修复：

- `BOOK_RESERVATION` - 订座
- `SWITCH_TO_NO_RESERVATION_ROUTE` - 改乘不需订座的慢车
- `SHIFT_DEPARTURE_TIME` - 调整出发时间
- `MOVE_SEGMENT_TO_OTHER_DAY` - 将段移到其他天
- `REPLACE_RAIL_WITH_FLIGHT_OR_BUS` - 替换为飞机/巴士
- `SPLIT_NIGHT_TRAIN` - 拆分夜车（改为日间车+住宿）
- `MERGE_SEGMENTS_SAME_DAY` - 合并同一天的段（节省 Travel Day）

**使用示例**:
```typescript
// 根据违规类型建议动作
const actions = railPassActionsService.suggestActionsForViolation(
  'RAILPASS_RESERVATION_MANDATORY',
  segment
);

// 执行动作
const result = await railPassActionsService.switchToNoReservationRoute(segment);
```

### Transport 层集成

**服务**: `TransportIntegrationService`

在 Transport 层集成 RailPass 约束，使 rail mode 支持订座要求：

- `enhanceRailTransportOption()` - 为 rail transport option 添加订座信息
- `filterOptionsByRailPassConstraints()` - 根据 RailPass 约束过滤选项
- `recommendBestRailOption()` - 推荐符合 RailPass 的最佳选项

### PlanningPolicy 集成

**服务**: `PlanningPolicyIntegrationService`

在 PlanningPolicy 的稳健度评估中集成订座失败风险/配额评估：

- `evaluateRailPassRobustness()` - 评估 RailPass 稳健度指标
- `convertToRiskPenalty()` - 将 RailPass 风险转换为稳健度惩罚分数
- `generateRobustnessImprovements()` - 生成稳健度改进建议

**评估指标**:
- 订座失败风险概率
- 配额紧张段数量
- 必须订座但未订的段数量
- Travel Day 风险（Flexi Pass）
- 总订座费用预估

### ScheduleAction 集成

**服务**: `ScheduleActionIntegrationService`

在 ScheduleAction 中添加订座可行性自动重验证：

- `revalidateReservationFeasibility()` - 重新验证订座可行性
- 自动检测段变更（新增/删除/修改）
- 识别受影响的任务
- 生成建议操作

### Agent Tools

**文件**: `actions/railpass-agent-actions.ts`

为 Agent 系统提供可调用的 RailPass 工具函数：

- `railpass.eligibilityCheck` - 合规检查
- `railpass.recommendPass` - Pass 推荐
- `railpass.checkReservation` - 订座需求检查
- `railpass.planReservations` - 订座任务规划
- `railpass.simulateTravelDays` - Travel Day 模拟
- `railpass.validateCompliance` - 合规验证
- `railpass.generateUserExplanation` - 生成用户友好解释

**已注册到 Agent Module**，可在 Agent 的 ReAct 循环中使用。

## Global Pass 特殊规则

### 1. Pass 覆盖校验 (C_pass_coverage)

Global Pass 不是 100% 覆盖所有线路，需要校验运营商/线路是否被覆盖。

**服务**: `PassCoverageCheckerService`

**规则**:
- 城市地铁/公交/有轨电车通常不包含
- 需要检查运营商是否在覆盖列表
- 输出替代方案（地铁/公交/步行/打车）

**API**: `POST /railpass/coverage/check`

### 2. 居住国使用细节增强

**规则**:
- Interrail 在居住国只能用 1 个 outbound + 1 个 inbound
- **同一天多次换乘仍算 1 travel day**（重要细节）
- 都占用 travel day，不是额外赠送

**约束**: `C_home_country_outbound_inbound_limit`

### 3. 午夜换乘和最后一天夜车

**规则**:
- 夜车如果午夜后换车：消耗 2 个 travel days
- **最后一天不能乘坐跨日夜车**（Pass 在 23:59 过期）

**约束**: 
- `C_travel_day_midnight_transfer`
- `C_last_day_night_train` (error 级别)

### 4. 订座硬约束和配额风险

**规则**:
- 必须订座但未订 → error（不可执行）
- 配额紧张 → risk=high（Abu 策略优先保留）
- 提供备用方案：慢车/绕行/改时段/拆段

**约束**: 
- `C_reservation_required`
- `R_quota_risk`

### 5. 市内交通处理

**规则**:
- Global Pass 不包含市内交通
- Transport 层需要追加 last_mile_leg（metro/bus/walk/taxi）
- 计入 T_robust 与预算

### 6. 订座渠道策略

**服务**: `ReservationChannelPolicyService`

**功能**:
- 根据国家/运营商配置订座渠道
- 生成订座清单（操作路径）
- 建议提前订座时间（如 Eurostar 建议提前 60 天）

**API**: `POST /railpass/reservation/channels`

## 规则引擎

**服务**: `RailPassRuleEngineService`

统一的规则引擎结构，支持扩展不同 Pass 类型（Eurail/Interrail/未来 JR Pass 等）。

**规则结构**:
- Condition: 触发条件
- Effect: 对 schedule 的影响（travelDay 消耗、预算增加、硬错误、风险等级、fallback 集合）
- Severity: error/warning/info
- Evidence: 引用的规则来源（给 decision-log 用）

**API**: `POST /railpass/rules/evaluate`

## 测试

### 测试状态

✅ **所有核心功能测试通过** (4/4 测试套件, 22/22 测试用例)

**测试覆盖**:
- ✅ EligibilityEngineService (92.5% 覆盖率)
- ✅ ReservationDecisionEngineService (84.78% 覆盖率)
- ✅ TravelDayCalculationEngineService (89.65% 覆盖率)
- ✅ RailPassService (基础测试)

### 运行测试

```bash
# 运行所有 RailPass 模块测试
npm test -- --testPathPatterns=railpass

# 生成覆盖率报告
npm test -- --testPathPatterns=railpass --coverage
```

详细测试结果请查看 [TEST_RESULTS.md](./TEST_RESULTS.md)

## 参考

- [Eurail Official Website](https://www.eurail.com)
- [Interrail Official Website](https://www.interrail.eu)
- [Pass Conditions of Use](https://www.eurail.com/en/plan-your-trip/eurail-pass-conditions)
