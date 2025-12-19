# Decision Layer API 接口文档

## 📋 接口列表

所有接口都在 `decision` tag 下，访问地址：`http://localhost:3000/api`

### 1. 生成计划

**接口**: `POST /decision/generate-plan`

**功能**: 使用 Abu + Dr.Dre 策略生成初始旅行计划

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
    "candidatesByDate": {
      "2026-01-02": []
    },
    "signals": {
      "lastUpdatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "plan": { ... },
    "log": { ... }
  }
}
```

---

### 2. 修复计划

**接口**: `POST /decision/repair-plan`

**功能**: 使用 Neptune 策略修复计划（最小改动）

**请求体**:
```json
{
  "state": { ... },
  "plan": { ... },
  "trigger": "signal_update"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "plan": { ... },
    "log": { ... }
  }
}
```

---

### 3. 校验约束

**接口**: `POST /decision/check-constraints`

**功能**: 检查计划是否违反约束（时间窗、连通性、预算、体力、天气等）

**请求体**:
```json
{
  "state": { ... },
  "plan": { ... }
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "violations": [],
    "isValid": true,
    "summary": {
      "errorCount": 0,
      "warningCount": 0,
      "infoCount": 0
    }
  }
}
```

---

### 4. 解释计划

**接口**: `POST /decision/explain-plan`

**功能**: 生成计划的可解释性信息（用于前端展示）

**请求体**:
```json
{
  "plan": { ... },
  "log": { ... },
  "violations": []
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "explanation": {
      "summary": "...",
      "whyThisPlan": [...],
      "slots": [...]
    }
  }
}
```

---

### 5. 从日志中学习

**接口**: `POST /decision/learn-from-logs`

**功能**: 分析决策日志，生成策略调整建议

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

**响应**:
```json
{
  "success": true,
  "data": {
    "result": {
      "policyAdjustments": { ... },
      "confidence": 0.8,
      "sampleSize": 100,
      "recommendations": [...]
    }
  }
}
```

---

### 6. 评估计划

**接口**: `POST /decision/evaluate-plan`

**功能**: 计算计划的可执行率、稳定性、体验指标、成本指标等

**请求体**:
```json
{
  "state": { ... },
  "plan": { ... },
  "constraintResult": { ... },
  "diff": { ... }
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "metrics": {
      "executability": { ... },
      "stability": { ... },
      "experience": { ... },
      "cost": { ... }
    }
  }
}
```

---

### 7. 检查高级约束

**接口**: `POST /decision/check-advanced-constraints`

**功能**: 检查计划是否违反互斥组、依赖关系等高级约束

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

**响应**:
```json
{
  "success": true,
  "data": {
    "mutexViolations": [],
    "dependencyViolations": []
  }
}
```

---

### 8. 获取监控指标

**接口**: `GET /decision/monitoring/metrics`

**功能**: 获取实时性能指标、质量指标、使用统计和告警信息

**响应**:
```json
{
  "success": true,
  "data": {
    "metrics": {
      "performance": { ... },
      "quality": { ... },
      "usage": { ... }
    },
    "alerts": [...]
  }
}
```

---

### 9. 获取告警列表

**接口**: `GET /decision/monitoring/alerts`

**功能**: 获取所有告警或指定级别的告警

**请求体** (可选):
```json
{
  "level": "warning"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "alerts": [...]
  }
}
```

---

## 🧪 测试脚本

### 使用 curl 测试

```bash
# 1. 生成计划
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

# 2. 获取监控指标
curl http://localhost:3000/decision/monitoring/metrics

# 3. 获取告警
curl http://localhost:3000/decision/monitoring/alerts
```

### 使用 Postman/Insomnia

1. 导入 Swagger JSON: `http://localhost:3000/api-json`
2. 选择 `decision` tag
3. 测试各个接口

---

## 📊 Swagger UI

访问 `http://localhost:3000/api` 查看完整的 API 文档，包括：
- 所有接口的详细描述
- 请求/响应示例
- 参数说明
- 在线测试功能

