# ROLL 架构部署指南

**版本**: v1.0  
**日期**: 2026-01-21

---

## 📋 部署选项

### 1. 开发环境（单机）

**适用场景**: 本地开发和测试

**步骤**:
```bash
cd scripts/rl-infra/roll

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
./start_roll_services.sh all
```

---

### 2. Docker Compose（推荐）

**适用场景**: 本地开发和生产环境

**步骤**:
```bash
# 创建 docker-compose.yml（待实现）
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

**docker-compose.yml**: 已实现，参见 `docker-compose.yml` 文件

**使用步骤**:
```bash
cd scripts/rl-infra/roll
docker-compose up -d
```

---

### 3. Kubernetes（生产环境）

**适用场景**: 生产环境，需要高可用性

**步骤**:
```bash
# 1. 创建 Ray 集群
kubectl apply -f k8s/ray-cluster.yaml

# 2. 部署 Bridge Service
kubectl apply -f k8s/bridge-service.yaml

# 3. 验证部署
kubectl get pods
kubectl logs -f bridge-service-xxx
```

**k8s/bridge-service.yaml 示例**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: roll-bridge-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: roll-bridge-service
  template:
    metadata:
      labels:
        app: roll-bridge-service
    spec:
      containers:
      - name: bridge-service
        image: roll-bridge-service:latest
        ports:
        - containerPort: 8001
        env:
        - name: RAY_ADDRESS
          value: "ray://ray-head-service:10001"
        - name: ROLL_BRIDGE_PORT
          value: "8001"
---
apiVersion: v1
kind: Service
metadata:
  name: roll-bridge-service
spec:
  selector:
    app: roll-bridge-service
  ports:
  - port: 8001
    targetPort: 8001
  type: LoadBalancer
```

---

## 🔧 配置管理

### 环境变量

**开发环境** (`.env.dev`):
```bash
RAY_ADDRESS=ray://localhost:10001
RAY_NAMESPACE=tripnara-rl-dev
ROLL_BRIDGE_PORT=8001
ROLL_BRIDGE_HOST=0.0.0.0
ROLL_ACTOR_WORKER_NUM=2
ROLL_REWARD_WORKER_NUM=2
ROLL_POLICY_WORKER_NUM=1
```

**生产环境** (`.env.prod`):
```bash
RAY_ADDRESS=ray://ray-head-service:10001
RAY_NAMESPACE=tripnara-rl-prod
ROLL_BRIDGE_PORT=8001
ROLL_BRIDGE_HOST=0.0.0.0
ROLL_ACTOR_WORKER_NUM=4
ROLL_REWARD_WORKER_NUM=4
ROLL_POLICY_WORKER_NUM=2
ROLL_TRAINING_BACKEND=megatron
MLFLOW_TRACKING_URI=http://mlflow-service:5000
```

---

## 📊 资源需求

### 开发环境

| 组件 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| Ray Head | 2 cores | 4 GB | 10 GB |
| Bridge Service | 1 core | 2 GB | 1 GB |
| Workers | 2 cores | 4 GB | 1 GB |
| **总计** | **5 cores** | **10 GB** | **12 GB** |

### 生产环境

| 组件 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| Ray Head | 4 cores | 8 GB | 50 GB |
| Bridge Service | 2 cores | 4 GB | 5 GB |
| Workers (每个) | 2 cores | 4 GB | 5 GB |
| **总计** | **16+ cores** | **32+ GB** | **100+ GB** |

---

## 🔐 安全配置

### 1. 网络隔离

```bash
# 使用防火墙限制访问
# 只允许内部网络访问 Ray
# Bridge Service 只暴露必要端口
```

### 2. 认证和授权

```python
# bridge_service.py 中添加认证中间件
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer

security = HTTPBearer()

@app.post("/api/actor/generate-trajectory")
async def generate_trajectory(
    request: ActorRequest,
    token: str = Security(security)
):
    # 验证 token
    if not verify_token(token):
        raise HTTPException(status_code=401)
    # ...
```

### 3. TLS/SSL

```bash
# 使用 HTTPS
# 配置 SSL 证书
uvicorn app:app --host 0.0.0.0 --port 8001 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

---

## 📈 监控和日志

### 1. 日志配置

```python
# bridge_service.py
import logging
from logging.handlers import RotatingFileHandler

# 配置日志
handler = RotatingFileHandler(
    'logs/bridge_service.log',
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5
)
logging.basicConfig(
    level=logging.INFO,
    handlers=[handler],
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

### 2. 监控指标

```python
# 集成 Prometheus
from prometheus_client import Counter, Histogram

request_count = Counter('bridge_requests_total', 'Total requests')
request_latency = Histogram('bridge_request_latency_seconds', 'Request latency')

@app.middleware("http")
async def metrics_middleware(request, call_next):
    start_time = time.time()
    response = await call_next(request)
    request_count.inc()
    request_latency.observe(time.time() - start_time)
    return response
```

### 3. 健康检查

```bash
# 定期健康检查
*/5 * * * * curl http://localhost:8001/health || alert.sh
```

---

## 🚀 部署检查清单

### 部署前
- [ ] 环境变量配置完成
- [ ] 依赖安装完成
- [ ] 配置文件检查完成
- [ ] 网络配置检查完成

### 部署中
- [ ] Ray 集群启动成功
- [ ] Bridge Service 启动成功
- [ ] Workers 初始化成功
- [ ] 健康检查通过

### 部署后
- [ ] API 测试通过
- [ ] 性能测试通过
- [ ] 监控系统正常
- [ ] 日志收集正常

---

## 🔄 更新和回滚

### 更新流程

```bash
# 1. 备份当前版本
cp -r roll roll.backup

# 2. 更新代码
git pull

# 3. 更新依赖
pip install -r requirements.txt

# 4. 重启服务
./start_roll_services.sh stop
./start_roll_services.sh all

# 5. 验证
curl http://localhost:8001/health
```

### 回滚流程

```bash
# 1. 停止服务
./start_roll_services.sh stop

# 2. 恢复备份
rm -rf roll
mv roll.backup roll

# 3. 重启服务
./start_roll_services.sh all

# 4. 验证
curl http://localhost:8001/health
```

---

## 📚 参考资料

- [Ray 部署文档](https://docs.ray.io/en/latest/cluster/getting-started.html)
- [FastAPI 部署文档](https://fastapi.tiangolo.com/deployment/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Kubernetes 文档](https://kubernetes.io/docs/)

---

**最后更新**: 2026-01-21
