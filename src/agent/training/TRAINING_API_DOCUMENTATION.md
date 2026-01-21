# RL Training API 接口文档

**版本**: 1.0.0  
**基础路径**: `/api/training`  
**创建日期**: 2026-01-21

---

## 接口分类总览

| 分类 | 使用方 | 说明 |
|------|--------|------|
| **后端系统接口** | 后端服务、Orchestrator | 自动调用，无需人工干预 |
| **管理后台接口** | 运维人员、ML工程师 | 管理训练、模型、监控 |
| **用户前端接口** | C端用户 | 反馈收集、解释展示 |

---

## 一、后端系统接口（Backend Internal）

> 这些接口由后端服务自动调用，不暴露给前端

### 1.1 轨迹收集

| 端点 | 方法 | 说明 |
|------|------|------|
| `/trajectories/collect` | POST | Orchestrator完成规划后自动收集 |
| `/trajectories/:id/validate` | POST | 验证轨迹质量 |
| `/trajectories/by-request/:requestId` | GET | 根据请求ID查找轨迹 |

### 1.2 策略推理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/policy/predict` | POST | DAGOrchestrator执行前调用 |
| `/safety/constraints/check` | POST | 检查安全约束 |
| `/safety/risk-events/classify` | POST | 风险事件分类 |
| `/safety/risk-events/:id/handle` | POST | 处理风险事件 |

---

## 二、管理后台接口（Admin Dashboard）

> 供 ML 工程师、运维人员使用

### 2.1 训练管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/training/jobs` | POST | 创建训练任务 |
| `/training/jobs/:jobId/start` | POST | 启动训练任务 |
| `/training/jobs/:jobId` | GET | 获取任务状态 |
| `/training/jobs` | GET | 列出所有任务 |

### 2.2 模型管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/models/register` | POST | 注册新模型 |
| `/models/:version` | GET | 获取模型详情 |
| `/models` | GET | 列出所有模型 |
| `/models/:version/rollback` | POST | 回滚到指定版本 |

### 2.3 数据集管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/versions/create` | POST | 创建数据集版本 |
| `/versions/:version` | GET | 获取版本详情 |
| `/versions` | GET | 列出所有版本 |
| `/versions/:v1/compare/:v2` | GET | 比较两个版本 |

### 2.4 评测管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/evaluation/router` | POST | 评测Router组件 |
| `/evaluation/gate` | POST | 评测Gate组件 |
| `/evaluation/itinerary` | POST | 评测Itinerary组件 |
| `/evaluation/full-pipeline` | POST | 全流程评测 |
| `/evaluation/ope/report` | POST | 生成OPE报告 |
| `/evaluation/replay/compare` | POST | 回放对比 |
| `/evaluation/regression-gate/check` | POST | 回归门检查 |

### 2.5 监控指标

| 端点 | 方法 | 说明 |
|------|------|------|
| `/metrics/collection-stats` | GET | 轨迹收集统计 |
| `/metrics/training-quality` | GET | 训练质量指标 |
| `/monitoring/collapse-risk` | GET | 模型坍塌风险 |
| `/analysis/quality` | GET | 训练质量分析 |
| `/policy/health` | GET | 策略服务健康 |
| `/policy/metrics` | GET | 策略服务指标 |

### 2.6 A/B测试

| 端点 | 方法 | 说明 |
|------|------|------|
| `/product/ab-test/create` | POST | 创建A/B测试 |
| `/product/ab-test/assign` | POST | 分配用户到测试组 |
| `/product/ab-test/analyze` | POST | 分析测试结果 |

### 2.7 安全审计

| 端点 | 方法 | 说明 |
|------|------|------|
| `/safety/compliance/audit/record` | POST | 记录审计 |
| `/safety/compliance/audit/report` | GET | 获取审计报告 |
| `/safety/red-team/run` | POST | 运行红队测试 |
| `/safety/red-team/test-cases` | GET | 获取测试用例 |

### 2.8 ETL与导出

| 端点 | 方法 | 说明 |
|------|------|------|
| `/etl/extract` | POST | 提取轨迹数据 |
| `/etl/export` | POST | 导出轨迹数据 |
| `/batches/prepare` | POST | 准备训练批次 |
| `/batches/:id/export/jsonl` | GET | 导出JSONL |
| `/batches/:id/export/json` | GET | 导出JSON |

---

## 三、用户前端接口（User-Facing）

> 供 C 端用户使用的接口

### 3.1 用户反馈

| 端点 | 方法 | 说明 |
|------|------|------|
| `/product/feedback/track-action` | POST | 追踪用户操作 |
| `/product/feedback/collect` | POST | 收集用户反馈 |
| `/product/feedback/analyze` | GET | 分析反馈数据 |

### 3.2 决策解释

| 端点 | 方法 | 说明 |
|------|------|------|
| `/product/explainable/generate` | POST | 生成决策解释 |

### 3.3 提示生成

| 端点 | 方法 | 说明 |
|------|------|------|
| `/enhancement/clarification-prompt` | POST | 生成澄清问题 |
| `/enhancement/risk-prompt` | POST | 生成风险提示 |

### 3.4 质量评分

| 端点 | 方法 | 说明 |
|------|------|------|
| `/enhancement/quality/score` | POST | 质量评分 |

### 3.5 领域知识

| 端点 | 方法 | 说明 |
|------|------|------|
| `/enhancement/domain-expert/red-line-rules` | GET | 获取红线规则 |
| `/enhancement/domain-expert/seasonal-risks` | GET | 获取季节性风险 |

---

## 四、接口调用关系图

```
用户前端 (C端)
├── /product/feedback/track-action    用户操作追踪
├── /product/feedback/collect         用户反馈收集
├── /product/explainable/generate     决策解释
├── /enhancement/clarification-prompt 澄清提示
└── /enhancement/risk-prompt          风险提示

管理后台 (Admin)
├── 训练: /training/jobs, /training/jobs/:id
├── 模型: /models/register, /models/:version/rollback
├── 监控: /policy/health, /metrics/collection-stats
├── 评测: /evaluation/ope/report, /evaluation/regression-gate/check
└── A/B测试: /product/ab-test/create, /product/ab-test/analyze

后端系统 (Internal)
├── /trajectories/collect             轨迹收集
├── /policy/predict                   策略推理
├── /safety/constraints/check         约束检查
└── /safety/risk-events/classify      风险分类

Python 服务 (ML Platform)
├── Training Service (8001)
├── Policy Service (8002)
└── LLM Judge Service (8003)
```

---

## 五、详细接口说明

详见: `TRAINING_API_DETAILS.md`
