# PolicyService API 规范

**版本**: 1.0.0  
**说明**: PolicyService 是一个独立的 HTTP 服务，可以通过任何语言实现，只要遵循本 API 规范。

---

## 📋 概述

PolicyService 是一个**语言无关**的服务，通过标准的 HTTP REST API 与 TypeScript 后端通信。

### 当前实现
- **语言**: Python (FastAPI)
- **位置**: `scripts/rl-infra/policy_service.py`
- **端口**: 8002 (可通过 `POLICY_SERVICE_URL` 环境变量配置)

### 可用实现方式
✅ **Python** (FastAPI/Flask) - 当前实现  
✅ **TypeScript/Node.js** (Express/NestJS)  
✅ **Go** (Gin/Echo)  
✅ **Rust** (Actix-web/Axum)  
✅ **Java** (Spring Boot)  
✅ **其他任何支持 HTTP 的语言**

---

## 🔌 API 接口规范

### 基础信息
- **Base URL**: `http://localhost:8002` (可配置)
- **Content-Type**: `application/json`
- **超时**: 建议 3-5 秒

---

## 📡 接口列表

### 1. POST /predict - 策略推理

**功能**: 根据状态进行策略推理，返回动作（ALLOW/REJECT/ADJUST/CLARIFY）

**请求**:
```json
{
  "request_id": "req_123456",
  "state": {
    "user_request": "Plan a trip to Iceland",
    "origin": "Beijing",
    "destination": "Reykjavik",
    "constraints": {
      "budget": 50000,
      "duration": 7
    },
    "preferences": {},
    "research_data": {}
  },
  "model_version": "v1.0.0",
  "experiment_id": "exp_001"
}
```

**响应**:
```json
{
  "request_id": "req_123456",
  "action": "ALLOW",
  "confidence": 0.95,
  "reasoning": "Request is valid and safe",
  "model_version": "v1.0.0",
  "latency_ms": 45.2,
  "timestamp": "2026-01-21T12:00:00Z"
}
```

**字段说明**:
- `action`: `"ALLOW" | "REJECT" | "ADJUST" | "CLARIFY"`
- `confidence`: 0-1 之间的浮点数
- `reasoning`: 可选的推理说明
- `latency_ms`: 推理耗时（毫秒）

---

### 2. POST /batch-predict - 批量推理

**功能**: 批量进行策略推理

**请求**:
```json
{
  "requests": [
    {
      "request_id": "req_1",
      "state": {...},
      "model_version": "v1.0.0"
    },
    {
      "request_id": "req_2",
      "state": {...},
      "model_version": "v1.0.0"
    }
  ]
}
```

**响应**:
```json
{
  "responses": [
    {
      "request_id": "req_1",
      "action": "ALLOW",
      "confidence": 0.95,
      "model_version": "v1.0.0",
      "latency_ms": 45.2,
      "timestamp": "2026-01-21T12:00:00Z"
    },
    {
      "request_id": "req_2",
      "action": "REJECT",
      "confidence": 0.88,
      "model_version": "v1.0.0",
      "latency_ms": 42.1,
      "timestamp": "2026-01-21T12:00:01Z"
    }
  ],
  "total_latency_ms": 87.3
}
```

---

### 3. GET /health - 健康检查

**功能**: 检查服务健康状态和模型加载情况

**响应**:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "current_model_version": "v1.0.0",
  "fallback_model_version": "v0.9.0",
  "qps": 10.5,
  "p95_latency_ms": 50.0,
  "error_rate": 0.01,
  "uptime_seconds": 3600
}
```

**字段说明**:
- `status`: `"healthy" | "degraded" | "unhealthy"`
- `model_loaded`: 模型是否已加载
- `qps`: 每秒查询数
- `p95_latency_ms`: P95 延迟（毫秒）
- `error_rate`: 错误率（0-1）
- `uptime_seconds`: 运行时间（秒）

---

### 4. GET /metrics - 获取服务指标

**功能**: 获取详细的性能指标

**响应**:
```json
{
  "qps": 10.5,
  "p50_latency_ms": 30.0,
  "p95_latency_ms": 50.0,
  "p99_latency_ms": 80.0,
  "error_rate": 0.01,
  "total_requests": 10000,
  "total_errors": 100,
  "model_versions": {
    "v1.0.0": {
      "requests": 8000,
      "errors": 50,
      "avg_latency_ms": 35.0
    },
    "v0.9.0": {
      "requests": 2000,
      "errors": 50,
      "avg_latency_ms": 40.0
    }
  }
}
```

---

### 5. POST /deploy - 部署模型

**功能**: 部署新模型版本到服务

**请求**:
```json
{
  "model_version": "v1.0.0",
  "model_path": "/path/to/model",
  "mlflow_model_uri": "runs:/abc123/model",
  "rollout_percentage": 100.0
}
```

**响应**:
```json
{
  "success": true,
  "model_version": "v1.0.0",
  "deployed_at": "2026-01-21T12:00:00Z"
}
```

---

## 🔧 实现要求

### 必须实现的接口
1. ✅ `POST /predict` - 策略推理（核心功能）
2. ✅ `GET /health` - 健康检查（必需，用于监控）
3. ✅ `GET /metrics` - 获取指标（可选，但推荐）

### 可选实现的接口
- `POST /batch-predict` - 批量推理（性能优化）
- `POST /deploy` - 部署模型（如果支持动态部署）

---

## 💻 实现示例

### TypeScript/Node.js 实现示例

```typescript
// policy-service.ts (Express)
import express from 'express';

