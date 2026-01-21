# RL Infrastructure 下一步行动指南

**创建日期**：2025-01-21  
**状态**：基础架构已完成，准备进入完善阶段

---

## 🎯 总体目标

RL Infrastructure的基础架构（30+服务，40+ API端点）已完成。下一步的重点是：

1. **集成Python服务**：实现训练服务、PolicyService、LLM Judge
2. **扩展数据源**：测试用例库、约束规则库、知识库
3. **系统集成**：集成到Orchestrator、GatekeeperAgent、观测系统
4. **完善算法**：优化OPE、A/B测试、诊断标签等算法

---

## 📋 优先级P0（立即进行）

### 1. Python服务集成

#### 训练服务（Training Service）
**负责人**：RL/ML Platform Engineer  
**预计时间**：2-3周

**任务**：
- [ ] 创建Python FastAPI服务：`scripts/rl-infra/training_service.py`
- [ ] 实现Ray集群集成（本地开发 + K8s生产）
- [ ] 实现MLflow Tracking集成
- [ ] 实现分布式训练启动接口
- [ ] 实现训练任务监控接口
- [ ] 实现超参数调优接口

**验收标准**：
- ✅ 能够通过HTTP API启动训练任务
- ✅ 训练指标自动记录到MLflow
- ✅ 支持多GPU分布式训练
- ✅ 训练任务状态可查询

**参考文档**：
- `src/agent/training/services/training-pipeline.service.ts` - TypeScript接口定义
- `.claude/roles/rl-infra/rl-ml-platform-engineer.md` - 角色文档

#### PolicyService
**负责人**：RL/ML Platform Engineer  
**预计时间**：2-3周

**任务**：
- [ ] 创建Python FastAPI服务：`scripts/rl-infra/policy_service.py`
- [ ] 实现模型加载和推理接口
- [ ] 实现批量推理接口（优化QPS）
- [ ] 实现健康检查和指标接口
- [ ] 实现模型热更新机制
- [ ] 实现降级策略（fallback到baseline）

**验收标准**：
- ✅ QPS > 1000，P95延迟 < 100ms
- ✅ 支持模型热更新（无需重启）
- ✅ 健康检查接口正常
- ✅ 降级策略生效

**参考文档**：
- `src/agent/training/services/policy-service-manager.service.ts` - TypeScript接口定义
- `.claude/roles/rl-infra/rl-ml-platform-engineer.md` - PolicyService章节

#### LLM Judge服务
**负责人**：LLM Judge / RM Engineer  
**预计时间**：1-2周

**任务**：
- [ ] 创建Python FastAPI服务：`scripts/rl-infra/llm_judge_service.py`
- [ ] 实现Judge Prompt模板管理
- [ ] 实现质量评分接口
- [ ] 实现批量评分接口
- [ ] 实现校准集管理

**验收标准**：
- ✅ 能够对计划进行质量评分（0-10分）
- ✅ 评分结果与人工评估相关性 > 0.7
- ✅ 支持批量评分（100+计划/秒）

**参考文档**：
- `src/agent/training/services/quality-scorer.service.ts` - TypeScript接口定义
- `.claude/roles/rl-infra/llm-judge-rm-engineer.md` - 角色文档

---

### 2. 扩展测试用例库

**负责人**：Evaluation Engineer  
**预计时间**：2-3周

**任务**：
- [ ] Router测试用例：100+用例
  - [ ] 不同国家/地区
  - [ ] 不同季节
  - [ ] 不同用户意图（单目的地、多目的地、环线等）
- [ ] Gate测试用例：100+用例
  - [ ] 高风险目的地
  - [ ] 信息缺失场景
  - [ ] 预算/时间约束场景
- [ ] Itinerary测试用例：100+用例
  - [ ] 不同天数（1-30天）
  - [ ] 不同活动类型（户外、文化、休闲等）
  - [ ] 不同难度等级

**验收标准**：
- ✅ 每个组件至少100+测试用例
- ✅ 测试用例覆盖主要场景
- ✅ 测试用例有明确的期望结果

**参考文档**：
- `src/agent/training/services/eval-suite.service.ts` - Eval Suite服务
- `.claude/roles/rl-infra/evaluation-engineer.md` - 角色文档

---

### 3. 系统集成

#### Orchestrator集成
**负责人**：Backend/Infra Engineer  
**预计时间**：1-2周

**任务**：
- [ ] 在`claude-orchestrator.service.ts`中集成PolicyService
- [ ] 在GATE_EVAL阶段调用Policy决策
- [ ] 在PLAN_GEN阶段调用Policy决策
- [ ] 在VERIFY阶段调用Policy决策
- [ ] 支持A/B测试（experiment_id传递）

**验收标准**：
- ✅ Policy决策能够影响Orchestrator行为
- ✅ A/B测试分配正常工作
- ✅ 降级策略生效（PolicyService失败时使用baseline）

