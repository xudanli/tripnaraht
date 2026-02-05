# RL Infrastructure Python Services

本目录包含 RL Infrastructure 的传统 Python 服务。

> ⚠️ **注意**：新的 LoRA 微调框架已在 `docker/` 和 `python/` 目录下实现，推荐使用新框架。

## 服务架构对比

| 服务 | 传统架构 (本目录) | 新 LoRA 框架 (推荐) |
|------|-------------------|---------------------|
| **训练服务** | `training_service.py` (端口 8001) | `python/train/api.py` (端口 8000) |
| **推理服务** | `policy-service.ts` (端口 8002) | **vLLM** (端口 8080) |
| **评分服务** | `llm_judge_service.py` (端口 8003) | `python/judge/llm_judge_service.py` (端口 8003) |
| **训练框架** | Ray 分布式 | **LLaMA-Factory + LoRA** |
| **模型管理** | 自定义 | **MLflow** |

## 推荐：使用新 LoRA 微调框架

```bash
# 启动新框架（推荐）
cd docker
docker-compose -f docker-compose.train.yml up -d

# 服务端口：
# - 8000: LoRA 训练 API
# - 8080: vLLM 推理
# - 8003: LLM Judge
# - 5000: MLflow
# - 6380: Redis
```

详见：`docs/LORA_FINETUNE_GUIDE.md`

---

## 传统服务列表（向后兼容）

### 1. Training Service (训练服务) ⚠️ 建议迁移到新框架
- **端口**: 8001
- **职责**: 管理训练任务，与Ray/MLflow集成
- **文件**: `training_service.py`
- **替代方案**: `python/train/api.py` + `docker/Dockerfile.train`

### 2. Policy Service (策略服务) ⚠️ 建议使用 vLLM
- **端口**: 8002
- **职责**: 在线策略推理
- **文件**: `policy-service.ts` (TypeScript)
- **替代方案**: vLLM + `src/agent/training/services/vllm-client.service.ts`

### 3. LLM Judge Service (LLM评分服务) ✅ **已整合到新框架**
- **端口**: 8003
- **职责**: 使用LLM进行质量评分
- **新位置**: `python/judge/llm_judge_service.py`
- **增强功能**: LoRA 模型评估、真实 LLM 调用

## 快速开始

### 1. 传统服务（Python/TypeScript）

```bash
cd scripts/rl-infra

# 安装依赖
pip install -r requirements.txt

# 启动服务
./start-services.sh all
```

### 2. ROLL 架构（推荐）⭐

```bash
cd scripts/rl-infra/roll

# 快速开始（5分钟）
# 详见: roll/QUICKSTART.md
./start_roll_services.sh all

# 查看 API 文档
# http://localhost:8001/docs
```

> 📋 **ROLL 架构**: 基于 Ray 的分布式 RL 训练架构，提供更好的可扩展性和性能。详见 [`roll/README.md`](./roll/README.md)

### 3. 使用Docker Compose（推荐）

```bash
docker-compose up -d
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TRAINING_SERVICE_PORT` | 8001 | 训练服务端口 |
| `POLICY_SERVICE_PORT` | 8002 | 策略服务端口 |
| `LLM_JUDGE_SERVICE_PORT` | 8003 | LLM Judge服务端口 |
| `MLFLOW_TRACKING_URI` | sqlite:///mlflow.db | MLflow Tracking URI |
| `RAY_ADDRESS` | local | Ray集群地址 |
| `ANTHROPIC_API_KEY` | - | Anthropic API Key |
| `OPENAI_API_KEY` | - | OpenAI API Key |
| `LLM_PROVIDER` | anthropic | LLM提供商 |
| `LLM_MODEL` | claude-3-haiku-20240307 | LLM模型 |

## API 端点

