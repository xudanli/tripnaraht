# RL Training 管理后台 API 文档

**基础路径**: `/api/training`  
**使用方**: 运维人员、ML工程师

---

## 枚举选项接口

### 获取所有枚举选项
```
GET /api/training/options/all
```

### 获取指定枚举选项
```
GET /api/training/options/{enumKey}
```

**可用的 enumKey:**
- `modelType` - 模型类型
- `baseModel` - 基础模型
- `trainingStatus` - 训练状态
- `trainingType` - 训练类型
- `sevLevel` - SEV级别
- `riskCategory` - 风险类别
- `riskHandleAction` - 风险处理动作
- `riskEventStatus` - 风险事件状态
- `constraintType` - 约束类型
- `constraintSeverity` - 约束严重程度
- `constraintAction` - 约束动作
- `userActionType` - 用户行为类型
- `decisionType` - 决策类型
- `decisionResult` - 决策结果
- `evidenceType` - 证据类型
- `visualizationType` - 可视化类型
- `language` - 语言
- `season` - 季节
- `timeRange` - 时间范围
- `dangerLevel` - 危险等级
- `executability` - 可执行性
- `riskType` - 风险类型
- `incidentType` - 事件类型
- `trendType` - 趋势类型
- `sortOrder` - 排序方式

---

## 枚举值定义速查表

### 一、训练相关

#### 模型类型 (modelType)

| 值 | 英文说明 | 中文说明 |
|----|----------|----------|
| `SFT` | Supervised Fine-Tuning | 监督微调 |
| `RLHF` | RL from Human Feedback | 人类反馈强化学习 |
| `RL` | Reinforcement Learning | 纯强化学习 |
| `DPO` | Direct Preference Optimization | 直接偏好优化 |
| `PPO` | Proximal Policy Optimization | 近端策略优化 |

#### 基础模型 (baseModel)

| 值 | 显示名称 | 提供商 |
|----|----------|--------|
| `claude-3-opus` | Claude 3 Opus | Anthropic |
| `claude-3-sonnet` | Claude 3 Sonnet | Anthropic |
| `claude-3-haiku` | Claude 3 Haiku | Anthropic |
| `gpt-4-turbo` | GPT-4 Turbo | OpenAI |
| `gpt-4o` | GPT-4o | OpenAI |
| `gpt-4o-mini` | GPT-4o Mini | OpenAI |
| `llama-3-70b` | Llama 3 70B | Meta |
| `llama-3-8b` | Llama 3 8B | Meta |
| `mistral-large` | Mistral Large | Mistral |
| `mistral-medium` | Mistral Medium | Mistral |
| `qwen-72b` | Qwen 72B | Alibaba |
| `deepseek-v2` | DeepSeek V2 | DeepSeek |
| `custom` | 自定义模型 | Custom |

#### 训练状态 (trainingStatus)

| 值 | 中文 | 颜色 |
|----|------|------|
| `PENDING` | 等待中 | gray |
| `RUNNING` | 运行中 | blue |
| `COMPLETED` | 已完成 | green |
| `FAILED` | 失败 | red |
| `CANCELLED` | 已取消 | orange |

#### 训练类型 (trainingType)

| 值 | 说明 |
|----|------|
| `PREFERENCE_COMPARISON` | 偏好对比训练 |
| `SCORE_REGRESSION` | 分数回归训练 |

### 二、安全合规相关

#### SEV级别 (sevLevel)

| 值 | 中文 | 颜色 | 说明 |
|----|------|------|------|
| `SEV-1` | 严重 | red | 需要立即处理 |
| `SEV-2` | 高 | orange | 数小时内处理 |
| `SEV-3` | 中 | yellow | 数天内处理 |
| `SEV-4` | 低 | green | 常规处理 |

#### 风险类别 (riskCategory)

| 值 | 中文 | 图标 |
|----|------|------|
| `SAFETY` | 安全 | shield |
| `LEGAL` | 法律 | gavel |
| `HEALTH` | 健康 | heart |
| `FINANCIAL` | 财务 | dollar |
| `LOGISTICS` | 后勤 | truck |
| `WEATHER` | 天气 | cloud |

#### 风险处理动作 (riskHandleAction)

| 值 | 中文 | 颜色 |
|----|------|------|
| `APPROVE` | 批准 | green |
| `REJECT` | 拒绝 | red |
| `MITIGATE` | 缓解 | orange |

#### 约束类型 (constraintType)

| 值 | 中文 |
|----|------|
| `GEOGRAPHIC` | 地理约束 |
| `TEMPORAL` | 时间约束 |
| `COMPLIANCE` | 合规约束 |
| `USER_PREFERENCE` | 用户偏好约束 |

#### 约束严重程度 (constraintSeverity)

| 值 | 中文 | 说明 |
|----|------|------|
| `HARD` | 硬约束 | 必须满足，不可违反 |
| `SOFT` | 软约束 | 应该满足，但可放宽 |

### 三、用户行为相关

#### 用户行为类型 (userActionType)

