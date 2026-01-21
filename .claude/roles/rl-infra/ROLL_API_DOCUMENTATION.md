# ROLL 架构 API 文档

> 更新时间: 2026-01-21

本文档描述了 ROLL 架构中所有对外暴露的 API 端点，包括 TypeScript 后端 (NestJS) 和 Python Bridge Service (FastAPI) 两部分。

---

## 目录

- [一、TypeScript 后端 API (NestJS)](#一typescript-后端-api-nestjs)
  - [1.1 ROLL 监控接口](#11-roll-监控接口)
  - [1.2 ROLL A/B 测试接口](#12-roll-ab-测试接口)
- [二、Python Bridge Service API (FastAPI)](#二python-bridge-service-api-fastapi)
  - [2.1 健康检查](#21-健康检查)
  - [2.2 Actor Worker 接口](#22-actor-worker-接口)
  - [2.3 Reward Worker 接口](#23-reward-worker-接口)
  - [2.4 Policy Worker 接口](#24-policy-worker-接口)
  - [2.5 Training Pipeline 接口](#25-training-pipeline-接口)
  - [2.6 Workers 状态接口](#26-workers-状态接口)
  - [2.7 监控与追踪接口](#27-监控与追踪接口)
- [三、使用示例](#三使用示例)
- [四、错误码说明](#四错误码说明)

---

## 一、TypeScript 后端 API (NestJS)

基础路径: `/api/training`

### 1.1 ROLL 监控接口

#### GET `/api/training/roll/metrics`

获取 ROLL 架构监控指标。

**响应:**

```json
{
  "success": true,
  "data": {
    "actor_workers": {
      "active": 3,
      "total_requests": 1250,
      "avg_latency_ms": 45
    },
    "reward_workers": {
      "active": 2,
      "total_requests": 800,
      "avg_latency_ms": 30
    },
    "policy_workers": {
      "active": 2,
      "total_requests": 950,
      "avg_latency_ms": 25
    }
  }
}
```

**错误响应:**

```json
{
  "success": false,
  "error": "ROLL 监控未启用"
}
```

---

#### GET `/api/training/roll/workers/status`

获取 ROLL Workers 状态。

**响应:**

```json
{
  "success": true,
  "data": {
    "actor_workers": [
      { "id": "actor-0", "status": "healthy", "current_load": 3 },
      { "id": "actor-1", "status": "healthy", "current_load": 2 }
    ],
    "reward_workers": [
      { "id": "reward-0", "status": "healthy", "current_load": 1 }
    ],
    "policy_workers": [
      { "id": "policy-0", "status": "healthy", "current_load": 0 }
    ]
  }
}
```

---

#### GET `/api/training/roll/health`

ROLL 架构健康检查。

**响应:**

```json
{
  "success": true,
  "status": "healthy",
  "details": {
    "bridge_service": "connected",
    "ray_cluster": "healthy",
    "workers": {
      "actor": 3,
      "reward": 2,
      "policy": 2
    }
  }
}
```

---

### 1.2 ROLL A/B 测试接口

#### POST `/api/training/roll/ab-test/create`

创建 ROLL A/B 测试实验。

**请求体:**

```json
{
  "name": "roll_policy_experiment_001",
  "description": "测试 ROLL Policy Worker 对策略推理的性能提升",
  "variants": [
    {
      "variant_id": "control",
      "name": "基线实现",
      "roll_enabled": false,
      "traffic_percentage": 50
    },
    {
      "variant_id": "treatment",
      "name": "ROLL Workers",
      "roll_enabled": true,
      "roll_config": {
        "use_policy_worker": true,
        "use_reward_worker": true,
        "use_trajectory_worker": false
      },
      "traffic_percentage": 50
    }
  ],
  "success_metrics": ["latency_p95", "success_rate", "avg_reward"]
}
```

**响应:**

```json
{
  "success": true,
  "experimentId": "exp_roll_policy_001"
}
```

---

#### POST `/api/training/roll/ab-test/analyze`

分析 ROLL A/B 测试结果。

**请求体:**

```json
{
  "experiment_id": "exp_roll_policy_001",
  "variant_metrics": [
    {
      "variant_id": "control",
      "sample_size": 5000,
      "success_count": 4500,
      "total_reward": 4250.5,
      "total_latency_ms": 250000,
      "error_count": 100,
      "roll_enabled": false
    },
    {
      "variant_id": "treatment",
      "sample_size": 5000,
      "success_count": 4700,
      "total_reward": 4500.2,
      "total_latency_ms": 200000,
      "error_count": 50,
      "roll_enabled": true
    }
  ]
}
```

**响应:**

```json
{
  "success": true,
  "data": {
    "experimentId": "exp_roll_policy_001",
    "rollVsBaseline": {
      "roll_variant": { "variant_id": "treatment", "sample_size": 5000, "..." },
      "baseline_variant": { "variant_id": "control", "sample_size": 5000, "..." },
      "improvement": {
        "success_rate": 0.04,
        "avg_reward": 0.05,
        "avg_latency": 10
      }
    },
    "recommendation": "ROLL 变体表现更好，建议逐步扩大流量"
  }
}
```

---

#### GET `/api/training/roll/ab-test/should-use`

检查是否应使用 ROLL Workers。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| experiment_id | string | 是 | 实验ID |
| request_id | string | 是 | 请求ID（用于流量分配） |
| user_id | string | 否 | 用户ID |

**示例请求:**

```
GET /api/training/roll/ab-test/should-use?experiment_id=exp_001&request_id=req_123&user_id=user_456
```

**响应:**

```json
{
  "success": true,
  "use_roll": true,
  "variant_id": "treatment",
  "roll_config": {
    "use_policy_worker": true,
    "use_reward_worker": true,
    "use_trajectory_worker": false
  }
}
```

---

## 二、Python Bridge Service API (FastAPI)

基础路径: 默认为 `http://localhost:8001`

### 2.1 健康检查

#### GET `/health`

检查 Bridge Service 健康状态。

**响应:**

```json
{
  "status": "healthy",
  "ray_connected": true,
  "workers": {
    "actor": 3,
    "reward": 2,
    "policy": 2,
    "training": 1
  }
}
```

---

### 2.2 Actor Worker 接口

#### POST `/api/actor/generate-trajectory`

生成轨迹数据。

**请求头:**

| 头部 | 说明 |
|------|------|
| traceparent | W3C Trace Context (可选) |

**请求体:**

```json
{
  "plan": {
    "id": "plan_001",
    "days": [
      {
        "dayNumber": 1,
        "activities": [
          {
            "name": "Visit Museum",
            "location": { "lat": 35.6762, "lng": 139.6503 },
            "duration_minutes": 120
          }
        ]
      }
    ]
  },
  "context": {
    "user_preferences": {
      "budget": "medium",
      "pace": "relaxed"
    },
    "trip_constraints": {
      "start_date": "2025-03-01",
      "end_date": "2025-03-05"
    }
  },
  "config": {
    "max_steps": 100,
    "temperature": 0.7
  }
}
```

**响应:**

```json
{
  "success": true,
  "trajectory": {
    "trajectory_id": "traj_abc123",
    "states": [...],
    "actions": [...],
    "rewards": [...],
    "total_reward": 0.85,
    "metadata": {
      "steps": 45,
      "duration_ms": 1250
    }
  }
}
```

---

### 2.3 Reward Worker 接口

#### POST `/api/reward/compute`

计算奖励值。

**请求体:**

```json
{
  "plan": {
    "id": "plan_001",
    "days": [...]
  },
  "user_request": "我想去东京旅行5天，预算中等",
  "evidence": {
    "user_feedback": "positive",
    "constraint_violations": []
  },
  "decision_log": [
    { "step": 1, "action": "select_destination", "result": "Tokyo" }
  ]
}
```

**响应:**

```json
{
  "success": true,
  "reward": 0.85,
  "breakdown": {
    "preference_match": 0.9,
    "constraint_satisfaction": 1.0,
    "feasibility": 0.8,
    "diversity": 0.7
  },
  "metadata": {
    "compute_time_ms": 25
  }
}
```

---

### 2.4 Policy Worker 接口

#### POST `/api/policy/predict`

策略推理。

**请求体:**

```json
{
  "state": {
    "current_plan": {...},
    "user_context": {...},
    "constraints": [...]
  },
  "action_space": ["add_activity", "remove_activity", "modify_time", "approve"],
  "config": {
    "temperature": 0.5,
    "top_k": 5
  }
}
```

**响应:**

```json
{
  "success": true,
  "action": "add_activity",
  "confidence": 0.92,
  "action_distribution": {
    "add_activity": 0.45,
    "approve": 0.35,
    "modify_time": 0.15,
    "remove_activity": 0.05
  },
  "metadata": {
    "inference_time_ms": 18
  }
}
```

---

### 2.5 Training Pipeline 接口

#### POST `/api/training/start`

启动训练任务。

**请求体:**

```json
{
  "dataset_version": "v1.0.0",
  "config": {
    "learning_rate": 0.0001,
    "batch_size": 32,
    "epochs": 10,
    "model_type": "ppo"
  }
}
```

**响应:**

```json
{
  "success": true,
  "ray_job_id": "raysubmit_abc123",
  "status": "submitted"
}
```

---

#### GET `/api/training/status/{ray_job_id}`

获取训练任务状态。

**响应:**

```json
{
  "success": true,
  "job_id": "raysubmit_abc123",
  "status": "RUNNING",
  "progress": {
    "current_epoch": 5,
    "total_epochs": 10,
    "current_loss": 0.125
  }
}
```

---

#### POST `/api/training/cancel/{ray_job_id}`

取消训练任务。

**响应:**

```json
{
  "success": true,
  "message": "Training job raysubmit_abc123 cancelled"
}
```

---

### 2.6 Workers 状态接口

#### GET `/api/workers/status`

获取所有 Workers 状态。

**响应:**

```json
{
  "actor_workers": [
    {
      "id": "actor-0",
      "status": "healthy",
      "current_load": 3,
      "total_requests": 450,
      "avg_latency_ms": 42
    }
  ],
  "reward_workers": [...],
  "policy_workers": [...],
  "training_workers": [...]
}
```

---

### 2.7 监控与追踪接口

#### GET `/api/metrics`

获取 Prometheus 格式的监控指标。

**响应:**

```
# HELP roll_requests_total Total number of requests
# TYPE roll_requests_total counter
roll_requests_total{worker="actor"} 1250
roll_requests_total{worker="reward"} 800
roll_requests_total{worker="policy"} 950

# HELP roll_request_latency_seconds Request latency in seconds
# TYPE roll_request_latency_seconds histogram
roll_request_latency_seconds_bucket{worker="actor",le="0.1"} 1100
...
```

---

#### GET `/api/tracing/trace/{trace_id}`

获取分布式追踪摘要。

**响应:**

```json
{
  "trace_id": "abc123def456",
  "spans": [
    {
      "span_id": "span_001",
      "name": "generate_trajectory",
      "start_time": "2025-01-20T10:00:00Z",
      "end_time": "2025-01-20T10:00:01.250Z",
      "duration_ms": 1250,
      "status": "OK"
    }
  ],
  "total_duration_ms": 1250
}
```

---

## 三、使用示例

### 3.1 TypeScript 客户端调用示例

```typescript
import { RollClientService } from './roll-client.service';

// 检查是否应使用 ROLL
const shouldUse = await rollClient.callBridgeService(
  'GET',
  '/api/training/roll/ab-test/should-use?experiment_id=exp_001&request_id=req_123',
);

if (shouldUse.use_roll) {
  // 使用 ROLL Worker 生成轨迹
  const trajectory = await rollClient.callActorWorker({
    plan: itinerary,
    context: userContext,
    config: { max_steps: 100 },
  });
}
```

### 3.2 cURL 示例

```bash
# 健康检查
curl http://localhost:8001/health

# 创建 A/B 测试实验
curl -X POST http://localhost:3000/api/training/roll/ab-test/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "roll_test_001",
    "description": "ROLL vs Baseline",
    "variants": [
      {"variant_id": "control", "name": "Baseline", "roll_enabled": false, "traffic_percentage": 50},
      {"variant_id": "treatment", "name": "ROLL", "roll_enabled": true, "traffic_percentage": 50}
    ],
    "success_metrics": ["latency_p95", "success_rate"]
  }'

# 生成轨迹
curl -X POST http://localhost:8001/api/actor/generate-trajectory \
  -H "Content-Type: application/json" \
  -d '{"plan": {...}, "context": {...}}'
```

---

## 四、错误码说明

| HTTP 状态码 | 错误类型 | 说明 |
|-------------|----------|------|
| 200 | 成功 | 请求成功处理 |
| 400 | Bad Request | 请求参数无效 |
| 404 | Not Found | 资源不存在 |
| 500 | Internal Server Error | 服务器内部错误 |
| 503 | Service Unavailable | 服务不可用（ROLL 未启用或 Ray 集群断开） |

### 常见错误响应

```json
{
  "success": false,
  "error": "ROLL 监控未启用"
}
```

```json
{
  "success": false,
  "error": "Ray cluster disconnected",
  "details": {
    "last_connected": "2025-01-20T10:00:00Z"
  }
}
```

---

## 附录：环境变量配置

### TypeScript 后端

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| ROLL_ENABLED | false | 是否启用 ROLL |
| ROLL_BRIDGE_URL | http://localhost:8001 | Bridge Service 地址 |
| ROLL_AB_TEST_ENABLED | false | 是否启用 A/B 测试 |

### Python Bridge Service

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| RAY_ADDRESS | auto | Ray 集群地址 |
| ACTOR_WORKER_NUM | 3 | Actor Worker 数量 |
| REWARD_WORKER_NUM | 2 | Reward Worker 数量 |
| POLICY_WORKER_NUM | 2 | Policy Worker 数量 |
| ACTOR_WORKER_CPU | 1.0 | Actor Worker CPU 配置 |
| ACTOR_WORKER_MEMORY | 512MB | Actor Worker 内存配置 |

---

*文档由 rl-infra 团队维护*
