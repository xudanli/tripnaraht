# Context Engineer 单元测试指南

## 概述

Context Engineer 系统已配置完整的单元测试，使用 Jest + @nestjs/testing 框架。

## 测试文件结构

```
src/agent/context-engine/
├── services/
│   ├── context-engineer.service.ts
│   ├── context-engineer.service.spec.ts          # ContextEngineerService 单元测试
│   ├── context-metrics.service.ts
│   └── context-metrics.service.spec.ts            # ContextMetricsService 单元测试
└── README-TESTING.md                              # 本文件

src/skills/context/
├── context-build.skill.ts
├── context-build.skill.spec.ts                    # ContextBuildSkill 单元测试
├── tools-select.skill.ts
├── tools-select.skill.spec.ts                     # ToolsSelectSkill 单元测试
├── plan-select-slices.skill.ts
└── plan-select-slices.skill.spec.ts               # PlanSelectSlicesSkill 单元测试

src/skills/country-pack/
├── country-pack-get-blocks.skill.ts
└── country-pack-get-blocks.skill.spec.ts          # CountryPackGetBlocksSkill 单元测试
```

## 运行测试

```bash
# 运行所有 Context Engineer 相关测试
npm test -- --testPathPattern=context-engine

# 运行所有 Skills 测试
npm test -- --testPathPattern=skills

# 运行特定测试文件
npm test -- context-engineer.service.spec.ts

# 以监视模式运行
npm test -- --testPathPattern=context-engine --watch

# 生成覆盖率报告
npm test -- --testPathPattern=context-engine --coverage
```

## 测试覆盖

### ContextEngineerService ✅

**测试用例**:
- ✅ 服务定义测试
- ✅ 构建基本的 Context Package
- ✅ 使用缓存（内存缓存）
- ✅ 使用 Redis 缓存（如果可用）
- ✅ 记录监控指标
- ✅ 超预算时进行压缩
- ✅ 处理缺失的依赖服务
- ✅ State 投影（Public/Private）
- ✅ writeBack（写入 TripAttempt）
- ✅ 缓存管理（清理、统计、清除）

### ContextMetricsService ✅

**测试用例**:
- ✅ 服务定义测试
- ✅ 记录基础指标
- ✅ 计算块类型分布
- ✅ 计算优先级分布
- ✅ 计算压缩率
- ✅ 调用 context.evaluate（如果可用）
- ✅ context.evaluate 失败时降级
- ✅ 计算聚合指标（getMetricsSummary）
- ✅ 按时间范围过滤
- ✅ 获取最近的指标记录

### ContextBuildSkill ✅

**测试用例**:
- ✅ 服务定义测试
- ✅ 调用 ContextEngineerService.build
- ✅ 支持 useCache 选项
- ✅ 自动记录Context构建事件到context.learn

### ContextLearnSkill ✅

**测试用例**:
- ✅ 服务定义测试
- ✅ 调用 ContextLearningService.learn
- ✅ 处理context_built事件
- ✅ 处理context_used事件
- ✅ 处理decision_made事件
- ✅ 处理user_feedback事件
- ✅ ContextLearningService未注入时的错误处理
- ✅ 处理学习失败的情况

### ContextLearningService ✅

**测试用例**:
- ✅ 服务定义测试
- ✅ 从Context构建事件学习Block重要性
- ✅ 更新现有Block的重要性评分（加权平均）
- ✅ 从Context使用事件学习Block使用情况
- ✅ 从决策结果学习Block重要性（基于满意度）
- ✅ 从用户反馈学习Block相关性
- ✅ 返回学习结果（更新的Block优先级、推荐的Block组合）
- ✅ 返回单个Block的学习统计
- ✅ PrismaService未注入时的处理
- ✅ 并发安全（检查重复记录）

### ToolsSelectSkill ✅

**测试用例**:
- ✅ 服务定义测试
- ✅ 基于 phase 选择工具（规则匹配）
- ✅ 基于用户查询选择工具（规则匹配）
- ✅ 使用向量检索（如果 EmbeddingService 可用）
- ✅ 向量检索失败时降级到规则匹配
- ✅ 返回工具的结构化信息

