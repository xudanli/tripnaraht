# RL 基础设施快速启动指南

## 🚀 推荐：新 LoRA 微调框架

```bash
# 启动完整训练服务栈
cd docker
docker-compose -f docker-compose.train.yml up -d

# 检查服务状态
docker-compose -f docker-compose.train.yml ps

# 服务端口：
# - http://localhost:8000 - LoRA 训练 API
# - http://localhost:8080 - vLLM 推理 (OpenAI 兼容)
# - http://localhost:8003 - LLM Judge 评分
# - http://localhost:5000 - MLflow UI
# - http://localhost:6007 - TensorBoard
```

详见：`docs/LORA_FINETUNE_GUIDE.md`

---

## 传统 PolicyService (向后兼容)

### 1. 安装依赖（如果还没有）

```bash
cd /home/devbox/project
npm install
```

### 2. 启动服务

```bash
# 方式 1: 使用 npm script（推荐）
npm run policy-service:start

# 方式 2: 直接运行
cd scripts/rl-infra
ts-node policy-service.ts
```

### 3. 验证服务

在另一个终端运行：

```bash
# 健康检查
curl http://localhost:8002/health

# 或运行完整测试
npm run policy-service:test
```

## 📋 常用命令

```bash
# 启动服务
npm run policy-service:start

# 运行测试
npm run policy-service:test

# 使用启动脚本（支持所有服务）
cd scripts/rl-infra
./start-services.sh policy
```

## 🔧 配置

通过环境变量配置端口和主机：

```bash
POLICY_SERVICE_PORT=8002 npm run policy-service:start
```

## ✅ 验证成功

如果看到以下输出，说明服务启动成功：

```
=================================
🚀 PolicyService started
📍 Listening on http://0.0.0.0:8002
📋 API endpoints:
   POST   /predict
   POST   /batch-predict
   GET    /health
   GET    /metrics
   POST   /deploy
   POST   /rollback
=================================
```

## 🐛 故障排除

### 问题 1: `express` 模块未找到

**解决**: 运行 `npm install` 安装依赖

### 问题 2: 端口已被占用

**解决**: 更改端口或停止占用端口的服务

```bash
POLICY_SERVICE_PORT=8003 npm run policy-service:start
```

### 问题 3: ts-node 未找到

**解决**: 安装 ts-node

```bash
npm install -g ts-node
# 或使用项目本地的
npx ts-node scripts/rl-infra/policy-service.ts
```

## 📚 更多信息

- **新框架文档**: [docs/LORA_FINETUNE_GUIDE.md](../../docs/LORA_FINETUNE_GUIDE.md)
- **Docker 编排**: [docker/docker-compose.train.yml](../../docker/docker-compose.train.yml)
- 详细文档: [README_POLICY_SERVICE_TS.md](./README_POLICY_SERVICE_TS.md)
- API 规范: [../../POLICY_SERVICE_API_SPEC.md](../../POLICY_SERVICE_API_SPEC.md)

## 🆕 新框架 vs 传统框架

| 功能 | 新框架 (推荐) | 传统框架 |
|------|--------------|---------|
| 训练 | LoRA 微调 + LLaMA-Factory | Ray 分布式 |
| 推理 | vLLM (高性能) | 自定义 Policy Service |
| 评分 | LLM Judge (增强版) | 基础版 |
| 部署 | Docker Compose | 手动启动 |

**推荐迁移到新框架以获得更好的性能和更多功能。**
