# ROLL 架构详细说明

**版本**: v1.0  
**日期**: 2026-01-21

---

## 🏗️ 架构总览

```
┌─────────────────────────────────────────────────────────┐
│              TypeScript/NestJS (生产环境)                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  DAGOrchestratorService                          │  │
│  │  ├─ RLIntegrationService                         │  │
│  │  ├─ TrajectoryCollectionService                  │  │
│  │  ├─ QualityScorerService                         │  │
│  │  └─ PolicyServiceManagerService                  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  RollClientService                                │  │
│  │  ├─ RollPolicyAdapterService                      │  │
│  │  ├─ RollTrajectoryAdapterService                  │  │
│  │  └─ RollRewardAdapterService                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                    ↕ HTTP API (REST)
┌─────────────────────────────────────────────────────────┐
│         Python Bridge Service (FastAPI)                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Worker 池管理                                    │  │
│  │  ├─ Actor-Workers (2)                            │  │
│  │  ├─ Reward-Workers (2)                           │  │
│  │  ├─ Policy-Workers (1)                           │  │
│  │  └─ Training-Workers (1)                          │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  负载均衡（轮询）                                  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  REST API 端点                                    │  │
│  │  ├─ /api/actor/generate-trajectory               │  │
│  │  ├─ /api/reward/compute                          │  │
│  │  ├─ /api/policy/predict                          │  │
│  │  └─ /api/training/*                              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                    ↕ Ray API
┌─────────────────────────────────────────────────────────┐
│                  Ray Workers (分布式)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Actor-Worker  │  │Reward-Worker │  │Policy-Worker│  │
│  │(轨迹生成)     │  │(奖励计算)    │  │(策略推理)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐                                      │
│  │Training      │                                      │
│  │Pipeline      │                                      │
│  │Worker        │                                      │
│  └──────────────┘                                      │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 数据流

### 1. 轨迹生成流程

```
User Request
    ↓
TypeScript (RLIntegrationService)
    ↓ HTTP API
Bridge Service
    ↓ Ray API
Actor-Worker
    ↓
Trajectory Data
    ↓
Ray Object Store
    ↓
TypeScript (存储到数据库)
```

### 2. 奖励计算流程

```
Trajectory Data
    ↓
TypeScript (QualityScorerService)
    ↓ HTTP API
Bridge Service
    ↓ Ray API
Reward-Worker
    ↓
Reward Score
    ↓
TypeScript (存储到数据库)
```

### 3. 策略推理流程

```
State Data
    ↓
TypeScript (PolicyServiceManagerService)
    ↓ HTTP API
Bridge Service
    ↓ Ray API
Policy-Worker
    ↓
Policy Action (ALLOW/REJECT/ADJUST/CLARIFY)
    ↓
TypeScript (执行决策)
```

### 4. 训练流程

```
Training Data
    ↓
TypeScript (TrainingPipelineService)
    ↓ HTTP API
Bridge Service
    ↓ Ray API
Training Pipeline Worker
    ↓
Ray Job (分布式训练)
    ↓
MLflow (模型注册)
    ↓
Model Version
```

---

## 🧩 组件说明

### TypeScript 层

#### RollClientService
- **职责**: TypeScript → Bridge Service 的 HTTP 客户端
- **功能**: 
  - 封装所有 Workers 的调用
  - 错误处理和重试
  - 健康检查

#### 适配器服务
- **RollPolicyAdapterService**: 适配 PolicyServiceManagerService
- **RollTrajectoryAdapterService**: 适配 TrajectoryCollectionService
- **RollRewardAdapterService**: 适配 QualityScorerService

**设计模式**: 适配器模式，允许现有服务可选使用 ROLL

---

### Bridge Service 层

#### Worker 池管理
- **职责**: 管理所有 Workers 的生命周期
- **功能**:
  - Worker 创建和初始化
  - 负载均衡（轮询）
  - 健康检查

#### REST API
- **职责**: 提供 HTTP API 接口
- **功能**:
  - 接收 TypeScript 请求
  - 路由到对应的 Worker
  - 返回结果

---

### Ray Workers 层

#### Actor-Worker
- **职责**: 生成轨迹数据
- **输入**: 用户请求、状态、动作
- **输出**: 轨迹数据 (s, a, r, s')

#### Reward-Worker
- **职责**: 计算奖励分数
- **输入**: 轨迹数据
- **输出**: 奖励分数和分解

#### Policy-Worker
- **职责**: 策略推理
- **输入**: 状态信息
- **输出**: 策略动作 (ALLOW/REJECT/ADJUST/CLARIFY)

#### Training Pipeline Worker
- **职责**: 管理训练任务
- **输入**: 训练配置和数据
- **输出**: Ray Job ID 和 MLflow Run ID

---

## 🔧 技术栈

### TypeScript 层
- **框架**: NestJS
- **HTTP 客户端**: fetch API
- **配置**: ConfigService

### Bridge Service 层
- **框架**: FastAPI
- **异步**: asyncio
- **HTTP 服务器**: uvicorn

### Ray Workers 层
- **框架**: Ray
- **语言**: Python
- **分布式**: Ray Cluster

---

## 📊 性能特性

### 1. 负载均衡
- **策略**: 轮询（Round-Robin）
- **优势**: 简单、公平
- **扩展**: 可配置 Worker 数量

### 2. 异步处理
- **Bridge Service**: 异步 FastAPI
- **Ray Workers**: 异步 Ray Tasks
- **优势**: 高吞吐量

### 3. 容错机制
- **降级**: 本地模拟模式
- **重试**: 可配置重试策略
- **健康检查**: 定期检查 Workers 状态

---

## 🔐 安全考虑

### 1. 网络隔离
- Bridge Service 只暴露必要端口
- Ray 集群内部通信
- 可配置防火墙规则

### 2. 认证授权
- 可添加 API Key 认证
- 可集成 OAuth2
- 可配置 CORS

### 3. 数据安全
- 轨迹数据加密（可选）
- PII 脱敏（可选）
- 审计日志

---

## 📈 扩展性

### 水平扩展
- **Workers**: 可增加 Worker 数量
- **Bridge Service**: 可部署多个实例
- **Ray Cluster**: 可添加更多节点

### 垂直扩展
- **资源**: 可增加 CPU/内存
- **配置**: 可调整 Worker 配置
- **优化**: 可优化算法实现

---

## 🎯 设计原则

### 1. 渐进式迁移
- 适配器模式，可选使用
- 配置控制，灵活启用
- 向后兼容，不影响现有服务

### 2. 解耦设计
- TypeScript 和 Python 分离
- Workers 独立运行
- 通过 API 通信

### 3. 可观测性
- 健康检查接口
- 状态监控接口
- 日志和指标

---

## 📚 参考资料

- [ROLL GitHub](https://github.com/alibaba/ROLL)
- [Ray 文档](https://docs.ray.io/)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [RollArc 论文](https://arxiv.org/abs/2512.22560)

---

**最后更新**: 2026-01-21
