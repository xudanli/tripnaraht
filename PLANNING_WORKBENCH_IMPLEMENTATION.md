# 规划工作台实现总结

## 概述

已成功实现规划工作台（Planning Workbench）的完整技能体系，按照"做决策与做取舍的地方"的定位，创建了完整的 P0 技能清单。

## 实现内容

### 1. 核心数据结构

#### PlanState（`src/skills/plan/shared/plan-state.types.ts`）
- 规划工作台的唯一真相数据结构
- 包含：约束、行程、移动性、预算、节奏、门控、证据、决策日志等
- 支持版本管理和 diff 追踪

#### PlanContext
- 规划上下文输入结构
- 包含：目的地、天数、交通模式、必去/必避、约束等

### 2. 总规划师技能（skill.plan.architect.*）

#### `skill.plan.architect.generateSkeleton`（System 2）
- **文件**: `src/skills/plan/architect/plan-architect-generate-skeleton.skill.ts`
- **功能**: 从目标与约束生成 2-3 套行程骨架方案（紧凑/均衡/松弛）
- **输出**: PlanSkeletonSet（包含每天主题、锚点、移动日、取舍理由）

#### `skill.plan.architect.compareOptions`（System 2）
- **文件**: `src/skills/plan/architect/plan-architect-compare-options.skill.ts`
- **功能**: 对多个方案进行可解释对比
- **输出**: OptionComparison（6 个维度评分：可执行性、成本、疲劳、体验密度、风险、自由度）

#### `skill.plan.architect.commitOption`（System 1）
- **文件**: `src/skills/plan/architect/plan-architect-commit-option.skill.ts`
- **功能**: 用户选定方案后，写入 PlanState 并产生版本号
- **输出**: plan_version、diff、decision_log_ref

### 3. 预算规划师技能（skill.plan.budget.*）

#### `skill.plan.budget.estimateBaseline`（System 1）
- **文件**: `src/skills/plan/budget/plan-budget-estimate-baseline.skill.ts`
- **功能**: 快速给出预算拆分与区间估算
- **输出**: BudgetBreakdown（交通/住宿/餐饮/门票/体验/缓冲）

#### `skill.plan.budget.detectOverrun`（System 1）
- **文件**: `src/skills/plan/budget/plan-budget-detect-overrun.skill.ts`
- **功能**: 实时检测预算是否超支
- **输出**: OverrunDetection（超支金额、超支来源 Top3）

#### `skill.plan.budget.proposeTradeoffs`（System 2）
- **文件**: `src/skills/plan/budget/plan-budget-propose-tradeoffs.skill.ts`
- **功能**: 给出"最小牺牲"的降本方案
- **输出**: 降本方案列表（换城市/减少移动日/换交通方式/降低住宿档位/减少付费体验）

### 4. 交通可达性规划师技能（skill.plan.transit.*）

#### `skill.plan.transit.buildTransferGraph`（System 1）
- **文件**: `src/skills/plan/transit/plan-transit-build-transfer-graph.skill.ts`
- **功能**: 构建跨城段可达图，识别不可达/高风险段
- **输出**: 可达图（segments、riskSegments、infeasibleSegments）

#### `skill.plan.transit.suggestModes`（System 2）
- **文件**: `src/skills/plan/transit/plan-transit-suggest-modes.skill.ts`
- **功能**: 为同一段 A→B 给出多模式对比（飞机/火车/大巴/自驾）
- **输出**: 交通方式对比（时间、成本、可靠性、所需精力）

#### `skill.plan.transit.generatePlanB`（System 2）
- **文件**: `src/skills/plan/transit/plan-transit-generate-plan-b.skill.ts`
- **功能**: 为高风险段生成 Plan B（替代城市、替代交通、替代时间窗）
- **输出**: PlanBOptions（替代方案 + 影响评估）

### 5. 节奏规划师技能（skill.plan.pace.*）

#### `skill.plan.pace.computeTimeWindows`（System 1）
- **文件**: `src/skills/plan/pace/plan-pace-compute-time-windows.skill.ts`
- **功能**: 计算每天的可用时间窗（入住退房、交通耗时、缓冲）
- **输出**: TimeWindow[]（每天的开始/结束时间、缓冲策略）

#### `skill.plan.pace.fatigueScore`（System 1）
- **文件**: `src/skills/plan/pace/plan-pace-fatigue-score.skill.ts`
- **功能**: 计算疲劳与节奏评分
- **输出**: FatigueScore（疲劳评分、疲劳驱动因素、建议休息点）

