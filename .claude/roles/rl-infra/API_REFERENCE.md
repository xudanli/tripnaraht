# RL Infrastructure API 参考

**最后更新**：2025-01-21

本文档提供RL Infrastructure所有API端点的快速参考。

---

## 📋 目录

- [数据工程](#数据工程)
- [训练平台](#训练平台)
- [评测体系](#评测体系)
- [编排接入与观测](#编排接入与观测)
- [安全合规](#安全合规)
- [产品化](#产品化)
- [增强能力](#增强能力)

---

## 数据工程

### ETL操作

#### 抽取轨迹数据
```http
POST /training/etl/extract
Content-Type: application/json

{
  "trajectory_ids": ["traj_xxx"],
  "request_ids": ["req_xxx"],
  "min_validation_score": 0.8,
  "min_total_reward": 0,
  "model_version": "v1.0",
  "country_code": "IS",
  "date_range": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-31T23:59:59Z"
  },
  "limit": 1000,
  "offset": 0
}
```

#### 导出轨迹数据集
```http
POST /training/etl/export
Content-Type: application/json

{
  "trajectory_ids": ["traj_xxx"],
  "format": "jsonl",
  "output_dir": "./data/training"
}
```

### 数据质量

#### 检查数据质量
```http
POST /training/quality/check
Content-Type: application/json

{
  "trajectory_ids": ["traj_xxx"],
  "min_validation_score": 0.8
}
```

### 数据集版本管理

#### 创建数据集版本
```http
POST /training/versions/create
Content-Type: application/json

{
  "export_result": {...},
  "quality_result": {...},
  "data_source": {
    "total_trajectories": 1000
  }
}
```

#### 列出所有版本
```http
GET /training/versions
```

#### 获取指定版本
```http
GET /training/versions/v1.0.0
```

#### 对比两个版本
```http
GET /training/versions/v1.0.0/compare/v1.1.0
```

---

## 训练平台

### 训练任务管理

#### 创建训练任务
```http
POST /training/training/jobs
Content-Type: application/json

{
  "dataset_version": "v1.0.0",
  "model_config": {
    "model_type": "SFT"
  },
  "training_config": {
    "batch_size": 32,
    "learning_rate": 0.0001,
    "num_epochs": 3
  }
}
```

#### 启动训练
```http
POST /training/training/jobs/{jobId}/start
```

#### 获取训练任务状态
```http
GET /training/training/jobs/{jobId}
```

#### 列出所有训练任务
```http
GET /training/training/jobs
```

### 模型注册表

#### 注册模型
```http
POST /training/models/register
Content-Type: application/json

{
  "model_version": {
    "version": "v1.0.0",
    "model_path": "/path/to/model",
    "training_metrics": {...}
  },
  "eval_metrics": {
    "success_rate": 0.95
  }
}
```

#### 获取模型版本
```http
GET /training/models/v1.0.0
```

#### 列出所有模型版本
```http
GET /training/models
```

#### 回滚模型
```http
POST /training/models/v1.0.0/rollback
```

### PolicyService

#### 策略推理
```http
POST /training/policy/predict
Content-Type: application/json

{
  "request_id": "req_xxx",
  "state": {
    "user_request": "Plan a trip to Iceland"
  },
  "model_version": "v1.0.0",
  "experiment_id": "exp_001"
}
```

#### 健康检查
```http
GET /training/policy/health
```

#### 获取指标
```http
GET /training/policy/metrics
```

#### 部署模型
```http
POST /training/policy/deploy
Content-Type: application/json

{
  "model_version": "v1.0.0"
}
```

---

## 评测体系

### Eval Suite

#### Router评测
```http
POST /training/evaluation/router
Content-Type: application/json

{
  "model_version": "v1.0.0",
  "test_cases": [...]
}
```

#### Gate评测
```http
POST /training/evaluation/gate
Content-Type: application/json

{
  "model_version": "v1.0.0",
  "test_cases": [...]
}
```

#### Itinerary评测
```http
POST /training/evaluation/itinerary
Content-Type: application/json

{
  "model_version": "v1.0.0",
  "test_cases": [...]
}
```

#### 完整流程评测
```http
POST /training/evaluation/full-pipeline
Content-Type: application/json

{
  "model_version": "v1.0.0"
}
```

### OPE

#### 生成OPE报告
```http
POST /training/evaluation/ope/report
Content-Type: application/json

{
  "model_version": "v1.0.0",
  "baseline_version": "v0.9.0",
  "trajectory_ids": ["traj_xxx"]
}
```

### 回放对照

#### 对比baseline和新策略
```http
POST /training/evaluation/replay/compare
Content-Type: application/json

{
  "baseline_version": "v0.9.0",
  "new_policy_version": "v1.0.0",
  "trajectory_ids": ["traj_xxx"]
}
```

### 回归门槛

#### 检查回归门槛
```http
POST /training/evaluation/regression-gate/check
Content-Type: application/json

{
  "new_policy_version": "v1.0.0",
  "baseline_version": "v0.9.0",
  "comparison_result": {...}
}
```

---

## 编排接入与观测

### Policy集成

（通过PolicyOrchestratorIntegrationService在代码中调用）

### 观测

（通过ObservabilityService在代码中调用）

---

## 安全合规

### 约束检查

#### 检查规划约束
```http
POST /training/safety/constraints/check
Content-Type: application/json

{
  "itinerary": {...},
  "context": {
    "country_code": "IS",
    "season": "WINTER"
  }
}
```

### 风险事件管理

#### 分级风险事件
```http
POST /training/safety/risk-events/classify
Content-Type: application/json

{
  "request_id": "req_xxx",
  "violations": [...],
  "category": "SAFETY",
  "description": "High risk route detected"
}
```

#### 处置风险事件
```http
POST /training/safety/risk-events/{eventId}/handle
Content-Type: application/json

{
  "action": "APPROVE",
  "resolved_by": "user_xxx",
  "mitigation_details": "..."
}
```

### 合规审计

#### 记录决策审计
```http
POST /training/safety/compliance/audit/record
Content-Type: application/json

{
  "request_id": "req_xxx",
  "decision_type": "GATE_EVAL",
  "decision_result": "ALLOW",
  "constraint_check_result": {...},
  "context": {...}
}
```

#### 生成合规审计报告
```http
POST /training/safety/compliance/audit/report
Content-Type: application/json

{
  "period_start": "2025-01-01T00:00:00Z",
  "period_end": "2025-01-31T23:59:59Z"
}
```

### 安全红队

#### 运行红队测试
```http
POST /training/safety/red-team/run
Content-Type: application/json

{
  "test_case_ids": ["test_001", "test_002"]
}
```

#### 列出测试用例
```http
GET /training/safety/red-team/test-cases?category=HIGH_RISK_DESTINATION
```

---

## 产品化

### Reward定义

#### 计算Reward
```http
POST /training/product/reward/calculate
Content-Type: application/json

{
  "metrics": {
    "success_rate": 0.95,
    "satisfaction": 0.8,
    "cost": 0.3,
    "compliance_rate": 0.99
  },
  "weights": {
    "success_rate": 0.4,
    "satisfaction": 0.3,
    "cost": -0.2,
    "compliance_rate": 0.1
  }
}
```

### 用户反馈

#### 追踪用户行为
```http
POST /training/product/feedback/track-action
Content-Type: application/json

{
  "user_id": "user_xxx",
  "action_type": "ADOPT",
  "context": {
    "request_id": "req_xxx",
    "plan_id": "plan_xxx"
  }
}
```

#### 收集用户反馈
```http
POST /training/product/feedback/collect
Content-Type: application/json

{
  "user_id": "user_xxx",
  "request_id": "req_xxx",
  "plan_id": "plan_xxx",
  "feedback": {
    "satisfaction": 5,
    "comments": "Great plan!",
    "issues": []
  }
}
```

#### 分析用户反馈
```http
POST /training/product/feedback/analyze
Content-Type: application/json

{
  "start_date": "2025-01-01T00:00:00Z",
  "end_date": "2025-01-31T23:59:59Z"
}
```

### A/B测试

#### 创建A/B实验
```http
POST /training/product/ab-test/create
Content-Type: application/json

{
  "name": "Model v1.0 vs v0.9",
  "description": "Compare new model with baseline",
  "variants": [
    {
      "name": "Baseline",
      "model_version": "v0.9.0",
      "traffic_percentage": 50
    },
    {
      "name": "New Model",
      "model_version": "v1.0.0",
      "traffic_percentage": 50
    }
  ],
  "success_metrics": ["success_rate", "avg_reward"]
}
```

#### 分配用户到实验组
```http
POST /training/product/ab-test/assign
Content-Type: application/json

{
  "experiment_id": "exp_xxx",
  "request_id": "req_xxx",
  "user_id": "user_xxx"
}
```

#### 分析A/B实验结果
```http
POST /training/product/ab-test/analyze
Content-Type: application/json

{
  "experiment_id": "exp_xxx",
  "variant_metrics": [
    {
      "variant_id": "variant_1",
      "sample_size": 1000,
      "success_count": 950,
      "total_reward": 800,
      "total_latency_ms": 50000,
      "error_count": 10
    }
  ]
}
```

### 可解释输出

#### 生成可解释输出
```http
POST /training/product/explainable/generate
Content-Type: application/json

{
  "decision_log": [...],
  "evidence_refs": [...],
  "model_version": "v1.0.0",
  "trace_id": "trace_xxx"
}
```

---

## 增强能力

### UX设计

#### 获取追问话术
```http
GET /training/enhancement/clarification-prompt?scenario=MISSING_DESTINATION&missing_field=destination&language=en
```

#### 获取风险提示
```http
GET /training/enhancement/risk-prompt?sev_level=SEV-2&category=SAFETY&reason=High%20wind%20speed&language=en
```

### 质量评分

#### 质量评分（LLM Judge + RM）
```http
POST /training/enhancement/quality/score
Content-Type: application/json

{
  "plan": {...},
  "user_request": "Plan a trip to Iceland",
  "evidence": [...],
  "decision_log": [...],
  "use_rm": true
}
```

### RM训练

#### 训练Reward Model
```http
POST /training/enhancement/rm/train
Content-Type: application/json

{
  "training_type": "PREFERENCE_COMPARISON",
  "data": [
    {
      "chosen": {...},
      "rejected": {...},
      "context": {...}
    }
  ],
  "config": {
    "learning_rate": 0.0001,
    "batch_size": 32,
    "num_epochs": 3
  }
}
```

### 领域专家知识

#### 获取红线规则
```http
GET /training/enhancement/domain-expert/red-line-rules?destination=IS
```

#### 获取季节性风险
```http
GET /training/enhancement/domain-expert/seasonal-risks?destination=IS&month=12
```

---

## 📝 注意事项

1. **认证**：当前所有API端点都是`@Public()`，生产环境需要添加认证
2. **Python服务**：训练平台、PolicyService、LLM Judge需要Python服务支持
3. **数据源**：部分服务需要从数据库或配置文件加载实际数据
4. **集成**：需要集成到现有的Orchestrator、GatekeeperAgent等组件

---

**参考文档**：
- [实施计划](./IMPLEMENTATION_PLAN.md)
- [实施完成总结](./IMPLEMENTATION_COMPLETE_SUMMARY.md)
- [快速开始指南](./QUICK_START.md)
