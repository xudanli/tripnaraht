# ROLL 架构生产环境部署指南

**版本**: v1.0  
**日期**: 2026-01-21

---

## 📋 部署选项

### 1. Docker Compose（推荐用于中小规模）

**适用场景**: 
- 单机或小规模集群
- 开发和测试环境
- 快速部署

**步骤**:

```bash
cd scripts/rl-infra/roll

# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置必要的环境变量

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f bridge-service

# 4. 验证部署
curl http://localhost:8001/health

# 5. 停止服务
docker-compose down
```

**环境变量配置**:
```bash
# .env 文件
RAY_ADDRESS=ray://ray-head:10001
RAY_NAMESPACE=tripnara-rl
ROLL_BRIDGE_PORT=8001
ROLL_ACTOR_WORKER_NUM=2
ROLL_REWARD_WORKER_NUM=2
ROLL_POLICY_WORKER_NUM=1
LOG_LEVEL=INFO
```

---

### 2. Kubernetes（推荐用于生产环境）

**适用场景**:
- 大规模生产环境
- 需要高可用性
- 需要自动扩缩容

**步骤**:

```bash
# 1. 构建 Docker 镜像
cd scripts/rl-infra/roll
docker build -t roll-bridge-service:latest .

# 2. 推送到镜像仓库（可选）
docker tag roll-bridge-service:latest your-registry/roll-bridge-service:latest
docker push your-registry/roll-bridge-service:latest

# 3. 部署 Ray 集群
kubectl apply -f k8s/ray-cluster.yaml

# 4. 等待 Ray 集群就绪
kubectl wait --for=condition=ready pod -l app=ray-head --timeout=300s

# 5. 部署 Bridge Service
kubectl apply -f k8s/bridge-service.yaml

# 6. 验证部署
kubectl get pods
kubectl logs -f deployment/roll-bridge-service

# 7. 检查服务
kubectl port-forward service/roll-bridge-service 8001:8001
curl http://localhost:8001/health
```

**扩展 Ray Workers**:
```bash
# 扩展 Ray Worker 节点
kubectl scale deployment ray-worker --replicas=5
```

**自动扩缩容**:
```bash
# Bridge Service 已配置 HPA，会根据 CPU/内存自动扩缩容
kubectl get hpa roll-bridge-service-hpa
```

---

## 🔧 配置说明

### 资源限制

**Ray Head**:
- CPU: 2-4 cores
- Memory: 4-8 GB

**Ray Worker**:
- CPU: 1-2 cores per worker
- Memory: 2-4 GB per worker

**Bridge Service**:
- CPU: 0.5-2 cores
- Memory: 1-2 GB

### Worker 配置

通过环境变量配置 Worker 数量：

```bash
ROLL_ACTOR_WORKER_NUM=2      # Actor-Worker 数量
ROLL_REWARD_WORKER_NUM=2     # Reward-Worker 数量
ROLL_POLICY_WORKER_NUM=1     # Policy-Worker 数量
```

### Worker 资源配置

通过环境变量配置 Worker 资源：

```bash
# Actor-Worker
ROLL_ACTOR_WORKER_CPU=1.0
ROLL_ACTOR_WORKER_MEMORY=2048  # MB
ROLL_ACTOR_WORKER_GPU=0

# Reward-Worker
ROLL_REWARD_WORKER_CPU=1.0
ROLL_REWARD_WORKER_MEMORY=2048  # MB
ROLL_REWARD_WORKER_GPU=0

# Policy-Worker
ROLL_POLICY_WORKER_CPU=0.5
ROLL_POLICY_WORKER_MEMORY=1024  # MB
ROLL_POLICY_WORKER_GPU=0

# Training-Worker
ROLL_TRAINING_WORKER_CPU=2.0
ROLL_TRAINING_WORKER_MEMORY=4096  # MB
ROLL_TRAINING_WORKER_GPU=0
```

---

## 📊 监控和观测

### Prometheus 指标

Bridge Service 暴露 Prometheus 指标：