#### `skill.plan.pace.adjustSchedule`（System 2）
- **文件**: `src/skills/plan/pace/plan-pace-adjust-schedule.skill.ts`
- **功能**: 根据用户反馈调整节奏（太累/太赶）
- **输出**: 调整后的时间线、变更差异、影响评估

### 6. 安全守门人技能（skill.plan.gate.*）

#### `skill.plan.gate.precheck`（System 1）
- **文件**: `src/skills/plan/gate/plan-gate-precheck.skill.ts`
- **功能**: 快速门控检查（数据足够时做硬判断，数据不足时标记需确认）
- **输出**: GateStatus（ALLOW/NEED_CONFIRM/SUGGEST_REPLACE/REJECT）

#### `skill.plan.gate.runThreeGuardians`（System 2）
- **文件**: `src/skills/plan/gate/plan-gate-run-three-guardians.skill.ts`
- **功能**: 调用现有的 `skill.decision.runThreeGuardians`，对方案进行完整评审
- **输出**: GateStatus（包含三人格结果：Abu/Dr.Dre/Neptune）

#### `skill.plan.gate.proposeSafeAlternatives`（System 2）
- **文件**: `src/skills/plan/gate/plan-gate-propose-safe-alternatives.skill.ts`
- **功能**: 为被拒绝或需确认的方案生成安全替代方案（Neptune 风格）
- **输出**: 替代方案列表（替代路线/替代段/替代时间窗）

### 7. 底层通用技能

#### `skill.plan.evidence.buildEnvelope`（System 1）
- **文件**: `src/skills/plan/evidence/plan-evidence-build-envelope.skill.ts`
- **功能**: 统一 Evidence 结构，让所有结论可解释、可审计、可对比
- **输出**: EvidenceEnvelope（来源、摘录、相关性、置信度、数据时间戳）

#### `skill.plan.constraints.detectConflicts`（System 1）
- **文件**: `src/skills/plan/constraints/plan-constraints-detect-conflicts.skill.ts`
- **功能**: 检测约束冲突（预算不足、时间不够、节奏过载、不可达）
- **输出**: ConflictDetection（冲突列表，包含类型、严重度、影响范围）

#### `skill.plan.constraints.arbitrateTradeoffs`（System 2）
- **文件**: `src/skills/plan/constraints/plan-constraints-arbitrate-tradeoffs.skill.ts`
- **功能**: 给"最小牺牲"仲裁结果，并要求用户确认关键取舍
- **输出**: 推荐解决方案、备选方案、是否需要用户确认

#### `skill.plan.log.appendDecision`（System 1）
- **文件**: `src/skills/plan/log/plan-log-append-decision.skill.ts`
- **功能**: 把每一次结论写成可追溯日志
- **输出**: DecisionLogRef（decision_id、diff、evidence_refs、rule_version）

### 8. PlanningWorkbenchAgent 编排服务

#### `PlanningWorkbenchAgentService`
- **文件**: `src/agent/services/planning-workbench-agent.service.ts`
- **功能**: 规划工作台的主 Agent，负责编排所有规划技能
- **职责**:
  - 维护唯一 PlanState（唯一真相）
  - 决定走 System1 还是 System2
  - 在冲突时触发仲裁
  - 在关键点要求用户确认

**核心编排流程**:
1. buildContext（构建上下文）
2. architect.generateSkeleton（System2：生成骨架方案）
3. budget.estimateBaseline（System1：预算估算）
4. transit.buildTransferGraph（System1：构建可达图）
5. pace.computeTimeWindows + fatigueScore（System1：时间窗和疲劳评分）
6. gate.precheck（System1：门控预检查）
7. 若 precheck 非 ALLOW → gate.runThreeGuardians（System2：三人格评审）+ alternatives（System2：替代方案）
8. constraints.detectConflicts（System1：冲突检测）→ 必要时 constraints.arbitrateTradeoffs（System2：仲裁）
9. log.appendDecision（System1：记录决策日志）

**输出到 UI**:
- 方案卡（skeletonOptions）
- 对比卡（comparison）
- 证据抽屉（evidence）
- 确认点（confirmations）
- 健康度（health：budget/pace/feasibility）

## 文件结构

