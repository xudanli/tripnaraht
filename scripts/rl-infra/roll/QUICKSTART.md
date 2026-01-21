# ROLL 架构快速开始指南

**版本**: v1.0  
**日期**: 2026-01-21

---

## 🚀 5 分钟快速开始

### 1. 安装依赖

```bash
cd scripts/rl-infra/roll

# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 启动服务

```bash
# 一键启动所有服务
./start_roll_services.sh all
```

这将启动：
- Ray 集群（端口 10001）
- Ray Dashboard（端口 8265）
- Bridge Service（端口 8001）

### 3. 验证服务

```bash
# 健康检查
curl http://localhost:8001/health

# Workers 状态
curl http://localhost:8001/api/workers/status
```

### 4. 运行测试

```bash
# Python 测试
python test_bridge.py

# Bash 集成测试
./test_e2e_integration.sh
```

### 5. 查看 API 文档

访问: http://localhost:8001/docs

---

## 📋 服务端点

| 服务 | URL | 说明 |
|------|-----|------|
| Bridge Service | http://localhost:8001 | REST API |
| Ray Dashboard | http://localhost:8265 | Ray 监控面板 |
| API 文档 | http://localhost:8001/docs | Swagger UI |

---

## 🔧 配置

### 环境变量（可选）

```bash
# Ray 配置
export RAY_ADDRESS=ray://localhost:10001
export RAY_NAMESPACE=tripnara-rl

# Bridge Service 配置
export ROLL_BRIDGE_PORT=8001
export ROLL_BRIDGE_HOST=0.0.0.0

# Worker 数量配置
export ROLL_ACTOR_WORKER_NUM=2
export ROLL_REWARD_WORKER_NUM=2
export ROLL_POLICY_WORKER_NUM=1
```

---

## 📝 API 使用示例

### 1. 生成轨迹

```bash
curl -X POST http://localhost:8001/api/actor/generate-trajectory \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_request": "Plan a trip to Iceland",
    "state": {
      "origin": "Reykjavik",
      "destination": "Akureyri"
    },
    "action": "generate_itinerary",
    "params": {
      "duration": 7,
      "budget": 5000
    }
  }'
```

### 2. 计算奖励

```bash
curl -X POST http://localhost:8001/api/reward/compute \
  -H "Content-Type: application/json" \
  -d '{
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
    }
  }'
```

### 3. 策略推理

```bash
curl -X POST http://localhost:8001/api/policy/predict \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Plan a trip to Iceland",
    "origin": "Reykjavik",
    "destination": "Akureyri",
    "constraints": {
      "budget": 5000
    },
    "preferences": {
      "pace": "moderate"
    }
  }'
```

### 4. 启动训练

```bash
curl -X POST http://localhost:8001/api/training/start \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job-001",
    "model_type": "sft",
    "base_model": "gpt-4",
    "training_data": [
      {"input": "test", "output": "test"}
    ],
    "hyperparameters": {
      "learning_rate": 0.0001
    }
  }'
```

---

## 🛠️ 故障排查

### 问题 1: Ray 集群启动失败

```bash
# 检查 Ray 是否已安装
ray --version

# 手动启动 Ray
ray start --head
```

### 问题 2: Bridge Service 无法连接 Ray

```bash
# 检查 Ray 状态
ray status

# 检查环境变量
echo $RAY_ADDRESS
```

### 问题 3: Workers 未启动

```bash
# 检查 Bridge Service 日志
# 查看启动脚本输出

# 手动检查 Workers
curl http://localhost:8001/api/workers/status
```

---

## 📚 更多文档

- [完整 README](./README.md)
- [架构评估](../../../.claude/roles/rl-infra/ROLL_ARCHITECTURE_MIGRATION_ASSESSMENT.md)
- [实施计划](../../../.claude/roles/rl-infra/ROLL_MIGRATION_IMPLEMENTATION_PLAN.md)
- [迁移完成总结](../../../.claude/roles/rl-infra/ROLL_MIGRATION_COMPLETE.md)

---

## 🆘 获取帮助

如有问题，请查看：
1. API 文档: http://localhost:8001/docs
2. Ray Dashboard: http://localhost:8265
3. 日志文件: 查看启动脚本输出

---

**最后更新**: 2026-01-21