const app = express();
app.use(express.json());

// POST /predict
app.post('/predict', async (req, res) => {
  const { request_id, state, model_version } = req.body;
  
  // 实现推理逻辑
  const action = await inferPolicy(state, model_version);
  
  res.json({
    request_id,
    action: action.type,
    confidence: action.confidence,
    reasoning: action.reasoning,
    model_version: model_version || 'v1.0.0',
    latency_ms: action.latency,
    timestamp: new Date().toISOString(),
  });
});

// GET /health
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    model_loaded: true,
    current_model_version: 'v1.0.0',
    qps: 10.5,
    p95_latency_ms: 50.0,
    error_rate: 0.01,
    uptime_seconds: process.uptime(),
  });
});

// GET /metrics
app.get('/metrics', (req, res) => {
  res.json({
    qps: 10.5,
    p50_latency_ms: 30.0,
    p95_latency_ms: 50.0,
    p99_latency_ms: 80.0,
    error_rate: 0.01,
    total_requests: 10000,
    total_errors: 100,
    model_versions: {},
  });
});

app.listen(8002, () => {
  console.log('PolicyService running on port 8002');
});
```

### Go 实现示例

```go
// policy-service.go (Gin)
package main

import (
    "github.com/gin-gonic/gin"
    "net/http"
    "time"
)

func main() {
    r := gin.Default()
    
    // POST /predict
    r.POST("/predict", func(c *gin.Context) {
        var req PredictRequest
        if err := c.ShouldBindJSON(&req); err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
            return
        }
        
        // 实现推理逻辑
        action := inferPolicy(req.State, req.ModelVersion)
        
        c.JSON(http.StatusOK, PredictResponse{
            RequestID:   req.RequestID,
            Action:      action.Type,
            Confidence:  action.Confidence,
            ModelVersion: req.ModelVersion,
            LatencyMs:   action.Latency,
            Timestamp:   time.Now().Format(time.RFC3339),
        })
    })
    
    // GET /health
    r.GET("/health", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
            "status":            "healthy",
            "model_loaded":      true,
            "current_model_version": "v1.0.0",
            "qps":               10.5,
            "p95_latency_ms":    50.0,
            "error_rate":        0.01,
            "uptime_seconds":    time.Since(startTime).Seconds(),
        })
    })
    
    r.Run(":8002")
}
```

---

## 🔗 集成方式

### TypeScript 后端调用

```typescript
// 通过 HTTP fetch 调用，不关心后端语言
const response = await fetch(`${policyServiceUrl}/predict`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request),
});
```

### 配置

```bash
# 环境变量
POLICY_SERVICE_URL=http://localhost:8002  # 可以是任何语言的实现
POLICY_SERVICE_FALLBACK_ENABLED=true      # 是否启用降级
```

---

## 📝 实现建议

### 1. 选择实现语言

**推荐 Python 的原因**:
- ✅ ML/RL 生态丰富（PyTorch, TensorFlow, Ray）
- ✅ 已有实现参考
- ✅ 模型训练和推理通常用 Python

**其他语言的优势**:
- **TypeScript/Node.js**: 与后端技术栈一致，部署简单
- **Go**: 高性能，低延迟，资源占用少
- **Rust**: 极致性能，内存安全

### 2. 模型加载

如果使用其他语言，需要：
- 使用该语言的 ML 框架加载模型（如 TensorFlow.js, ONNX Runtime）
- 或通过 gRPC/HTTP 调用 Python 模型服务
- 或使用模型转换工具（如 ONNX）

### 3. 性能考虑

- **延迟**: 建议 P95 < 100ms
- **吞吐量**: 建议支持至少 100 QPS
- **并发**: 支持多请求并发处理

---

## ✅ 验证实现

实现后，可以通过以下方式验证：

```bash
# 1. 健康检查
curl http://localhost:8002/health

# 2. 策略推理
curl -X POST http://localhost:8002/predict \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test_001",
    "state": {
      "user_request": "Plan a trip"
    },
    "model_version": "v1.0.0"
  }'

# 3. 获取指标
curl http://localhost:8002/metrics
```

---

## 📚 相关文档

- **接口定义**: `src/agent/training/interfaces/training-platform.interface.ts`
- **当前实现**: `scripts/rl-infra/policy_service.py`
- **调用代码**: `src/agent/training/services/policy-service-manager.service.ts`

---

## 🎯 总结

**PolicyService 不限制语言**，只要：
1. ✅ 实现相同的 HTTP API 接口
2. ✅ 返回相同格式的 JSON 响应
3. ✅ 监听配置的端口（默认 8002）
4. ✅ 实现核心的 `/predict` 接口

就可以用任何语言实现！