```bash
# 获取指标
curl http://localhost:8001/metrics

# 获取指标摘要
curl http://localhost:8001/api/metrics/summary
```

### 健康检查

```bash
# 健康检查
curl http://localhost:8001/health

# Workers 状态
curl http://localhost:8001/api/workers/status
```

### Ray Dashboard

访问 Ray Dashboard 查看集群状态：

```bash
# Docker Compose
http://localhost:8265

# Kubernetes (port-forward)
kubectl port-forward service/ray-head-service 8265:8265
http://localhost:8265
```

---

## 🔒 安全配置

### 1. 网络隔离

**Docker Compose**:
- 使用独立的 Docker 网络
- 限制端口暴露

**Kubernetes**:
- 使用 NetworkPolicy 限制网络访问
- 使用 Service 类型 ClusterIP（不对外暴露）

### 2. 认证和授权

**建议**:
- 在生产环境中添加 API 认证（如 JWT）
- 使用 HTTPS/TLS
- 限制 Bridge Service 的访问来源

### 3. 密钥管理

**Docker Compose**:
```bash
# 使用 Docker secrets 或环境变量文件
docker-compose --env-file .env.prod up -d
```

**Kubernetes**:
```bash
# 使用 Kubernetes Secrets
kubectl create secret generic roll-secrets \
  --from-literal=ray-address=ray://ray-head-service:10001 \
  --from-literal=ray-namespace=tripnara-rl
```

---

## 🚀 CI/CD 集成

### Jenkins Pipeline 示例

```groovy
pipeline {
  agent any
  
  stages {
    stage('Build') {
      steps {
        dir('scripts/rl-infra/roll') {
          sh 'docker build -t roll-bridge-service:${BUILD_NUMBER} .'
        }
      }
    }
    
    stage('Test') {
      steps {
        dir('scripts/rl-infra/roll') {
          sh 'docker-compose up -d'
          sh './test_e2e_integration.sh'
          sh 'docker-compose down'
        }
      }
    }
    
    stage('Deploy') {
      steps {
        sh 'kubectl set image deployment/roll-bridge-service bridge-service=roll-bridge-service:${BUILD_NUMBER}'
        sh 'kubectl rollout status deployment/roll-bridge-service'
      }
    }
  }
}
```

---

## 📈 性能优化

### 1. Worker 数量调优

根据负载调整 Worker 数量：

```bash
# 高负载场景
ROLL_ACTOR_WORKER_NUM=4
ROLL_REWARD_WORKER_NUM=4
ROLL_POLICY_WORKER_NUM=2

# 低负载场景
ROLL_ACTOR_WORKER_NUM=1
ROLL_REWARD_WORKER_NUM=1
ROLL_POLICY_WORKER_NUM=1
```

### 2. 连接池优化

TypeScript 客户端连接池配置：

```bash
ROLL_MAX_CONNECTIONS=20
ROLL_KEEP_ALIVE=true
ROLL_KEEP_ALIVE_TIMEOUT=5000
```

### 3. 缓存配置

```bash
ROLL_CACHE_TTL=300000  # 5分钟
ROLL_CACHE_MAX_SIZE=1000
```

---

## 🔄 回滚策略

### Docker Compose

```bash
# 回滚到上一个版本
docker-compose down
git checkout <previous-commit>
docker-compose up -d
```

### Kubernetes

```bash
# 查看部署历史
kubectl rollout history deployment/roll-bridge-service

# 回滚到上一个版本
kubectl rollout undo deployment/roll-bridge-service

# 回滚到指定版本
kubectl rollout undo deployment/roll-bridge-service --to-revision=2
```

---

## ✅ 部署检查清单

- [ ] 环境变量配置正确
- [ ] Ray 集群正常运行
- [ ] Bridge Service 健康检查通过
- [ ] Workers 正常启动
- [ ] 监控指标正常收集
- [ ] 日志正常输出
- [ ] 网络连接正常
- [ ] 资源限制合理
- [ ] 安全配置到位
- [ ] 备份和恢复策略就绪

---

**最后更新**: 2026-01-21  
**负责人**: RL Infrastructure 团队
