# TripNARA 融合实施路线图

## 概述

本文档提供 TripNARA 融合 LangGraph、MoBagel 和图数据库的详细实施路线图。

## Phase 1: 图数据库思想（立即实施）

### 目标
- 重构 Data Object，按图结构设计
- 定义节点和关系的 Schema
- 为未来迁移到 Neo4j 做准备

### 任务清单

#### 1.1 定义图数据结构
- [x] 创建 `graph-db.interface.ts`（已完成）
- [ ] 定义所有节点类型（Place, RouteDirection, RouteSegment 等）
- [ ] 定义所有关系类型（CONNECTS_TO, BELONGS_TO 等）
- [ ] 定义节点属性接口

#### 1.2 重构现有数据模型
- [ ] 在 `RouteSegment` 中添加图关系字段
- [ ] 在 `Place` 模型中添加图节点属性
- [ ] 在 `RouteDirection` 中添加图关系映射

#### 1.3 创建数据转换器
- [ ] 创建 `GraphDataConverter` 服务
- [ ] 实现从现有数据模型到图数据模型的转换
- [ ] 实现从图数据模型到现有数据模型的转换

### 验收标准
- [ ] 所有核心数据模型都支持图结构表示
- [ ] 可以生成 Cypher 查询（即使不执行）
- [ ] 数据结构文档完整

## Phase 2: LangGraph 外层编排（E2E 稳定后）

### 目标
- 封装 TripNARA Core 为 Tool
- 创建 Planner Agent
- 创建 Narrator Agent
- 用 LangGraph 编排这些 Agent

### 任务清单

#### 2.1 安装依赖
```bash
npm install @langchain/langgraph @langchain/core
```

#### 2.2 完善 TripNARA Core Tool
- [x] 创建 `tripnara-core-tool.interface.ts`（已完成）
- [x] 创建 `tripnara-core-tool.service.ts`（已完成，需要完善实现）
- [ ] 实现 `buildWorldModelContext` 方法
- [ ] 实现 `buildInitialPlan` 方法
- [ ] 添加错误处理和重试逻辑
- [ ] 添加单元测试

#### 2.3 创建 Planner Agent
- [ ] 创建 `planner-agent.service.ts`
- [ ] 实现意图识别逻辑
- [ ] 实现参数提取逻辑
- [ ] 集成 LLM（OpenAI / Anthropic）
- [ ] 添加单元测试

#### 2.4 创建 Narrator Agent
- [ ] 创建 `narrator-agent.service.ts`
- [ ] 实现结果润色逻辑
- [ ] 实现故事层文案生成
- [ ] 集成 LLM
- [ ] 添加单元测试

#### 2.5 创建 LangGraph 编排器
- [x] 创建 `langgraph-orchestrator.interface.ts`（已完成）
- [ ] 创建 `langgraph-orchestrator.service.ts`
- [ ] 定义编排图结构
- [ ] 实现状态管理
- [ ] 实现分支控制
- [ ] 实现失败重试
- [ ] 添加单元测试

#### 2.6 集成到主流程
- [ ] 在 `TripDecisionEngineService` 中集成 LangGraph 编排器
- [ ] 添加配置开关（允许回退到直接调用）
- [ ] 添加监控和日志

### 验收标准
- [ ] 可以通过 LangGraph 调用 TripNARA Core Tool
- [ ] Planner Agent 可以正确提取参数
- [ ] Narrator Agent 可以生成可读解释
- [ ] 编排流程可以处理错误和重试
- [ ] 单元测试覆盖率 > 80%

## Phase 3: 预测模型层（有真实数据后）

### 目标
- 定义预测模型接口
- 接入 MoBagel 或自建模型
- 将预测结果注入 PhysicalRealityModel / ObjectiveWeights

### 任务清单

