# 旅行规划决策层（Decision Layer）

## 概述

将旅行规划从"生成文本"升级成"求解一个可执行的动态计划"的高维框架。

核心思想：把旅行规划抽象成 **State（世界状态）+ Constraints（约束）+ Objective（目标函数）+ Actions（动作）**

## 架构

### 1. 世界模型（World Model）

**文件**: `world-model.ts`

定义了系统的"眼睛"——系统必须"看见真实"：

- **已有数据**：目的地、天数、偏好、节奏、预算
- **需要补齐**：
  - POI/活动的开放时间、季节性、门票/预约、预计停留时长、地理位置
  - 交通网络与时耗（路程、等待、换乘、驾车限制）
  - 天气/路况/海况窗口（尤其冰岛这种强不确定性目的地）
  - 用户的体力/风险偏好（可量化：轻松/适中/硬核）

### 2. 计划模型（Plan Model）

**文件**: `plan-model.ts`

定义可执行的计划输出结构，贴近现有的 `days -> timeSlots` 结构：

- `PlanSlot`: 单个时间槽（活动项）
- `PlanDay`: 一天的安排
- `TripPlan`: 完整行程计划

### 3. 决策日志（Decision Log）

**文件**: `decision-log.ts`

实现"自我纠偏"的证据链：

- 每次计划生成/修复都可审计、可回放、可学习
- 记录触发原因、保留/移除项及原因、改动幅度
- 支持结果反馈（用户是否采纳、是否改回、是否投诉/满意）

## 三个决策策略

### Abu（保谁）- Risk-based Prioritization

**文件**: `strategies/abu.ts`

**目标**：当时间/体力/预算不够时，不是"平均砍"，而是保核心体验，砍边角，且可解释。

**策略**：
1. 硬保留：mustSee / booked / fixed events
2. 评分函数：意图匹配 + 质量 + 独特性 - 天气惩罚 - 风险惩罚 - 成本惩罚
3. 贪心选择：按评分从高到低选择，直到达到限制

**输出**：
- `kept`: 保留的活动列表
- `dropped`: 丢弃的活动列表
- `reasonsById`: 每个活动的决策原因

### Dr.Dre（先做哪个）- Constrained Scheduling

**文件**: `strategies/drdre.ts`

**目标**：把一天的候选活动变成一条可执行时间轴：满足开放时间窗、移动时耗、缓冲。

**策略**：
1. 优先级排序：mustSee > 质量 > 库存风险
2. 贪心插入：每次选择最优先且可行的活动
3. 可行性检查：开放时间窗 + 路程时间 + 停留时间 + 缓冲

**输出**：
- `PlanSlot[]`: 按时间排序的活动时间槽列表

### Neptune（世界变了怎么办）- Plan Repair

**文件**: `strategies/neptune.ts`

**目标**：当出现天气、闭馆、超时等变化时，最小改动修复，不要"全推翻重来"。

**策略**：
1. 检测违规：天气、闭馆、时间超限等
2. 尝试替换：在同一时间槽内替换为可行活动
3. 降级处理：如果无法替换，转为休息/自由活动

**输出**：
- `plan`: 修复后的计划
- `triggers`: 检测到的违规列表
- `changedSlotIds`: 修改的时间槽ID列表
- `explanation`: 修复说明

## 决策引擎

**文件**: `trip-decision-engine.service.ts`

整合三个策略的核心服务：

### 主要方法

1. **`generatePlan(state: TripWorldState)`**
   - 生成初始计划
   - 使用 Abu + Dr.Dre 策略
   - 返回计划和决策日志

2. **`repairPlan(state: TripWorldState, plan: TripPlan, trigger?: DecisionTrigger)`**
   - 修复现有计划
   - 使用 Neptune 策略
   - 返回修复后的计划和决策日志

## 集成方式

### 1. 模块导入

```typescript
import { DecisionModule } from './decision/decision.module';

@Module({
  imports: [DecisionModule],
  // ...
})
export class YourModule {}
```

### 2. 使用决策引擎

```typescript
import { TripDecisionEngineService } from './decision/trip-decision-engine.service';
import { TripWorldState } from './decision/world-model';

@Injectable()
export class YourService {
  constructor(
    private decisionEngine: TripDecisionEngineService
  ) {}

  async planTrip() {
    // 1. 构建世界状态
    const state: TripWorldState = {
      context: {
        destination: 'IS',
        startDate: '2026-01-02',
        durationDays: 7,
        preferences: {
          intents: { nature: 0.8, culture: 0.4 },
          pace: 'moderate',
          riskTolerance: 'medium',
        },
      },
      candidatesByDate: {
        '2026-01-02': [/* ... */],
        // ...
      },
      signals: {
        lastUpdatedAt: new Date().toISOString(),
      },
    };

    // 2. 生成计划
    const { plan, log } = await this.decisionEngine.generatePlan(state);

    // 3. 使用计划
    // ...

    // 4. 当世界状态变化时，修复计划
    const { plan: repairedPlan, log: repairLog } = 
      this.decisionEngine.repairPlan(state, plan, 'signal_update');
  }
}
```

