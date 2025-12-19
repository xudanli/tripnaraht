# Decision Layer 功能到 Swagger 接口完整映射

## 📋 快速查找表

| 功能模块 | Swagger 接口 | HTTP 方法 | 完整路径 | Tag |
|---------|-------------|----------|---------|-----|
| **生成计划** | `generate-plan` | POST | `/decision/generate-plan` | `decision` |
| **修复计划** | `repair-plan` | POST | `/decision/repair-plan` | `decision` |
| **校验约束** | `check-constraints` | POST | `/decision/check-constraints` | `decision` |
| **解释计划** | `explain-plan` | POST | `/decision/explain-plan` | `decision` |
| **学习机制** | `learn-from-logs` | POST | `/decision/learn-from-logs` | `decision` |
| **评估计划** | `evaluate-plan` | POST | `/decision/evaluate-plan` | `decision` |
| **高级约束** | `check-advanced-constraints` | POST | `/decision/check-advanced-constraints` | `decision` |
| **监控指标** | `monitoring/metrics` | GET | `/decision/monitoring/metrics` | `decision` |
| **告警列表** | `monitoring/alerts` | GET | `/decision/monitoring/alerts` | `decision` |

---

## 🎯 详细映射

### 1. 核心策略接口

#### 1.1 生成计划 (Abu + Dr.Dre)

**功能**: 使用 Abu + Dr.Dre 策略生成初始旅行计划

**Swagger 接口**: `POST /decision/generate-plan`

**对应服务**: `TripDecisionEngineService.generatePlan()`

