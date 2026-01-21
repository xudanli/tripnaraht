# ROLL Bridge Service API 参考

**版本**: v1.0  
**Base URL**: `http://localhost:8001`

---

## 📋 目录

- [健康检查](#健康检查)
- [Workers 管理](#workers-管理)
- [Actor-Worker API](#actor-worker-api)
- [Reward-Worker API](#reward-worker-api)
- [Policy-Worker API](#policy-worker-api)
- [Training Pipeline API](#training-pipeline-api)

---

## 健康检查

### GET /health

检查服务健康状态。

**响应示例**:
```json
{
  "status": "healthy",
  "ray_connected": true,
  "workers": {
    "actor": 2,
    "reward": 2,
    "policy": 1,
    "training": 1
  }
}
```

---

## Workers 管理

### GET /api/workers/status

获取所有 Workers 的状态。

**响应示例**:
```json
{
  "actor_workers": [
    {"id": 0, "status": "healthy"},
    {"id": 1, "status": "healthy"}
  ],
  "reward_workers": [
    {"id": 0, "status": "healthy"},
    {"id": 1, "status": "healthy"}
  ],
  "policy_workers": [
    {"id": 0, "status": "healthy"}
  ],
  "training_workers": [
    {"id": 0, "status": "healthy"}
  ]
}
```

---

## Actor-Worker API

### POST /api/actor/generate-trajectory

生成轨迹数据。

**请求体**:
```json
{
  "request_id": "req-001",
  "user_request": "Plan a trip to Iceland",
  "state": {
    "origin": "Reykjavik",
    "destination": "Akureyri"
  },
  "action": "generate_itinerary",
  "params": {
    "duration": 7,
    "budget": 5000
  },
  "timestamp": "2026-01-21T10:00:00Z"
}
```

**响应示例**:
```json
{
  "success": true,
  "trajectory_id": "traj_req-001_actor-0",
  "trajectory_ref_id": "ray_object_ref_12345",
  "trajectory": {
    "trajectory_id": "traj_req-001_actor-0",
    "steps": [
      {
        "step": 0,
        "state": {...},
        "action": {...},
        "reward": 0.0,
        "next_state": {...}
      }
    ]
  }
}
```

---

## Reward-Worker API

### POST /api/reward/compute

计算奖励分数。

**请求体**:
```json
{
  "trajectory": {
    "trajectory_id": "traj-001",
    "steps": [
      {
        "step": 0,
        "state": {"user_request": "Plan a trip"},
        "action": {"action": "generate_itinerary"},
        "reward": 0.0,
        "next_state": {"plan_generated": true}
      }
    ]
  },
  "reward_config": {}
}
```

**响应示例**:
```json
{
  "success": true,
  "reward": 0.7,
  "raw_reward": 0.7,
  "reward_breakdown": [
    {
      "step": 0,
      "base_reward": 0.1,
      "quality_reward": 0.3,
      "state_reward": 0.1,
      "total": 0.5
    }
  ]
}
```

---

## Policy-Worker API

### POST /api/policy/predict

策略推理。

**请求体**:
```json
{
  "user_request": "Plan a trip to Iceland",
  "origin": "Reykjavik",
  "destination": "Akureyri",
  "constraints": {
    "budget": 5000,
    "duration": 7
  },
  "preferences": {
    "pace": "moderate"
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "action": "ALLOW",
  "confidence": 0.8,
  "reasoning": "请求符合策略要求",
  "adjusted_params": null
}
```

**可能的 action 值**:
- `ALLOW` - 允许执行
- `REJECT` - 拒绝执行
- `ADJUST` - 需要调整参数
- `CLARIFY` - 需要澄清信息

---

## Training Pipeline API

### POST /api/training/start

启动训练任务。

**请求体**:
```json
{
  "job_id": "job-001",
  "model_type": "sft",
  "base_model": "gpt-4",
  "training_data": [
    {"input": "test input", "output": "test output"}
  ],
  "hyperparameters": {
    "learning_rate": 0.0001,
    "batch_size": 32
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "ray_job_id": "ray_job_job-001_training-0_...",
  "mlflow_run_id": "mlflow_run_job-001_1234567890",
  "status": "RUNNING",
  "backend": "megatron"
}
```

---

### GET /api/training/status/{ray_job_id}

查询训练任务状态。

**路径参数**:
- `ray_job_id` - Ray Job ID

**响应示例**:
```json
{
  "success": true,
  "ray_job_id": "ray_job_job-001_...",
  "status": "RUNNING",
  "progress": 0.5,
  "metrics": {
    "loss": 0.5,
    "accuracy": 0.8
  }
}
```

**可能的 status 值**:
- `RUNNING` - 运行中
- `COMPLETED` - 已完成
- `FAILED` - 失败
- `STOPPED` - 已停止

---

### POST /api/training/cancel/{ray_job_id}

取消训练任务。

**路径参数**:
- `ray_job_id` - Ray Job ID

**响应示例**:
```json
{
  "success": true,
  "ray_job_id": "ray_job_job-001_...",
  "status": "STOPPED"
}
```

---

## 错误响应

所有 API 在出错时返回以下格式：

```json
{
  "detail": "错误描述"
}
```

**HTTP 状态码**:
- `200` - 成功
- `400` - 请求错误
- `500` - 服务器错误
- `503` - 服务不可用（Workers 不可用）

---

## 使用示例

### cURL 示例

```bash
# 生成轨迹
curl -X POST http://localhost:8001/api/actor/generate-trajectory \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_request": "Plan a trip",
    "state": {},
    "action": "test_action",
    "params": {}
  }'

# 计算奖励
curl -X POST http://localhost:8001/api/reward/compute \
  -H "Content-Type: application/json" \
  -d '{
    "trajectory": {
      "trajectory_id": "traj-001",
      "steps": []
    }
  }'

# 策略推理
curl -X POST http://localhost:8001/api/policy/predict \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Plan a trip",
    "constraints": {}
  }'
```

### Python 示例

```python
import httpx

async with httpx.AsyncClient() as client:
    # 生成轨迹
    response = await client.post(
        "http://localhost:8001/api/actor/generate-trajectory",
        json={
            "request_id": "test-001",
            "user_request": "Plan a trip",
            "state": {},
            "action": "test_action",
            "params": {}
        }
    )
    result = response.json()
```

### TypeScript 示例

```typescript
// 使用 RollClientService
const rollClient = new RollClientService(configService);

// 生成轨迹
const trajectory = await rollClient.callActorWorker({
  requestId: 'req-001',
  userRequest: 'Plan a trip',
  state: {},
  action: 'generate_itinerary',
  params: {},
});

// 计算奖励
const reward = await rollClient.callRewardWorker(trajectory.trajectory);

// 策略推理
const policy = await rollClient.callPolicyWorker({
  userRequest: 'Plan a trip',
  constraints: {},
});
```

---

## 更多信息

- [快速开始指南](./QUICKSTART.md)
- [完整 README](./README.md)
- [Swagger UI](http://localhost:8001/docs)

---

**最后更新**: 2026-01-21