### Training Service

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/training/start` | POST | 启动训练任务 |
| `/training/status/{job_id}` | GET | 获取训练任务状态 |
| `/training/cancel/{job_id}` | POST | 取消训练任务 |
| `/training/jobs` | GET | 列出所有训练任务 |
| `/training/hyperparameter-tune` | POST | 超参数调优 |

### Policy Service

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/predict` | POST | 策略推理 |
| `/batch-predict` | POST | 批量推理 |
| `/metrics` | GET | 获取服务指标 |
| `/deploy` | POST | 部署新模型 |
| `/rollback` | POST | 回滚模型 |

### LLM Judge Service

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/score` | POST | 质量评分 |
| `/batch-score` | POST | 批量评分 |
| `/compare` | POST | 比较两个计划 |
| `/prompts` | GET | 列出Prompt模板 |

## 示例请求

### 策略推理

```bash
curl -X POST http://localhost:8002/predict \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test_001",
    "state": {
      "user_request": "Plan a trip to Iceland",
      "destination": "IS"
    }
  }'
```

### 质量评分

```bash
curl -X POST http://localhost:8003/score \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test_001",
    "user_request": "Plan a 3-day trip to Iceland",
    "plan": [
      {
        "day": 1,
        "activities": [{"name": "Visit Blue Lagoon", "duration": "2h"}]
      }
    ]
  }'
```

## 与TypeScript后端集成

### 服务架构

| 服务 | 实现 | 集成方式 |
|------|------|----------|
| **Training Service** | Python | HTTP 调用 (`TRAINING_SERVICE_URL`) |
| **Policy Service** | TypeScript | HTTP 调用 (`POLICY_SERVICE_URL`) |
| **LLM Judge Service** | ✅ **已集成** | 直接使用 `LlmService` |

### 配置环境变量

```bash
# Training Service (Python)
export TRAINING_SERVICE_URL=http://localhost:8001

# Policy Service (TypeScript)
export POLICY_SERVICE_URL=http://localhost:8002

# LLM Judge Service (已集成，无需配置)
# 如需使用外部服务（向后兼容）：
# export USE_EXTERNAL_LLM_JUDGE=true
# export LLM_JUDGE_SERVICE_URL=http://localhost:8003
```

### TypeScript后端中的相关服务

- `TrainingPipelineService` - 调用 Training Service (Python)
- `PolicyServiceManagerService` - 调用 Policy Service (TypeScript)
- `QualityScorerService` - ✅ **直接使用 `LlmService`**（无需外部服务）

## 开发

### 运行测试

```bash
pytest tests/
```

### 代码格式化

```bash
black .
isort .
```

## 迁移指南

### 从传统架构迁移到新 LoRA 框架

| 传统服务 | 新框架对应 |
|----------|-----------|
| `training_service.py` | `python/train/api.py` |
| `policy-service.ts` | `VllmClientService` + vLLM |
| `llm_judge_service.py` | `python/judge/llm_judge_service.py` |
| Ray 训练 | LLaMA-Factory LoRA |
| 自定义模型管理 | MLflow Model Registry |

### NestJS 服务集成

```typescript
// 新服务
import { FineTuneService } from './services/fine-tune.service';
import { VllmClientService } from './services/vllm-client.service';
import { LlmJudgeClientService } from './services/llm-judge-client.service';

// 训练 API
POST /api/training/start        // LoRA 训练
POST /api/training/vllm/generate  // vLLM 推理
POST /api/training/judge/score    // 质量评分
POST /api/training/judge/evaluate-lora  // LoRA 评估
```

## 参考文档

- `docs/LORA_FINETUNE_GUIDE.md` - LoRA 微调指南
- `docker/docker-compose.train.yml` - 新框架服务编排
- `.claude/roles/rl-infra/` - RL 基础设施角色文档

## TODO (传统架构)

- [x] ~~实现MLflow集成~~ → 已在新框架实现
- [x] ~~实现实际的LLM API调用~~ → 已在新框架实现
- [ ] 添加认证和授权
- [ ] 添加更完善的错误处理
- [ ] 添加单元测试
