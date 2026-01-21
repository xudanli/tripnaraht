# ROLL 架构故障排查指南

**版本**: v1.0  
**日期**: 2026-01-21

---

## 🔍 常见问题

### 1. Ray 集群启动失败

**症状**:
```
Error: Ray cluster failed to start
```

**解决方案**:
```bash
# 检查 Ray 是否已安装
ray --version

# 如果未安装，安装 Ray
pip install ray[default]

# 检查端口是否被占用
lsof -i :10001

# 手动启动 Ray
ray start --head --port=10001
```

---

### 2. Bridge Service 无法连接 Ray

**症状**:
```
[Bridge] Ray 初始化失败，使用本地模式
```

**解决方案**:
```bash
# 检查 Ray 是否运行
ray status

# 检查环境变量
echo $RAY_ADDRESS
echo $RAY_NAMESPACE

# 设置正确的环境变量
export RAY_ADDRESS=ray://localhost:10001
export RAY_NAMESPACE=tripnara-rl

# 重启 Bridge Service
./start_roll_services.sh bridge
```

---

### 3. Workers 未启动

**症状**:
```json
{
  "actor_workers": [],
  "reward_workers": []
}
```

**解决方案**:
```bash
# 检查 Bridge Service 日志
# 查看启动脚本输出

# 检查 Ray 连接
curl http://localhost:8001/health

# 手动检查 Workers
curl http://localhost:8001/api/workers/status

# 重启所有服务
./start_roll_services.sh stop
./start_roll_services.sh all
```

---

### 4. API 调用返回 503

**症状**:
```json
{
  "detail": "No Actor-Workers available"
}
```

**解决方案**:
```bash
# 检查 Workers 状态
curl http://localhost:8001/api/workers/status

# 检查 Ray Dashboard
# http://localhost:8265

# 重启 Workers
./start_roll_services.sh stop
./start_roll_services.sh all
```

---

### 5. TypeScript 无法连接 Bridge Service

**症状**:
```
[RollClient] Bridge Service 调用失败: fetch failed
```

**解决方案**:
```bash
# 检查 Bridge Service 是否运行
curl http://localhost:8001/health

# 检查环境变量
echo $ROLL_BRIDGE_URL

# 设置正确的环境变量
export ROLL_BRIDGE_URL=http://localhost:8001

# 检查防火墙/网络
ping localhost
```

---

### 6. 训练任务启动失败

**症状**:
```json
{
  "success": false,
  "error": "Training Pipeline 调用失败"
}
```

**解决方案**:
```bash
# 检查 Training Pipeline Worker
curl http://localhost:8001/api/workers/status

# 检查 Ray Job 提交
# 查看 Ray Dashboard: http://localhost:8265

# 检查训练配置
# 确保 training_data 格式正确
```

---

## 🔧 调试技巧

### 1. 查看日志

```bash
# Bridge Service 日志
# 查看启动脚本输出

# Ray 日志
ray logs

# Python Workers 日志
# 在 bridge_service.py 中查看 logger 输出
```

### 2. 检查服务状态

```bash
# 健康检查
curl http://localhost:8001/health

# Workers 状态
curl http://localhost:8001/api/workers/status

# Ray 状态
ray status
```

### 3. 测试单个组件

```bash
# 测试 Actor-Worker
python -c "
import asyncio
from actor_worker import ActorWorker
import ray
ray.init()
actor = ActorWorker.remote()
result = ray.get(actor.generate_trajectory.remote({
    'request_id': 'test',
    'user_request': 'test',
    'state': {},
    'action': 'test',
    'params': {}
}))
print(result)
"

# 测试 Bridge Service
python test_bridge.py
```

---

## 🐛 常见错误

### 错误 1: `ModuleNotFoundError: No module named 'ray'`

**原因**: Ray 未安装

**解决**:
```bash
pip install ray[default]
```

---

### 错误 2: `Address already in use`

**原因**: 端口被占用

**解决**:
```bash
# 查找占用端口的进程
lsof -i :8001
lsof -i :10001

# 杀死进程或更改端口
kill -9 <PID>
# 或
export ROLL_BRIDGE_PORT=8002
```

---

### 错误 3: `Connection refused`

**原因**: 服务未启动或地址错误

**解决**:
```bash
# 检查服务是否启动
ps aux | grep bridge_service
ps aux | grep ray

# 检查地址配置
echo $RAY_ADDRESS
echo $ROLL_BRIDGE_URL
```

---

### 错误 4: `RayObjectRef not found`

**原因**: Ray ObjectRef 已过期或序列化失败

**解决**:
- 确保在同一个 Ray 会话中使用 ObjectRef
- 使用完整轨迹数据而不是 ObjectRef（当前实现）

---

## 📊 性能问题

### 问题 1: 延迟过高

**诊断**:
```bash
# 测试延迟
time curl -X POST http://localhost:8001/api/actor/generate-trajectory \
  -H "Content-Type: application/json" \
  -d '{"request_id":"test","user_request":"test","state":{},"action":"test","params":{}}'
```

**优化**:
- 增加 Worker 数量
- 优化 Worker 实现
- 使用连接池

---

### 问题 2: 吞吐量低

**诊断**:
```bash
# 运行性能测试
./test_e2e_integration.sh
```

**优化**:
- 增加 Worker 数量
- 使用异步处理
- 优化负载均衡策略

---

## 🔐 安全相关问题

### 问题 1: CORS 错误

**症状**:
```
Access to fetch at 'http://localhost:8001' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**解决**:
```python
# bridge_service.py 中已配置 CORS
# 如需限制，修改 allow_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 限制特定域名
    ...
)
```

---

## 📞 获取帮助

### 1. 查看文档
- [README.md](./README.md)
- [QUICKSTART.md](./QUICKSTART.md)
- [API_REFERENCE.md](./API_REFERENCE.md)

### 2. 检查日志
- Bridge Service 日志
- Ray Dashboard: http://localhost:8265
- API 文档: http://localhost:8001/docs

### 3. 运行测试
```bash
# 运行所有测试
python test_bridge.py
./test_e2e_integration.sh
```

---

## 🎯 最佳实践

### 1. 启动顺序
1. 先启动 Ray 集群
2. 再启动 Bridge Service
3. 最后验证 Workers

### 2. 环境变量
- 使用 `.env` 文件管理环境变量
- 确保所有服务使用相同的配置

### 3. 监控
- 定期检查健康状态
- 监控 Ray Dashboard
- 查看日志文件

---

**最后更新**: 2026-01-21