**参考文档**：
- `src/agent/training/services/policy-orchestrator-integration.service.ts` - 集成服务
- `src/agent/services/claude-orchestrator.service.ts` - Orchestrator服务

#### GatekeeperAgent集成
**负责人**：Safety/Compliance Lead  
**预计时间**：1周

**任务**：
- [ ] 在`gatekeeper-agent.service.ts`中集成Constraints Engine
- [ ] 在规划生成后调用约束检查
- [ ] 根据约束检查结果决定是否阻止或警告
- [ ] 记录风险事件到RiskEventManager

**验收标准**：
- ✅ 硬约束能够阻止高风险规划
- ✅ 软约束能够生成警告
- ✅ 风险事件正确分级和记录

**参考文档**：
- `src/agent/training/services/constraints-engine.service.ts` - Constraints Engine
- `src/agent/services/sub-agents/gatekeeper-agent.service.ts` - GatekeeperAgent

---

## 📋 优先级P1（1-2周内）

### 1. 扩展约束规则库

**负责人**：Safety/Compliance Lead + Domain Expert Network  
**预计时间**：2-3周

**任务**：
- [ ] 地理约束规则：50+规则
  - [ ] 高风险目的地列表
  - [ ] 季节性风险规则
  - [ ] 天气相关约束
- [ ] 时间约束规则：20+规则
  - [ ] 季节性限制
  - [ ] 节假日限制
- [ ] 合规约束规则：30+规则
  - [ ] GDPR相关规则
  - [ ] 地区特定法规
- [ ] 用户偏好约束：动态规则

**验收标准**：
- ✅ 规则库覆盖主要风险场景
- ✅ 规则可配置、可更新
- ✅ 规则执行效率高（< 10ms）

**参考文档**：
- `src/agent/training/services/constraints-engine.service.ts` - Constraints Engine
- `.claude/roles/rl-infra/safety-compliance-lead.md` - 角色文档

---

### 2. 扩展知识库

**负责人**：Domain Expert Network + UX Writer  
**预计时间**：2-3周

**任务**：
- [ ] 红线规则：50+规则
  - [ ] 高风险路线规则
  - [ ] 危险活动规则
- [ ] 季节性风险：30+规则
  - [ ] 不同目的地的季节性风险
  - [ ] 月份/季节映射
- [ ] 反例库：100+反例
  - [ ] 典型事故模式
  - [ ] 不可执行规划示例
- [ ] 追问话术模板：50+模板
  - [ ] 不同场景的追问话术
  - [ ] 多语言支持
- [ ] 风险提示模板：30+模板
  - [ ] 不同SEV级别的提示
  - [ ] 多语言支持

**验收标准**：
- ✅ 知识库覆盖主要场景
- ✅ 模板质量高（用户友好）
- ✅ 支持多语言

**参考文档**：
- `src/agent/training/services/domain-expert-knowledge.service.ts` - 知识库服务
- `src/agent/training/services/clarification-prompt-designer.service.ts` - 追问话术服务
- `src/agent/training/services/risk-prompt-designer.service.ts` - 风险提示服务

---

### 3. 集成观测系统

**负责人**：Backend/Infra Engineer + SRE  
**预计时间**：2-3周

**任务**：
- [ ] 集成OpenTelemetry
  - [ ] 配置Trace导出
  - [ ] 添加Span到关键操作
  - [ ] 配置Trace采样
- [ ] 集成Prometheus
  - [ ] 暴露Metrics端点
  - [ ] 配置Grafana Dashboard
  - [ ] 设置告警规则
- [ ] 结构化日志
  - [ ] 统一日志格式
  - [ ] 日志聚合（ELK/Loki）
  - [ ] 日志查询和告警

**验收标准**：
- ✅ Trace能够追踪完整请求链路
- ✅ Metrics能够监控关键指标
- ✅ 日志能够快速定位问题

**参考文档**：
- `src/agent/training/services/observability.service.ts` - 观测服务
- `.claude/roles/rl-infra/backend-infra-engineer.md` - 角色文档

---

## 📋 优先级P2（1个月内）

### 1. 完善OPE算法

**负责人**：Evaluation Engineer  
**预计时间**：2-3周

**任务**：
- [ ] 完善IS算法实现
  - [ ] 处理重要性权重截断
  - [ ] 计算置信区间
- [ ] 完善DR算法实现
  - [ ] 实现Direct Method估计器
  - [ ] 计算双重稳健估计
- [ ] 完善WDR算法实现
  - [ ] 实现加权双重稳健估计
  - [ ] 优化权重计算
- [ ] 统计显著性检验
  - [ ] t-test
  - [ ] Bootstrap置信区间

**验收标准**：
- ✅ OPE估计与在线A/B测试相关性 > 0.8
- ✅ 置信区间计算正确
- ✅ 统计显著性检验准确

**参考文档**：
- `src/agent/training/services/offline-policy-evaluator.service.ts` - OPE服务
- `.claude/roles/rl-infra/evaluation-engineer.md` - OPE章节

---

### 2. 前端集成