**请求体**:
```json
{
  "state": {
    "context": {
      "destination": "IS",
      "startDate": "2026-01-02",
      "durationDays": 7,
      "preferences": {
        "intents": { "nature": 0.8, "culture": 0.4 },
        "pace": "moderate",
        "riskTolerance": "medium"
      },
      "budget": {
        "amount": 50000,
        "currency": "CNY"
      }
    },
    "candidatesByDate": {},
    "signals": {
      "lastUpdatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

**响应**: `{ plan: TripPlan, log: DecisionRunLog }`

---

#### 1.2 修复计划 (Neptune)

**功能**: 使用 Neptune 策略修复计划（最小改动）

**Swagger 接口**: `POST /decision/repair-plan`

**对应服务**: `TripDecisionEngineService.repairPlan()`

**请求体**:
```json
{
  "state": { ... },
  "plan": { ... },
  "trigger": "signal_update"
}
```

**响应**: `{ plan: TripPlan, log: DecisionRunLog }`

---

#### 1.3 校验约束

**功能**: 检查计划是否违反约束（时间窗、连通性、预算、体力、天气等）

**Swagger 接口**: `POST /decision/check-constraints`

**对应服务**: `ConstraintChecker.checkPlan()`

**请求体**:
```json
{
  "state": { ... },
  "plan": { ... }
}
```

**响应**: `{ violations: [], isValid: boolean, summary: {...} }`

---

### 2. 增强功能接口

#### 2.1 解释计划（可解释性）

**功能**: 生成计划的可解释性信息（用于前端展示）

**Swagger 接口**: `POST /decision/explain-plan`

**对应服务**: `ExplainabilityService.explainPlan()`

**请求体**:
```json
{
  "plan": { ... },
  "log": { ... },
  "violations": []
}
```

**响应**: `{ explanation: PlanExplanation }`

---

#### 2.2 从日志中学习

**功能**: 分析决策日志，生成策略调整建议

**Swagger 接口**: `POST /decision/learn-from-logs`

**对应服务**: `LearningService.learnFromLogs()`

**请求体**:
```json
{
  "logs": [...],
  "userFeedback": [
    {
      "logId": "run-123",
      "accepted": true,
      "satisfaction": 0.9
    }
  ]
}
```

**响应**: `{ result: LearningResult }`

---

#### 2.3 评估计划

**功能**: 计算计划的可执行率、稳定性、体验指标、成本指标等

**Swagger 接口**: `POST /decision/evaluate-plan`

**对应服务**: `EvaluationService.evaluatePlan()`

**请求体**:
```json
{
  "state": { ... },
  "plan": { ... },
  "constraintResult": { ... },
  "diff": { ... }
}
```

**响应**: `{ metrics: PlanMetrics }`

---

#### 2.4 检查高级约束

**功能**: 检查计划是否违反互斥组、依赖关系等高级约束

**Swagger 接口**: `POST /decision/check-advanced-constraints`

**对应服务**: `AdvancedConstraintsService.checkMutexGroups()`, `checkDependencies()`

**请求体**:
```json
{
  "plan": { ... },
  "constraints": {
    "mutexGroups": [
      {
        "groupId": "waterfalls",
        "maxSelect": 1
      }
    ],
    "dependencies": [
      {
        "from": "poi1",
        "to": "poi2",
        "type": "before"
      }
    ]
  }
}
```

**响应**: `{ mutexViolations: [], dependencyViolations: [] }`

---

#### 2.5 获取监控指标

**功能**: 获取实时性能指标、质量指标、使用统计和告警信息

**Swagger 接口**: `GET /decision/monitoring/metrics`

**对应服务**: `MonitoringService.getMetrics()`, `getAlerts()`

**响应**: `{ metrics: MonitoringMetrics, alerts: Alert[] }`

---

#### 2.6 获取告警列表

**功能**: 获取所有告警或指定级别的告警

**Swagger 接口**: `GET /decision/monitoring/alerts`

**对应服务**: `MonitoringService.getAlerts()`

**请求体** (可选):
```json
{
  "level": "warning"
}
```

**响应**: `{ alerts: Alert[] }`

---

## 🔍 在 Swagger UI 中查找

### 步骤

1. **启动服务器**
   ```bash
   npm run start:dev
   ```

2. **访问 Swagger UI**
   ```
   http://localhost:3000/api
   ```

3. **查找接口**
   - 在页面顶部的 **Tags** 列表中找到 `decision`
   - 点击 `decision` tag 展开
   - 可以看到所有 9 个接口

4. **查看接口详情**
   - 点击接口名称展开详情
   - 查看：
     - **描述**: 接口功能说明
     - **请求参数**: 请求体结构
     - **响应**: 响应格式
     - **示例**: 示例数据

5. **在线测试**
   - 点击 "Try it out"
   - 修改请求体
   - 点击 "Execute"
   - 查看响应结果

---

## 📊 功能分类

### 核心决策功能
- ✅ `POST /decision/generate-plan` - 生成计划
- ✅ `POST /decision/repair-plan` - 修复计划
- ✅ `POST /decision/check-constraints` - 校验约束

### 可解释性和学习
- ✅ `POST /decision/explain-plan` - 解释计划
- ✅ `POST /decision/learn-from-logs` - 从日志学习

### 评估和优化
- ✅ `POST /decision/evaluate-plan` - 评估计划
- ✅ `POST /decision/check-advanced-constraints` - 高级约束

### 监控和运维
- ✅ `GET /decision/monitoring/metrics` - 监控指标
- ✅ `GET /decision/monitoring/alerts` - 告警列表

---

## 🧪 快速测试

### 使用 Swagger UI

1. 访问 `http://localhost:3000/api`
2. 找到 `decision` tag
3. 选择 `POST /decision/generate-plan`
4. 点击 "Try it out"
5. 使用示例数据或自定义
6. 点击 "Execute"

### 使用 curl

```bash
# 生成计划
curl -X POST http://localhost:3000/decision/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "context": {
        "destination": "IS",
        "startDate": "2026-01-02",
        "durationDays": 1,
        "preferences": {
          "intents": { "nature": 0.8 },
          "pace": "moderate",
          "riskTolerance": "medium"
        }
      },
      "candidatesByDate": {},
      "signals": {
        "lastUpdatedAt": "2026-01-01T00:00:00.000Z"
      }
    }
  }'

# 获取监控指标
curl http://localhost:3000/decision/monitoring/metrics
```

### 使用测试脚本

```bash
./src/trips/decision/scripts/test-decision-api.sh
```

---

## ✅ 验证清单

- [x] 所有接口都在 `decision` tag 下
- [x] 所有接口都有 Swagger 文档
- [x] 请求/响应格式正确
- [x] 示例数据可用
- [x] 编译通过，无错误
- [x] 模块正确注册

---

## 📚 相关文档

- **API 接口文档**: `API_ENDPOINTS.md`
- **测试指南**: `TESTING_GUIDE.md`
- **README**: `README.md`
- **实现总结**: `IMPLEMENTATION_SUMMARY.md`