### 3. 适配现有服务

决策引擎通过 `SenseTools` 接口与现有服务集成：

- **交通服务**：通过 `SenseToolsAdapter` 适配 `SmartRoutesService`
- **酒店位置**：可以通过 `getHotelPointForDate` 从 TripService 获取
- **天气服务**：通过 `ExternalSignalsState` 传入

## 与现有系统的融合

### 现有架构

- **Context / Core / Widgets 分层**：这是"世界模型"的容器
- **Router（System1/System2）+ Tools**：这是"执行系统"

### 融合方式

1. **在 Core 里新增 Decision Layer**
   - 不负责 UI，不负责工具细节
   - 只做三件事：
     - 读取 Context（世界状态）
     - 产出可执行的 Plan（时间轴 JSON）
     - 生成 Decision Log（为什么这样排、保了什么、砍了什么）

2. **工具分类**
   - **感知工具（Sense Tools）**：天气、开放时间、票价、交通时耗、汇率
   - **执行工具（Act Tools）**：预订跳转、路线导航、提醒、生成清单/导出

3. **Router 对齐**
   - **System 1（快）**：规则/模板/启发式 → 适合时间不够、数据不足
   - **System 2（慢）**：搜索 + 多轮校验 + 局部优化/回溯 → 适合约束复杂、需要高可靠性

## 数据契约

### Trip World Model

统一的数据契约，支撑决策闭环：

- `ActivityCandidate`: POI/活动（位置、时长、开放窗、成本、风险、替代集合）
- `TravelLeg`: 出行方式、时间、费用、可靠性
- `UserPreferenceProfile`: 偏好权重、节奏、体力预算、风险偏好
- `TripPlan`: timeSlots + 约束检查结果 + 备选集

## 最佳实践

1. **先做"可解释的启发式"，再逐步增强优化**
   - MVP 不需要一上来就上复杂优化
   - 先把 Abu（保谁）和 Neptune（修复）做好：用户体感提升最大
   - Dr.Dre（日内排序）用简单可行的启发式 + 校验（开放窗/路程）就很强

2. **一定要做 Decision Log（这是自我纠偏的灵魂）**
   - 每次生成/调整都记：
     - 触发原因（天气变化/时间不足/预算超）
     - 保留/移除项及原因
     - 改动幅度（改了多少 slot）
     - 结果（用户是否采纳、是否改回、是否投诉/满意）

3. **没有这条"证据链"，你很难让系统越用越聪明**

## 已实现的高级功能

### 1. 约束校验器 (ConstraintChecker)

**文件**: `constraints/constraint-checker.ts`

标准化的约束校验，输出 `violations[]`：

- ✅ 时间窗校验：开放时间、预约时间窗
- ✅ 连通性校验：travelLeg 可达性、时耗阈值
- ✅ 预算校验：日预算/总预算
- ✅ 体力/强度校验：每日 active minutes、风险等级
- ✅ 天气可行性校验：户外敏感活动的硬阈值/软阈值

### 2. 数据可用性分级 + 降级策略

**文件**: `data-quality/data-quality.model.ts`

显式化数据质量，支持降级策略：

- ✅ 数据质量评估：confidence / freshness / source
- ✅ 计划可靠性等级：A（强约束可验证）/B（弱约束推断）/C（未知假设）
- ✅ 降级策略配置：未知开放时间、不可靠旅行时间、不确定天气

### 3. 目标函数与权重配置化

**文件**: `config/objective-config.ts`

从写死的启发式升级为可配置策略：

- ✅ 预设策略模板：relaxed / moderate / intense / family / photography / adventure
- ✅ 可配置权重：satisfaction / violationRisk / robustness / cost
- ✅ Abu/Dr.Dre 策略参数可配置

### 4. Plan Diff / Plan Repair

**文件**: `plan-diff/plan-diff.ts`

真正的"最小改动"策略：

- ✅ Slot-level diff：moved / removed / added / swap 分类
- ✅ 编辑距离计算：量化改动幅度
- ✅ 最小改动策略：swap → reorder → drop 优先级

### 5. 候选集工程化

**文件**: `candidates/candidate-pool.service.ts`

把候选活动从"散点"变成"可控供给"：