| 值 | 中文 | 图标 |
|----|------|------|
| `ADOPT` | 采纳 | check |
| `EDIT` | 编辑 | edit |
| `EXPORT` | 导出 | download |
| `ABANDON` | 放弃 | close |
| `FEEDBACK` | 反馈 | message |

### 四、通用枚举

#### 语言 (language)

| 值 | 显示 |
|----|------|
| `en` | English |
| `zh` | 中文 |

#### 季节 (season)

| 值 | 中文 | 月份 |
|----|------|------|
| `SPRING` | 春季 | 3,4,5 |
| `SUMMER` | 夏季 | 6,7,8 |
| `AUTUMN` | 秋季 | 9,10,11 |
| `WINTER` | 冬季 | 12,1,2 |

#### 危险等级 (dangerLevel)

| 值 | 中文 | 颜色 |
|----|------|------|
| `LOW` | 低 | green |
| `MEDIUM` | 中 | yellow |
| `HIGH` | 高 | orange |
| `CRITICAL` | 严重 | red |

#### 可执行性 (executability)

| 值 | 中文 | 颜色 |
|----|------|------|
| `EXECUTABLE` | 可执行 | green |
| `PARTIALLY_EXECUTABLE` | 部分可执行 | yellow |
| `NOT_EXECUTABLE` | 不可执行 | red |

### 五、决策相关枚举

#### 决策类型 (decisionType)

| 值 | 中文 |
|----|------|
| `PLAN_GENERATION` | 计划生成 |
| `ROUTE_SELECTION` | 路线选择 |
| `POI_RECOMMENDATION` | POI推荐 |
| `CONSTRAINT_CHECK` | 约束检查 |
| `RISK_ASSESSMENT` | 风险评估 |
| `USER_CLARIFICATION` | 用户澄清 |

#### 决策结果 (decisionResult)

| 值 | 中文 |
|----|------|
| `APPROVED` | 已批准 |
| `REJECTED` | 已拒绝 |
| `MODIFIED` | 已修改 |
| `PENDING_APPROVAL` | 待批准 |

#### 证据类型 (evidenceType)

| 值 | 中文 |
|----|------|
| `GATE_RESULT` | 门控结果 |
| `COMPLIANCE_CHECK` | 合规检查 |
| `CONSTRAINT_CHECK` | 约束检查 |
| `USER_APPROVAL` | 用户批准 |
| `MODEL_DECISION` | 模型决策 |
| `RESEARCH_DATA` | 研究数据 |
| `USER_FEEDBACK` | 用户反馈 |

#### 可视化类型 (visualizationType)

| 值 | 中文 |
|----|------|
| `DECISION_TREE` | 决策树 |
| `EVIDENCE_GRAPH` | 证据图 |
| `TIMELINE` | 时间线 |

### 六、其他枚举

#### 风险事件状态 (riskEventStatus)

| 值 | 中文 |
|----|------|
| `PENDING` | 待处理 |
| `APPROVED` | 已批准 |
| `REJECTED` | 已拒绝 |
| `MITIGATED` | 已缓解 |

#### 约束动作 (constraintAction)

| 值 | 中文 |
|----|------|
| `BLOCK` | 阻止 |
| `WARN` | 警告 |
| `REQUIRE_APPROVAL` | 需要批准 |

#### 风险类型 (riskType)

| 值 | 中文 |
|----|------|
| `WEATHER` | 天气风险 |
| `SAFETY` | 安全风险 |
| `ACCESSIBILITY` | 可达性风险 |

#### 事件类型 (incidentType)

| 值 | 中文 |
|----|------|
| `ROUTE_BLOCKED` | 路线被阻止 |
| `WEATHER_HAZARD` | 天气危险 |
| `SAFETY_CONCERN` | 安全担忧 |
| `LEGAL_ISSUE` | 法律问题 |
| `RESOURCE_UNAVAILABLE` | 资源不可用 |

#### 趋势类型 (trendType)

| 值 | 中文 |
|----|------|
| `INCREASING` | 上升 |
| `DECREASING` | 下降 |
| `STABLE` | 稳定 |

#### 排序方式 (sortOrder)

| 值 | 中文 |
|----|------|
| `ASC` | 升序 |
| `DESC` | 降序 |

#### 时间范围 (timeRange)

| 值 | 中文 |
|----|------|
| `TODAY` | 今天 |
| `WEEK` | 本周 |
| `MONTH` | 本月 |
| `QUARTER` | 本季度 |
| `YEAR` | 今年 |
| `CUSTOM` | 自定义 |

---

## 一、训练管理

### POST `/jobs` - 创建训练任务

```json
// 请求
{
  "dataset_version": "v1.0.0",
  "model_config": {
    "model_type": "SFT",        // 枚举值，见上方表格
    "base_model": "claude-3-opus" // 枚举值，见上方表格
  },
  "training_config": {
    "batch_size": 32,
    "learning_rate": 0.0001,
    "num_epochs": 3
  }
}

// 响应
{
  "success": true,
  "data": {
    "job_id": "train_abc12345",
    "status": "PENDING"
  }
}
```

