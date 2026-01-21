# RL Infrastructure TODO 清单

**创建日期**：2025-01-21  
**状态**：基础架构已完成，待完善细节

本文档汇总所有代码中的TODO项和待完善功能。

---

## 🔴 高优先级（P0 - 立即进行）

### 1. Python服务集成

#### 训练服务（Training Service）
**文件**：`src/agent/training/services/training-pipeline.service.ts`  
**状态**：TypeScript接口已完成，需要Python服务

**任务**：
- [ ] 创建Python FastAPI服务：`scripts/rl-infra/training_service.py`
- [ ] 实现Ray集群集成
- [ ] 实现MLflow Tracking集成
- [ ] 实现训练任务启动接口
- [ ] 实现训练任务监控接口

**相关TODO**：
- `model-registry.service.ts:333` - MLflow API集成
- `model-registry.service.ts:358` - MLflow API调用
- `model-registry.service.ts:366` - MLflow API调用
- `model-registry.service.ts:374` - MLflow API调用

#### PolicyService
**文件**：`src/agent/training/services/policy-service-manager.service.ts`  
**状态**：TypeScript接口已完成，需要Python服务

**任务**：
- [ ] 创建Python FastAPI服务：`scripts/rl-infra/policy_service.py`
- [ ] 实现模型加载和推理
- [ ] 实现批量推理优化
- [ ] 实现健康检查和指标接口

#### LLM Judge服务
**文件**：`src/agent/training/services/quality-scorer.service.ts`  
**状态**：TypeScript接口已完成，需要Python服务

**任务**：
- [ ] 创建Python FastAPI服务：`scripts/rl-infra/llm_judge_service.py`
- [ ] 实现Judge Prompt管理
- [ ] 实现质量评分接口

---

### 2. 数据源集成

#### 测试用例库
**文件**：`src/agent/training/services/eval-suite.service.ts`  
**TODO位置**：`eval-suite.service.ts:430`

**任务**：
- [ ] 从文件或数据库加载实际测试用例
- [ ] Router测试用例：100+用例
- [ ] Gate测试用例：100+用例
- [ ] Itinerary测试用例：100+用例

#### 轨迹数据获取
**文件**：`src/agent/training/training.controller.ts`  
**TODO位置**：
- `training.controller.ts:1437` - 从数据库获取trajectories
- `training.controller.ts:1473` - 从数据库获取trajectories

**任务**：
- [ ] 实现从数据库查询trajectories
- [ ] 实现分页和过滤

---

### 3. 约束规则库

**文件**：`src/agent/training/services/constraints-engine.service.ts`  
**TODO位置**：
- `constraints-engine.service.ts:153` - 检查危险区域、禁区
- `constraints-engine.service.ts:166` - 检查季节性风险、天气风险
- `constraints-engine.service.ts:178` - 检查签证、许可、法规要求
- `constraints-engine.service.ts:190` - 检查用户风险偏好、健康限制
- `constraints-engine.service.ts:227` - 从数据库或配置文件加载规则

**任务**：
- [ ] 实现地理约束检查（危险区域、禁区）
- [ ] 实现时间约束检查（季节性风险、天气风险）
- [ ] 实现合规约束检查（签证、许可、法规）
- [ ] 实现用户偏好约束检查
- [ ] 从数据库或配置文件加载规则库

---

## 🟡 中优先级（P1 - 1-2周内）

### 4. 诊断标签系统

**文件**：`src/agent/training/services/diagnostic-label-system.service.ts`  
**TODO位置**：
- `diagnostic-label-system.service.ts:85` - 证据缺失检测
- `diagnostic-label-system.service.ts:93` - 幻觉风险检测
- `diagnostic-label-system.service.ts:101` - 不可执行检测
- `diagnostic-label-system.service.ts:109` - 安全担忧检测
- `diagnostic-label-system.service.ts:117` - 合规问题检测

