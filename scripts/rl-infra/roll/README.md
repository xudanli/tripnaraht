# ROLL 架构实现

**状态**: 🚀 Phase 1 - POC 实施中  
**方案**: 方案 B - 混合架构

---

## 📋 目录结构

```
roll/
├── README.md                    # 本文件
├── QUICKSTART.md                # ⭐ 快速开始指南
├── API_REFERENCE.md             # 📚 API 参考文档
├── CHECKLIST.md                 # ✅ 检查清单
├── requirements.txt             # Python 依赖
├── config.py                    # ROLL 配置
├── actor_worker.py              # Actor-Worker (轨迹生成)
├── reward_worker.py             # Reward-Worker (奖励计算)
├── policy_worker.py             # Policy-Worker (策略推理)
├── training_pipeline.py         # Training Pipeline Worker
├── bridge_service.py            # Bridge Service (HTTP API)
├── start_roll_cluster.sh        # Ray 集群启动脚本
├── start_roll_services.sh       # 服务启动脚本
├── test_bridge.py               # Python 测试脚本
├── test_e2e_integration.sh      # Bash 集成测试
└── monitoring.py                # ⭐ 监控和观测模块（新增）
```

---

## 🚀 快速开始

> 📋 **详细指南**: 查看 [`QUICKSTART.md`](./QUICKSTART.md)

### 1. 安装依赖

```bash
# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 启动所有服务

```bash
# 一键启动所有服务
./start_roll_services.sh all
```

### 3. 验证服务

```bash
# 健康检查
curl http://localhost:8001/health

# 运行测试
python test_bridge.py
```

### 4. 查看 API 文档

访问: http://localhost:8001/docs

---

## 📊 架构

```
TypeScript (NestJS)
  ↕ Ray API
ROLL Workers (Ray)
  ├─ Actor-Worker
  ├─ Reward-Worker
  └─ Policy-Worker
```

---

## 🔧 配置

环境变量:
- `RAY_ADDRESS`: Ray 集群地址（默认: `ray://localhost:10001`）
- `ROLL_ACTOR_WORKER_NUM`: Actor-Worker 数量（默认: 2）
- `ROLL_REWARD_WORKER_NUM`: Reward-Worker 数量（默认: 2）
- `ROLL_POLICY_WORKER_NUM`: Policy-Worker 数量（默认: 1）

---

## 📝 开发状态

### Phase 1: POC ✅ 完成

- [x] ✅ 项目结构创建
- [x] ✅ Actor-Worker 实现
- [x] ✅ Reward-Worker 实现
- [x] ✅ Bridge Service 实现
- [x] ✅ TypeScript 桥接

### Phase 2: 核心组件迁移 ✅ 完成

- [x] ✅ Policy-Worker 实现
- [x] ✅ Training Pipeline Worker 实现
- [x] ✅ 所有适配器服务
- [x] ✅ 完整 API 集成
- [x] ✅ 文档和测试

**状态**: ✅ **Phase 1 & Phase 2 完成，Phase 3 进行中（监控系统已完成）**

---

## 📚 文档索引

- [QUICKSTART.md](./QUICKSTART.md) - 5分钟快速开始
- [API_REFERENCE.md](./API_REFERENCE.md) - API 参考文档
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构详细说明
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 部署指南
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - 故障排查指南
- [CHECKLIST.md](./CHECKLIST.md) - 检查清单

## 📊 监控和观测

### Prometheus 指标

访问 `/metrics` 端点获取 Prometheus 格式指标：
```bash
curl http://localhost:8001/metrics
```

### 指标摘要

访问 `/api/metrics/summary` 获取 JSON 格式摘要：
```bash
curl http://localhost:8001/api/metrics/summary
```

### TypeScript API

- `GET /api/training/roll/metrics` - 获取监控指标
- `GET /api/training/roll/workers/status` - Workers 状态
- `GET /api/training/roll/health` - 健康检查

## 📚 参考资料

- [ROLL GitHub](https://github.com/alibaba/ROLL)
- [Ray 文档](https://docs.ray.io/)