**负责人**：Frontend Engineer + PM  
**预计时间**：3-4周

**任务**：
- [ ] 用户反馈追踪UI
  - [ ] 反馈表单
  - [ ] 反馈历史查看
- [ ] A/B测试管理界面
  - [ ] 实验创建和配置
  - [ ] 实验结果可视化
  - [ ] 实验分析报告
- [ ] 可解释输出可视化
  - [ ] 决策树可视化
  - [ ] 证据链展示
  - [ ] 决策时间线

**验收标准**：
- ✅ 用户能够方便地提供反馈
- ✅ PM能够管理A/B实验
- ✅ 用户能够理解AI决策过程

**参考文档**：
- `src/agent/training/services/user-feedback-loop.service.ts` - 用户反馈服务
- `src/agent/training/services/ab-test-manager.service.ts` - A/B测试服务
- `src/agent/training/services/explainable-output.service.ts` - 可解释输出服务

---

### 3. 完善诊断标签系统

**负责人**：LLM Judge / RM Engineer  
**预计时间**：2-3周

**任务**：
- [ ] 完善检测逻辑
  - [ ] 证据缺失检测
  - [ ] 幻觉风险检测
  - [ ] 不可执行检测
  - [ ] 安全担忧检测
  - [ ] 合规问题检测
- [ ] 优化检测准确率
  - [ ] 收集标注数据
  - [ ] 训练分类器（可选）
- [ ] 集成到质量评分

**验收标准**：
- ✅ 诊断标签准确率 > 0.8
- ✅ 诊断标签能够影响质量评分
- ✅ 诊断标签能够指导改进

**参考文档**：
- `src/agent/training/services/diagnostic-label-system.service.ts` - 诊断标签服务
- `.claude/roles/rl-infra/llm-judge-rm-engineer.md` - 角色文档

---

## 📊 进度跟踪

### 当前状态（2025-01-21）

| 优先级 | 任务 | 状态 | 负责人 | 预计完成时间 |
|--------|------|------|--------|--------------|
| P0 | Python训练服务 | ⚠️ 待开始 | RL/ML Platform Engineer | 2025-02-11 |
| P0 | Python PolicyService | ⚠️ 待开始 | RL/ML Platform Engineer | 2025-02-11 |
| P0 | LLM Judge服务 | ⚠️ 待开始 | LLM Judge Engineer | 2025-02-04 |
| P0 | 扩展测试用例库 | ⚠️ 待开始 | Evaluation Engineer | 2025-02-11 |
| P0 | Orchestrator集成 | ⚠️ 待开始 | Backend/Infra Engineer | 2025-02-04 |
| P0 | GatekeeperAgent集成 | ⚠️ 待开始 | Safety/Compliance Lead | 2025-01-28 |
| P1 | 扩展约束规则库 | ⚠️ 待开始 | Safety/Compliance Lead | 2025-02-11 |
| P1 | 扩展知识库 | ⚠️ 待开始 | Domain Expert + UX Writer | 2025-02-11 |
| P1 | 集成观测系统 | ⚠️ 待开始 | Backend/Infra Engineer + SRE | 2025-02-11 |
| P2 | 完善OPE算法 | ⚠️ 待开始 | Evaluation Engineer | 2025-02-25 |
| P2 | 前端集成 | ⚠️ 待开始 | Frontend Engineer + PM | 2025-02-25 |
| P2 | 完善诊断标签系统 | ⚠️ 待开始 | LLM Judge Engineer | 2025-02-11 |

---

## 🎯 里程碑

### 里程碑1：Python服务就绪（2025-02-11）
- ✅ 训练服务可用
- ✅ PolicyService可用
- ✅ LLM Judge服务可用

### 里程碑2：数据源扩展完成（2025-02-11）
- ✅ 测试用例库 > 300用例
- ✅ 约束规则库 > 100规则
- ✅ 知识库基本完善

### 里程碑3：系统集成完成（2025-02-11）
- ✅ Orchestrator集成完成
- ✅ GatekeeperAgent集成完成
- ✅ 观测系统集成完成

### 里程碑4：算法完善完成（2025-02-25）
- ✅ OPE算法完善
- ✅ 诊断标签系统完善
- ✅ A/B测试算法优化

### 里程碑5：前端集成完成（2025-02-25）
- ✅ 用户反馈UI完成
- ✅ A/B测试管理界面完成
- ✅ 可解释输出可视化完成

---

## 📝 注意事项

1. **并行工作**：Python服务开发、测试用例扩展、系统集成可以并行进行
2. **迭代开发**：先实现MVP，再逐步完善
3. **测试驱动**：每个功能都要有测试用例
4. **文档更新**：及时更新API文档和角色文档

---

**参考文档**：
- [实施完成总结](./IMPLEMENTATION_COMPLETE_SUMMARY.md)
- [API参考](./API_REFERENCE.md)
- [实施计划](./IMPLEMENTATION_PLAN.md)
- [快速开始指南](./QUICK_START.md)