**任务**：
- [ ] 实现证据缺失检测逻辑
- [ ] 实现幻觉风险检测逻辑
- [ ] 实现不可执行检测逻辑
- [ ] 实现安全担忧检测逻辑
- [ ] 实现合规问题检测逻辑
- [ ] 收集标注数据，训练分类器（可选）

---

### 5. OPE算法完善

**文件**：`src/agent/training/services/offline-policy-evaluator.service.ts`  
**TODO位置**：
- `offline-policy-evaluator.service.ts:67` - 实际计算p_value
- `offline-policy-evaluator.service.ts:125` - 实际计算p_value
- `offline-policy-evaluator.service.ts:183` - 实际计算p_value

**任务**：
- [ ] 实现统计显著性检验（t-test）
- [ ] 实现Bootstrap置信区间
- [ ] 完善IS算法（重要性权重截断）
- [ ] 完善DR算法（Direct Method估计器）
- [ ] 完善WDR算法（加权双重稳健估计）

---

### 6. 回归门槛集成

**文件**：`src/agent/training/services/regression-gate.service.ts`  
**TODO位置**：
- `regression-gate.service.ts:63` - 集成Gate评测结果
- `regression-gate.service.ts:67` - 从Gate评测结果获取actual_value

**任务**：
- [ ] 集成Gate评测结果到回归门槛检查
- [ ] 从Gate评测结果获取误报率

---

### 7. 用户反馈分析集成

**文件**：`src/agent/training/services/user-feedback-loop.service.ts`  
**TODO位置**：
- `user-feedback-loop.service.ts:66` - 发送到分析服务
- `user-feedback-loop.service.ts:107` - 发送到分析服务

**任务**：
- [ ] 集成Analytics Service
- [ ] 实现用户反馈数据分析
- [ ] 实现反馈洞察提取

---

### 8. 风险事件告警

**文件**：`src/agent/training/services/risk-event-manager.service.ts`  
**TODO位置**：`risk-event-manager.service.ts:200`

**任务**：
- [ ] 实现告警发送（邮件、Slack、PagerDuty）
- [ ] 配置告警规则
- [ ] 实现告警去重和聚合

---

## 🟢 低优先级（P2 - 1个月内）

### 9. PII脱敏地理编码集成

**文件**：`src/agent/training/services/pii-anonymizer.service.ts`  
**TODO位置**：`pii-anonymizer.service.ts:336`

**任务**：
- [ ] 集成地理编码服务（如Google Geocoding API）
- [ ] 实现坐标到城市/国家的映射
- [ ] 优化坐标匿名化算法

---

### 10. Eval Suite结果提取

**文件**：`src/agent/training/services/eval-suite.service.ts`  
**TODO位置**：`eval-suite.service.ts:524`

**任务**：
- [ ] 从response中提取实际的plan长度
- [ ] 完善Itinerary评测指标计算

---

## 📊 统计汇总

| 优先级 | TODO数量 | 文件数 |
|--------|----------|--------|
| P0（高优先级） | 15+ | 5 |
| P1（中优先级） | 10+ | 4 |
| P2（低优先级） | 2 | 2 |
| **总计** | **27+** | **11** |

---

## 📝 注意事项

1. **Python服务**：P0任务中的Python服务需要单独创建，不在TypeScript代码库中
2. **数据源**：测试用例库、约束规则库需要从实际业务数据中提取
3. **算法完善**：OPE算法、诊断标签系统需要统计和ML专业知识
4. **集成**：需要与现有系统（Analytics Service、告警系统等）集成

---

## 🎯 建议实施顺序

1. **第一周**：Python服务集成（训练服务、PolicyService、LLM Judge）
2. **第二周**：数据源集成（测试用例库、轨迹数据获取）
3. **第三周**：约束规则库实现
4. **第四周**：诊断标签系统和OPE算法完善

---

**参考文档**：
- [下一步行动指南](./NEXT_STEPS.md)
- [实施完成总结](./IMPLEMENTATION_COMPLETE_SUMMARY.md)
- [API参考](./API_REFERENCE.md)