### 获取枚举选项接口

```
GET /training/options/model-types     → 获取模型类型枚举列表
GET /training/options/base-models     → 获取基础模型枚举列表
```

### POST `/training/jobs/:jobId/start` - 启动训练

### GET `/training/jobs/:jobId` - 获取任务状态

### GET `/training/jobs` - 列出所有任务

---

## 二、模型管理

### POST `/models/register` - 注册新模型

```json
// 请求
{
  "version": "v1.1.0",
  "path": "/models/tripnara/v1.1.0",
  "metrics": { "accuracy": 0.92, "loss": 0.18 },
  "tags": ["production"]
}
```

### GET `/models/:version` - 获取模型详情

### GET `/models` - 列出所有模型

### POST `/models/:version/rollback` - 回滚模型

```json
// 请求
{ "reason": "Performance degradation" }

// 响应
{
  "success": true,
  "data": {
    "previous_version": "v1.1.0",
    "current_version": "v1.0.0"
  }
}
```

---

## 三、数据集管理

### POST `/versions/create` - 创建数据集版本

```json
// 请求
{
  "filter": {
    "min_validation_score": 0.8,
    "country_code": "IS"
  },
  "metadata": { "description": "Iceland high-quality data" }
}

// 响应
{
  "success": true,
  "data": {
    "version": "v1.2.0",
    "trajectory_count": 5000
  }
}
```

### GET `/versions/:version` - 获取版本详情

### GET `/versions` - 列出所有版本

### GET `/versions/:v1/compare/:v2` - 比较两个版本

---

## 四、评测管理

### POST `/evaluation/router` - 评测Router组件

### POST `/evaluation/gate` - 评测Gate组件

### POST `/evaluation/itinerary` - 评测Itinerary组件

### POST `/evaluation/full-pipeline` - 全流程评测

### POST `/evaluation/ope/report` - OPE报告

```json
// 请求
{
  "model_version": "v1.1.0",
  "baseline_version": "v1.0.0"
}

// 响应
{
  "success": true,
  "data": {
    "metrics": {
      "is_improvement": 0.12,
      "dr_improvement": 0.15,
      "wdr_improvement": 0.14
    },
    "recommendation": "DEPLOY"
  }
}
```

### POST `/evaluation/replay/compare` - 回放对比

### POST `/evaluation/regression-gate/check` - 回归门检查

```json
// 响应
{
  "success": true,
  "data": {
    "passed": true,
    "checks": {
      "ope_improvement": { "value": 0.14, "threshold": 0.05, "passed": true },
      "regression_rate": { "value": 0.08, "threshold": 0.1, "passed": true }
    },
    "recommendation": "APPROVE_FOR_PRODUCTION"
  }
}
```

---

## 五、监控指标

### GET `/policy/health` - 策略服务健康

```json
// 响应
{
  "success": true,
  "data": {
    "status": "healthy",
    "model_loaded": true,
    "current_model_version": "v1.1.0",
    "qps": 150,
    "p95_latency_ms": 45,
    "error_rate": 0.001
  }
}
```

### GET `/policy/metrics` - 策略服务指标

### GET `/metrics/collection-stats` - 轨迹收集统计

### GET `/metrics/training-quality` - 训练质量指标

### GET `/monitoring/collapse-risk` - 模型坍塌风险

```json
// 响应
{
  "success": true,
  "data": {
    "risk_level": "LOW",
    "indicators": {
      "output_diversity": 0.85,
      "confidence_distribution": 0.78
    }
  }
}
```

---

## 六、A/B测试管理

### POST `/product/ab-test/create` - 创建A/B测试

```json
// 请求
{
  "name": "v1.1.0 vs v1.0.0",
  "control_model": "v1.0.0",
  "treatment_model": "v1.1.0",
  "traffic_percentage": 50,
  "metrics": ["success_rate", "user_satisfaction"]
}
```

### POST `/product/ab-test/assign` - 分配用户到测试组

### POST `/product/ab-test/analyze` - 分析测试结果

```json
// 响应
{
  "success": true,
  "data": {
    "metrics": {
      "success_rate": {
        "control": 0.85,
        "treatment": 0.89,
        "lift": 0.047,
        "p_value": 0.02,
        "significant": true
      }
    },
    "recommendation": "DEPLOY_TREATMENT"
  }
}
```

---

## 七、安全审计

### POST `/safety/compliance/audit/record` - 记录审计

### GET `/safety/compliance/audit/report` - 获取审计报告

### POST `/safety/red-team/run` - 运行红队测试

### GET `/safety/red-team/test-cases` - 获取测试用例

---

## 八、ETL与数据导出

### POST `/etl/extract` - 提取轨迹数据

### POST `/etl/export` - 导出轨迹数据

### POST `/batches/prepare` - 准备训练批次

### GET `/batches/:id/export/jsonl` - 导出JSONL

### GET `/batches/:id/export/json` - 导出JSON