- ✅ 每日候选集生成器：按距离圈/主题/节奏生成 TopN
- ✅ 备选集生成：室外↔室内、远↔近、贵↔便宜
- ✅ alternativeGroupId 自动分配：同类/同区域分组

### 6. Travel 时间与可靠性体系

**文件**: `travel/reliability.service.ts`

增强 travelLeg 的可靠性信息：

- ✅ reliability（置信度）评估
- ✅ worst-case（保守时耗）计算
- ✅ 根据可靠性自动调整缓冲

### 7. 事件驱动触发机制

**文件**: `events/event-trigger.service.ts`

定义什么事件触发 Neptune repair：

- ✅ 事件类型：weather_update / availability_update / user_behavior / traffic_change
- ✅ 去抖/节流控制：避免频繁触发
- ✅ 状态变化检测：自动生成修复事件

## 已实现的完整功能列表

### ✅ 核心功能（10/10）

1. ✅ **约束校验器** - 时间窗、连通性、预算、体力、天气校验
2. ✅ **数据可用性分级** - confidence/freshness/source + 降级策略
3. ✅ **目标函数配置化** - 6个预设策略模板 + 可配置权重
4. ✅ **Plan Diff/Repair** - 最小改动策略 + slot-level diff
5. ✅ **候选集工程化** - 每日候选集生成器 + 备选集
6. ✅ **Travel 可靠性体系** - reliability + worst-case 时耗
7. ✅ **事件驱动触发** - 去抖/节流 + 状态变化检测
8. ✅ **评估与回放框架** - 离线回放 + 指标体系
9. ✅ **单元测试** - 核心策略和服务的测试用例
10. ✅ **版本控制** - 版本管理 + feature flag 支持

## 已实现的增强功能 ✅

### 1. ✅ 人机协同：可解释 UI 组件

**文件**: `explainability/explainability.service.ts`

**功能**：
- ✅ 生成计划解释：为什么这样排、使用的策略、决策原因
- ✅ 解释计划变化：触发原因、改动详情、建议操作
- ✅ 时间槽级别解释：每个活动的保留原因、警告、建议
- ✅ 可操作的提示：支持锁定、替换、调整等操作

**API 接口**：
```typescript
const explanation = explainabilityService.explainPlan(plan, log, violations);
// 返回前端可直接使用的解释数据
```

### 2. ✅ 支持学习机制（从 Decision Log 中学习）

**文件**: `learning/learning.service.ts`

**功能**：
- ✅ 从决策日志中学习：分析用户采纳率、计划稳定性、可执行率
- ✅ 模式识别：常见触发原因、策略组合、违规类型
- ✅ 自动调整建议：根据学习结果调整策略参数
- ✅ 置信度评估：基于样本数量和指标一致性

**使用示例**：
```typescript
const learningResult = learningService.learnFromLogs(logs, userFeedback);
// 返回策略调整建议和置信度
```

### 3. ✅ 支持更复杂的约束（互斥组、依赖关系）

**文件**: `constraints/advanced-constraints.service.ts`

**功能**：
- ✅ 互斥组约束：同一组最多选择N个（如：同类瀑布只能选1个）
- ✅ 依赖关系：
  - `before` / `after` - 时间顺序依赖
  - `same_day` - 必须在同一天
  - `adjacent` - 必须相邻（可设置最小间隔）
- ✅ 约束校验：检查计划是否违反高级约束
- ✅ 候选集过滤：应用约束到候选集

### 4. ✅ 性能优化：批量计算、缓存策略

**文件**: `performance/cache.service.ts`, `performance/batch.service.ts`

**功能**：
- ✅ 计划缓存：基于状态键缓存生成的计划（TTL可配置）
- ✅ 中间结果缓存：缓存计算中间结果，避免重复计算
- ✅ 批量生成：并行生成多个计划
- ✅ 批量校验：并行校验多个计划的约束
- ✅ 批量评估：并行评估多个计划的指标

### 5. ✅ 监控和告警：实时指标监控

**文件**: `monitoring/monitoring.service.ts`

**功能**：
- ✅ 性能监控：
  - 平均生成时间、修复时间
  - P95 生成时间、修复时间
- ✅ 质量监控：
  - 平均可执行率
  - 平均稳定性
  - 违规率
- ✅ 使用统计：
  - 总生成数、修复数
  - 活跃用户数
- ✅ 自动告警：
  - 性能告警（超过阈值）
  - 质量告警（可执行率低、违规率高）

---

## 完整功能清单

**核心功能**：10/10 ✅  
**增强功能**：5/5 ✅  
**总计**：15/15 ✅

**状态**：所有功能已完整实现，系统已具备生产级能力 🎉

