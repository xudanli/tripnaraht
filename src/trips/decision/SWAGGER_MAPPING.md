# Decision Layer Swagger 接口映射

## 📋 功能到接口的映射表

### 核心功能接口

| 功能 | Swagger 接口 | 方法 | 路径 |
|------|-------------|------|------|
| **生成计划** | `POST /decision/generate-plan` | POST | `/decision/generate-plan` |
| **修复计划** | `POST /decision/repair-plan` | POST | `/decision/repair-plan` |
| **校验约束** | `POST /decision/check-constraints` | POST | `/decision/check-constraints` |

### 增强功能接口

| 功能 | Swagger 接口 | 方法 | 路径 |
|------|-------------|------|------|
| **解释计划** | `POST /decision/explain-plan` | POST | `/decision/explain-plan` |
| **从日志学习** | `POST /decision/learn-from-logs` | POST | `/decision/learn-from-logs` |
| **评估计划** | `POST /decision/evaluate-plan` | POST | `/decision/evaluate-plan` |
| **高级约束** | `POST /decision/check-advanced-constraints` | POST | `/decision/check-advanced-constraints` |
| **监控指标** | `GET /decision/monitoring/metrics` | GET | `/decision/monitoring/metrics` |
| **告警列表** | `GET /decision/monitoring/alerts` | GET | `/decision/monitoring/alerts` |

---

## 🎯 详细映射

### 1. 生成计划 (Abu + Dr.Dre)

**功能**: 使用 Abu + Dr.Dre 策略生成初始旅行计划

**接口**: `POST /decision/generate-plan`

**Tag**: `decision`

**对应服务**: `TripDecisionEngineService.generatePlan()`

---

### 2. 修复计划 (Neptune)

**功能**: 使用 Neptune 策略修复计划（最小改动）

**接口**: `POST /decision/repair-plan`

**Tag**: `decision`

**对应服务**: `TripDecisionEngineService.repairPlan()`

---

### 3. 约束校验器

**功能**: 检查计划是否违反约束（时间窗、连通性、预算、体力、天气等）

**接口**: `POST /decision/check-constraints`

**Tag**: `decision`

**对应服务**: `ConstraintChecker.checkPlan()`

---

### 4. 可解释性（人机协同）

**功能**: 生成计划的可解释性信息（用于前端展示）

**接口**: `POST /decision/explain-plan`

**Tag**: `decision`

**对应服务**: `ExplainabilityService.explainPlan()`

---

### 5. 学习机制

**功能**: 分析决策日志，生成策略调整建议

**接口**: `POST /decision/learn-from-logs`

**Tag**: `decision`

**对应服务**: `LearningService.learnFromLogs()`

---

### 6. 评估框架

**功能**: 计算计划的可执行率、稳定性、体验指标、成本指标等

**接口**: `POST /decision/evaluate-plan`

**Tag**: `decision`

**对应服务**: `EvaluationService.evaluatePlan()`

---

### 7. 高级约束

**功能**: 检查计划是否违反互斥组、依赖关系等高级约束

**接口**: `POST /decision/check-advanced-constraints`

**Tag**: `decision`

**对应服务**: `AdvancedConstraintsService.checkMutexGroups()`, `checkDependencies()`

---

### 8. 监控指标

**功能**: 获取实时性能指标、质量指标、使用统计和告警信息

**接口**: `GET /decision/monitoring/metrics`

**Tag**: `decision`

**对应服务**: `MonitoringService.getMetrics()`, `getAlerts()`

---

### 9. 告警列表

**功能**: 获取所有告警或指定级别的告警

**接口**: `GET /decision/monitoring/alerts`

**Tag**: `decision`

**对应服务**: `MonitoringService.getAlerts()`

---

## 🔍 在 Swagger UI 中查找

1. 访问 `http://localhost:3000/api`
2. 在 Tags 列表中找到 `decision`
3. 展开 `decision` tag，可以看到所有 9 个接口
4. 点击接口名称查看详细信息：
   - 请求参数
   - 响应格式
   - 示例数据
   - 在线测试

---

## 📝 快速测试

### 使用 Swagger UI 测试

1. 打开 `http://localhost:3000/api`
2. 找到 `decision` tag
3. 点击 `POST /decision/generate-plan` 展开
4. 点击 "Try it out"
5. 修改请求体（使用示例数据）
6. 点击 "Execute"
7. 查看响应结果

### 使用 curl 测试

```bash
# 生成计划
curl -X POST http://localhost:3000/decision/generate-plan \
  -H "Content-Type: application/json" \
  -d @test-request.json

# 获取监控指标
curl http://localhost:3000/decision/monitoring/metrics
```

---

## 📚 相关文档

- **API 接口文档**: `API_ENDPOINTS.md`
- **README**: `README.md`
- **实现总结**: `IMPLEMENTATION_SUMMARY.md`