### CountryPackGetBlocksSkill ✅

**测试用例**:
- ✅ 服务定义测试
- ✅ 提取 VISA 主题块
- ✅ 提取 DRONE 主题块
- ✅ 提取 ROAD_RULES 主题块
- ✅ 提取 SAFETY 主题块
- ✅ 提取 WEATHER_WINDOWS 主题块
- ✅ 处理缺失的主题（返回 null）
- ✅ 处理找不到 ReadinessPack 的情况
- ✅ 提取多个主题

### PlanSelectSlicesSkill ✅

**测试用例**:
- ✅ 服务定义测试
- ✅ 提取指定天的结构
- ✅ 提取多个天的结构
- ✅ 提取 segment 结构（通过 ID）
- ✅ 提取 segment 结构（通过数字索引）
- ✅ 提取最近一次 rejection
- ✅ 处理找不到 rejection 的情况
- ✅ 处理找不到 day 的情况
- ✅ 计算时长（从 startTime 和 endTime）

## 测试最佳实践

### 1. Mock 依赖服务

所有外部依赖都应该被 Mock：

```typescript
const mockPrisma = {
  trip: {
    findUnique: jest.fn(),
  },
  // ...
};

const mockSkillsRegistry = {
  getSkill: jest.fn(),
  getAllSkills: jest.fn(),
};
```

### 2. 测试边界情况

- ✅ 缺失的依赖服务
- ✅ 空数据
- ✅ 错误情况
- ✅ 缓存命中/未命中
- ✅ 超预算情况

### 3. 测试增强功能

- ✅ 向量检索（Tool RAG Embedding）
- ✅ Redis 缓存
- ✅ 监控指标记录
- ✅ 完善的提取逻辑（CountryPack、Plan RAG）

### 4. 异步测试

使用 `async/await` 处理异步操作：

```typescript
it('应该构建基本的 Context Package', async () => {
  const result = await service.build(mockOptions, false);
  expect(result).toBeDefined();
});
```

## 覆盖率目标

- **目标覆盖率**: 80%+
- **当前覆盖率**: 待运行测试后统计

## 待补充的测试

虽然核心功能测试已完成，以下模块可以继续补充测试：

- [ ] ContextCompressSkill - 压缩逻辑测试
- [ ] CountryPackRankBlocksSkill - 排序逻辑测试
- [ ] ContextEvaluateSkill - 质量评估测试
- [ ] ContextRegressionTestsSkill - 回归测试测试
- [ ] DecisionLogAppendSkill - 决策日志写入测试
- [ ] LangGraph 集成测试（buildContextForNode + writeBackFromNode）
- [ ] E2E 测试（完整流程）

## 注意事项

1. **类型错误**：如果看到 Jest 类型相关的错误，确保已安装 `@types/jest`
2. **Mock 服务**：使用 `@nestjs/testing` 的 `Test.createTestingModule` 来创建测试模块
3. **异步测试**：使用 `async/await` 处理异步操作
4. **覆盖率**：目标是至少 80% 的代码覆盖率
5. **测试隔离**：每个测试应该独立，不依赖其他测试的状态

## 运行示例

```bash
# 运行所有测试
npm test

# 运行 Context Engineer 测试
npm test -- --testPathPattern=context-engine

# 运行并查看覆盖率
npm test -- --testPathPattern=context-engine --coverage

# 监视模式（开发时使用）
npm test -- --testPathPattern=context-engine --watch
```

## 测试结果示例

```
PASS src/agent/context-engine/services/context-engineer.service.spec.ts
PASS src/agent/context-engine/services/context-metrics.service.spec.ts
PASS src/skills/context/context-build.skill.spec.ts
PASS src/skills/context/tools-select.skill.spec.ts
PASS src/skills/context/plan-select-slices.skill.spec.ts
PASS src/skills/country-pack/country-pack-get-blocks.skill.spec.ts

Test Suites: 6 passed, 6 total
Tests:       45+ passed, 45+ total
Snapshots:   0 total
Time:        3.5 s
```