#### 3.1 完善预测模型接口
- [x] 创建 `mobagel-forecast.interface.ts`（已完成）
- [x] 创建 `mobagel-forecast.service.ts`（已完成，占位实现）
- [ ] 定义预测结果到 PhysicalRealityModel 的注入接口
- [ ] 定义预测结果到 ObjectiveWeights 的注入接口

#### 3.2 数据准备
- [ ] 收集历史订单数据
- [ ] 收集价格数据（OTA API 或爬虫）
- [ ] 收集用户行为数据
- [ ] 数据清洗和预处理

#### 3.3 模型训练/接入
- [ ] 选择预测模型平台（MoBagel / 自建）
- [ ] 训练价格预测模型
- [ ] 训练拥挤度预测模型
- [ ] 训练风险预测模型
- [ ] 模型评估和调优

#### 3.4 集成到决策流程
- [ ] 在 `PhysicalRealityModel` 中添加预测标签字段
- [ ] 在 `ObjectiveWeights` 中添加预测权重字段
- [ ] 修改 `AbuStrategy` 读取预测标签
- [ ] 修改 `DrDreStrategy` 读取预测权重
- [ ] 添加预测结果缓存

### 验收标准
- [ ] 预测模型可以输出合理的预测结果
- [ ] 预测结果可以正确注入到 PhysicalRealityModel
- [ ] 决策流程可以基于预测结果做决策
- [ ] 预测准确率 > 70%（根据具体模型类型）

## Phase 4: 其他增强（可选）

### 4.1 DSPy 集成（Prompt 优化）

#### 任务清单
- [ ] 安装 DSPy
- [ ] 定义 Abu / Dr.Dre / Neptune 的 Prompt 优化目标
- [ ] 创建 DSPy 模块
- [ ] 运行优化流程
- [ ] 评估优化效果

### 4.2 LangSmith / Arize Phoenix 集成（评估与监控）

#### 任务清单
- [ ] 选择监控平台（LangSmith / Arize Phoenix）
- [ ] 配置追踪
- [ ] 创建监控仪表板
- [ ] 设置告警规则

### 4.3 图数据库迁移（Neo4j）

#### 任务清单
- [ ] 安装 Neo4j
- [ ] 创建数据库 Schema
- [ ] 实现 `GraphDatabaseService`
- [ ] 数据迁移脚本
- [ ] 性能测试和优化

## 时间估算

| Phase | 预计时间 | 优先级 |
|-------|---------|--------|
| Phase 1: 图数据库思想 | 1-2 周 | P0（立即） |
| Phase 2: LangGraph 编排 | 3-4 周 | P1（E2E 稳定后） |
| Phase 3: 预测模型层 | 4-6 周 | P2（有真实数据后） |
| Phase 4: 其他增强 | 2-3 周 | P3（可选） |

## 风险与缓解

### 风险 1: LangGraph 学习曲线
- **风险**: 团队不熟悉 LangGraph
- **缓解**: 提供培训、创建示例代码、分阶段实施

### 风险 2: 预测模型数据不足
- **风险**: 没有足够的历史数据训练模型
- **缓解**: 先用规则和经验值，逐步积累数据

### 风险 3: 性能问题
- **风险**: 图数据库查询性能不达标
- **缓解**: 先做性能测试，必要时优化查询或使用缓存

## 成功指标

### Phase 1 成功指标
- [ ] 所有核心数据模型支持图结构
- [ ] 数据结构文档完整

### Phase 2 成功指标
- [ ] LangGraph 编排流程稳定运行
- [ ] 单元测试覆盖率 > 80%
- [ ] 错误率 < 5%

### Phase 3 成功指标
- [ ] 预测准确率 > 70%
- [ ] 预测结果正确注入到决策流程
- [ ] 决策质量提升（通过 A/B 测试验证）

## 下一步行动

1. **立即开始 Phase 1**：重构数据模型，按图结构设计
2. **准备 Phase 2**：在 E2E 稳定后，开始 LangGraph 集成
3. **收集数据**：为 Phase 3 做准备，开始收集历史数据