```
src/skills/plan/
├── shared/
│   └── plan-state.types.ts          # PlanState 数据结构
├── architect/
│   ├── plan-architect-generate-skeleton.skill.ts
│   ├── plan-architect-compare-options.skill.ts
│   └── plan-architect-commit-option.skill.ts
├── budget/
│   ├── plan-budget-estimate-baseline.skill.ts
│   ├── plan-budget-detect-overrun.skill.ts
│   └── plan-budget-propose-tradeoffs.skill.ts
├── transit/
│   ├── plan-transit-build-transfer-graph.skill.ts
│   ├── plan-transit-suggest-modes.skill.ts
│   └── plan-transit-generate-plan-b.skill.ts
├── pace/
│   ├── plan-pace-compute-time-windows.skill.ts
│   ├── plan-pace-fatigue-score.skill.ts
│   └── plan-pace-adjust-schedule.skill.ts
├── gate/
│   ├── plan-gate-precheck.skill.ts
│   ├── plan-gate-run-three-guardians.skill.ts
│   └── plan-gate-propose-safe-alternatives.skill.ts
├── evidence/
│   └── plan-evidence-build-envelope.skill.ts
├── constraints/
│   ├── plan-constraints-detect-conflicts.skill.ts
│   └── plan-constraints-arbitrate-tradeoffs.skill.ts
└── log/
    └── plan-log-append-decision.skill.ts

src/agent/services/
└── planning-workbench-agent.service.ts  # 编排服务
```

## 技能注册

所有新技能已在 `src/skills/skills.module.ts` 中注册：
- 导入所有技能类
- 添加到 providers 数组
- 添加到 exports 数组
- 添加 LlmModule 导入（支持规划技能使用 LlmService）

## System 1 vs System 2 区分

### System 1（快路径，< 1-3 秒级）
- 预算粗估与超支预警
- 时间窗计算、疲劳评分
- 可达性图谱/高风险换乘标记
- Gate 预检查
- 冲突检测
- 决策日志写入

### System 2（推理路径，质量优先）
- 生成多个方案并对比
- 预算降配策略
- 交通模式取舍 + PlanB
- 节奏结构性调整
- 三人格完整裁决
- 冲突仲裁
- 生成"对用户负责"的解释

## 下一步工作

1. **UI 集成**: 将规划工作台技能集成到前端 UI
2. **测试**: 编写单元测试和集成测试
3. **优化**: 根据实际使用情况优化 System 1/System 2 的触发条件
4. **扩展**: 根据需求扩展更多规划技能

## 注意事项

1. 所有技能都使用 `@Optional()` 装饰器注入依赖，避免循环依赖问题
2. System 2 技能使用 LLM 进行推理，需要确保 LlmService 可用
3. 部分技能依赖现有的决策技能（如 `skill.decision.runThreeGuardians`），需要确保 DecisionModule 已启用
4. PlanningWorkbenchAgent 是编排层，不直接实现业务逻辑，而是调用各个技能

## 人格外壳设计

### PersonaShellService（`src/agent/services/persona-shell.service.ts`）

**设计原则：面向用户只显示"三人格"作为可解释与信任的"人格外壳"，其他角色（预算/交通/节奏/总规划师）都隐藏成能力模块。**

**功能：**
- 将 PlanState 转换为三人格输出
- 整合底层能力模块的结果到三人格的决策中
- 生成面向用户的解释（第一人称）

**人格映射：**
- **Abu**：整合预算规划师（超支检测）、交通规划师（不可达检测）、安全守门人（门控检查）
- **Dr.Dre**：整合节奏规划师（疲劳评分、时间窗、节奏调整）
- **Neptune**：整合总规划师（方案生成）、交通规划师（PlanB）、安全守门人（替代方案）

**输出结构：**
- `personas`: 三人格的决策陈述（包含 verdict、explanation、evidence、recommendations）
- `consolidatedDecision`: 综合决策结果（ALLOW/NEED_CONFIRM/REJECT）
- `timestamp`: 决策时间戳

## 总结

已成功实现规划工作台的完整技能体系，包括：
- ✅ 17 个规划技能（architect/budget/transit/pace/gate/evidence/constraints/log）
- ✅ PlanState 数据结构
- ✅ PlanningWorkbenchAgent 编排服务
- ✅ PersonaShellService 人格外壳服务（将底层能力模块包装成三人格输出）
- ✅ 所有技能已注册到 SkillsModule
- ✅ 所有服务已注册到 AgentModule

所有代码已通过 linter 检查，无编译错误。

**设计亮点：**
- 用户只看到三人格（Abu/Dr.Dre/Neptune），底层能力模块对用户透明
- 保持可解释性和信任感，所有决策都有明确的来源
- 保持模块化，内部仍然清晰分离各个能力模块
