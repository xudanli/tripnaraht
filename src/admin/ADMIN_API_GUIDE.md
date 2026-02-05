# 管理后台接口对接指南

本文档描述 TripNARA 管理后台需要对接的所有 API 接口。

---

## 一、管理后台功能模块

| 模块 | 功能 | 基础路径 |
|------|------|----------|
| 行程管理 | 行程列表、统计、导出 | `/api/trips/admin` |
| 地点管理 | POI 增删改查 | `/api/places/admin` |
| 决策监控 | 决策日志、统计、分析 | `/api/decision/admin` |
| 决策草案 | 草案统计 | `/api/decision-draft` |
| 规划工作台 | 会话、计划管理 | `/api/planning-workbench/admin` |
| 准备度配置 | Readiness Pack 管理 | `/api/readiness/admin` |
| RAG 系统 | 文档、缓存、指标 | `/api/rag` |
| 数据质量 | 地理数据质量监控 | `/api/admin/data-quality` |
| 目的地配置 | 澄清配置管理 | `/api/admin/destination-clarification` |
| Agent 监控 | Agent 运行状态 | `/api/agent/admin` |
| 用户管理 | 用户列表、统计 | `/api/users/admin` |
| 系统监控 | 性能、错误、缓存 | `/api/system/admin` |
| 联系消息 | 用户消息管理 | `/api/contact/admin` |

---

## 二、核心管理接口

### 2.1 行程管理 `/api/trips/admin`

#### 原型页面：行程管理列表

```
┌─────────────────────────────────────────────────────────────────┐
│  行程管理                                    [导出] [批量操作]   │
├─────────────────────────────────────────────────────────────────┤
│  筛选: [状态 ▼] [国家 ▼] [日期范围]  [搜索...]                  │
├─────────────────────────────────────────────────────────────────┤
│  ☑ ID        用户      目的地    状态    创建时间    操作       │
│  ─────────────────────────────────────────────────────────────  │
│  ☐ trip-001  张三      冰岛      进行中  2026-02-01  [详情]     │
│  ☐ trip-002  李四      挪威      已完成  2026-01-28  [详情]     │
│  ☐ trip-003  王五      冰岛      草稿    2026-02-03  [详情]     │
├─────────────────────────────────────────────────────────────────┤
│  共 156 条  < 1 2 3 4 5 >                                       │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/trips/admin` | 获取行程列表（分页、筛选） |
| GET | `/api/trips/admin/stats` | 获取统计数据 |
| GET | `/api/trips/admin/:id` | 获取行程详情 |
| GET | `/api/trips/admin/:id/export` | 导出行程数据 |
| POST | `/api/trips/admin/batch` | 批量操作 |

**示例：获取行程列表**

```bash
GET /api/trips/admin?page=1&limit=20&status=active&countryCode=IS

Response:
{
  "data": {
    "items": [...],
    "total": 156,
    "page": 1,
    "limit": 20
  }
}
```

**示例：获取统计数据**

```bash
GET /api/trips/admin/stats?startDate=2026-01-01&endDate=2026-02-03

Response:
{
  "data": {
    "total_trips": 156,
    "active_trips": 45,
    "completed_trips": 89,
    "by_country": {
      "IS": 78,
      "NO": 45,
      "GL": 33
    },
    "by_status": {
      "draft": 22,
      "active": 45,
      "completed": 89
    }
  }
}
```

---

### 2.2 决策监控 `/api/decision/admin`

#### 原型页面：决策分析仪表盘

```
┌─────────────────────────────────────────────────────────────────┐
│  决策分析                                                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ 总决策数     │  │ 现实驱动率   │  │ 平均置信度   │              │
│  │   12,456    │  │    78.5%    │  │    0.82     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  决策来源分布                      Persona 触发分布              │
│  ┌────────────────────┐          ┌────────────────────┐        │
│  │ ██████████ API 65% │          │ ████████ Safety 40%│        │
│  │ ████ Cache 20%     │          │ ██████ Cost 30%    │        │
│  │ ██ Heuristic 15%   │          │ ████ Experience 20%│        │
│  └────────────────────┘          │ ██ Comfort 10%     │        │
│                                  └────────────────────┘        │
├─────────────────────────────────────────────────────────────────┤
│  HEURISTIC 热点（需关注）                                        │
│  ─────────────────────────────────────────────────────────────  │
│  1. 冰岛高地 F-road 通行判断 - 使用启发式 42 次                   │
│  2. 格陵兰天气预测 - 缺少实时数据 28 次                           │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/decision/admin/logs` | 决策日志列表 |
| GET | `/api/decision/admin/logs/:id` | 决策日志详情 |
| GET | `/api/decision/admin/stats` | 决策统计 |
| GET | `/api/decision/admin/analytics` | 决策分析（含热点） |

**示例：获取决策统计**

```bash
GET /api/decision/admin/stats?startDate=2026-01-01&countryCode=IS

Response:
{
  "data": {
    "distribution": {
      "total": 12456,
      "bySource": {
        "REALTIME_API": 8100,
        "CACHED": 2491,
        "HEURISTIC": 1865
      },
      "bySourcePercentage": {
        "REALTIME_API": 0.65,
        "CACHED": 0.20,
        "HEURISTIC": 0.15
      },
      "realityDrivenRatio": 0.785
    },
    "personaStats": {
      "SAFETY_GUARDIAN": 4982,
      "COST_OPTIMIZER": 3737,
      "EXPERIENCE_SEEKER": 2491,
      "COMFORT_KEEPER": 1246
    }
  }
}
```

**示例：获取分析数据（含热点）**

```bash
GET /api/decision/admin/analytics?startDate=2026-01-01

Response:
{
  "data": {
    "stats": {...},
    "heuristicHotspots": [
      {
        "location": "Iceland F-roads",
        "count": 42,
        "reason": "缺少实时路况 API"
      }
    ],
    "personaStats": {...},
    "overallScore": 0.82
  }
}
```

---

### 2.3 决策草案管理 `/api/decision-draft/admin`

#### 原型页面：决策草案监控仪表盘

```
┌─────────────────────────────────────────────────────────────────┐
│  决策草案监控                                    [导出] [刷新]   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │ 总决策数     │  │ 成功率       │  │ 平均耗时     │  │ 用户满意度│ │
│  │   256       │  │   94.2%     │  │   2.5s      │  │   4.2/5  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  决策类型分布                       用户风格分布                  │
│  ┌────────────────────┐          ┌────────────────────┐        │
│  │ ██████████ 路线 45%│          │ ████████ 冒险型 35% │        │
│  │ ██████ POI 30%     │          │ ██████ 谨慎型 30%   │        │
│  │ ████ 住宿 15%      │          │ ████ 平衡型 35%     │        │
│  │ ██ 预算 10%        │          └────────────────────┘        │
│  └────────────────────┘                                        │
├─────────────────────────────────────────────────────────────────┤
│  最近决策草案                                                    │
│  ─────────────────────────────────────────────────────────────  │
│  ID           行程        目的地    状态    步骤数  创建时间      │
│  draft-001    trip-123    冰岛     完成     12    02-03 10:00  │
│  draft-002    trip-456    挪威     进行中    8    02-03 09:30  │
├─────────────────────────────────────────────────────────────────┤
│  异常监控 (最近24h)                                              │
│  🔴 错误: 3    ⚠️ 警告: 8    ℹ️ 信息: 12                         │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/decision-draft/stats` | 基础统计 |
| GET | `/api/decision-draft/admin/list` | 分页列表（支持筛选排序） |
| GET | `/api/decision-draft/admin/quality-stats` | 质量统计（成功率、用户满意度） |
| GET | `/api/decision-draft/admin/user-styles` | 用户风格汇总 |
| GET | `/api/decision-draft/admin/anomalies` | 异常监控 |
| GET | `/api/decision-draft/:draftId` | 草案详情 |
| GET | `/api/decision-draft/:draftId/replay` | 决策回放数据 |
| GET | `/api/decision-draft/:draftId/debug-info` | 调试信息 |

**示例：获取分页列表**

```bash
GET /api/decision-draft/admin/list?page=1&pageSize=20&status=completed&sortBy=created_at&sortOrder=desc

Response:
{
  "items": [
    {
      "draft_id": "draft-001",
      "trip_id": "trip-123",
      "destination": "冰岛",
      "status": "completed",
      "step_count": 12,
      "user_mode": "toc",
      "created_at": "2026-02-03T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 256,
    "totalPages": 13
  },
  "filters": {
    "status": "completed"
  }
}
```

**示例：获取质量统计**

```bash
GET /api/decision-draft/admin/quality-stats?timeRange=week

Response:
{
  "overview": {
    "total_decisions": 256,
    "success_rate": 94.2,
    "avg_decision_time_ms": 2500,
    "avg_steps_per_draft": 8.5
  },
  "quality_metrics": {
    "user_acceptance_rate": 85,
    "user_modification_rate": 10,
    "user_rejection_rate": 5,
    "avg_user_rating": 4.2
  },
  "decision_types": [
    { "type": "route_planning", "count": 115, "success_rate": 96 },
    { "type": "poi_selection", "count": 77, "success_rate": 92 },
    { "type": "accommodation", "count": 38, "success_rate": 95 }
  ],
  "trends": {
    "period": "week",
    "data": [
      { "date": "2026-02-01", "total": 45, "success": 42, "failed": 3 },
      { "date": "2026-02-02", "total": 52, "success": 50, "failed": 2 }
    ]
  },
  "top_issues": [
    { "issue": "数据源超时", "count": 3, "percentage": 15 },
    { "issue": "约束冲突", "count": 2, "percentage": 10 }
  ]
}
```

**示例：获取用户风格汇总**

```bash
GET /api/decision-draft/admin/user-styles?page=1&pageSize=20

Response:
{
  "summary": {
    "total_users_analyzed": 128,
    "style_distribution": [
      { "style": "adventurous", "count": 45, "percentage": 35 },
      { "style": "cautious", "count": 38, "percentage": 30 },
      { "style": "balanced", "count": 45, "percentage": 35 }
    ],
    "avg_decision_confidence": 0.78
  },
  "users": [
    {
      "user_id": "user-001",
      "style_type": "adventurous",
      "decision_count": 15,
      "acceptance_rate": 92,
      "avg_modification_count": 1,
      "top_preferences": ["自然风光", "冒险活动"],
      "last_active": "2026-02-03T10:00:00Z"
    }
  ],
  "pagination": {...},
  "behavior_patterns": [
    {
      "pattern": "detail_explorer",
      "description": "倾向于查看每个决策的详细信息",
      "user_count": 38,
      "examples": ["查看所有备选方案", "展开风险详情"]
    }
  ]
}
```

**示例：获取异常监控**

```bash
GET /api/decision-draft/admin/anomalies?severity=error&timeRange=day&limit=50

Response:
{
  "summary": {
    "total_anomalies": 23,
    "errors": 3,
    "warnings": 8,
    "infos": 12
  },
  "anomalies": [
    {
      "id": "anomaly-001",
      "severity": "error",
      "type": "decision_step_failed",
      "message": "决策步骤 \"路线规划\" 执行失败",
      "draft_id": "draft-123",
      "user_id": "user-001",
      "timestamp": "2026-02-03T09:30:00Z",
      "context": {
        "step_type": "route_planning",
        "error_code": "TIMEOUT"
      },
      "resolved": false
    }
  ],
  "trending_issues": [
    { "type": "decision_step_failed", "count": 3, "trend": "stable" }
  ]
}
```

---

### 2.4 规划工作台管理 `/api/planning-workbench/admin`

#### 原型页面：规划会话管理

```
┌─────────────────────────────────────────────────────────────────┐
│  规划会话管理                                    [统计概览]      │
├─────────────────────────────────────────────────────────────────┤
│  会话列表                                                       │
│  ─────────────────────────────────────────────────────────────  │
│  ID            行程ID      状态      计划数   创建时间           │
│  session-001   trip-123    active    3       2026-02-03 10:00  │
│  session-002   trip-456    completed 2       2026-02-02 15:30  │
├─────────────────────────────────────────────────────────────────┤
│  计划列表                                                       │
│  ─────────────────────────────────────────────────────────────  │
│  ID          会话ID        类型      状态      创建时间          │
│  plan-001    session-001   MAIN      active    2026-02-03 10:05│
│  plan-002    session-001   BUDGET    pending   2026-02-03 10:10│
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/planning-workbench/admin/sessions` | 会话列表 |
| GET | `/api/planning-workbench/admin/sessions/:id` | 会话详情 |
| GET | `/api/planning-workbench/admin/sessions/stats` | 会话统计 |
| GET | `/api/planning-workbench/admin/plans` | 计划列表 |
| GET | `/api/planning-workbench/admin/plans/:id` | 计划详情 |

---

### 2.5 地点管理 `/api/places/admin`

#### 原型页面：POI 管理

```
┌─────────────────────────────────────────────────────────────────┐
│  地点管理                                    [新增] [批量导入]   │
├─────────────────────────────────────────────────────────────────┤
│  筛选: [类型 ▼] [国家 ▼] [城市 ▼]  [搜索...]                    │
├─────────────────────────────────────────────────────────────────┤
│  ID      名称           类型      城市      坐标        操作     │
│  ─────────────────────────────────────────────────────────────  │
│  1       黄金瀑布       景点      冰岛      64.3,-20.1  [编辑]   │
│  2       蓝湖温泉       温泉      冰岛      63.9,-22.4  [编辑]   │
│  3       雷克雅未克机场  机场      冰岛      64.1,-21.9  [编辑]   │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/places/admin` | 地点列表 |
| GET | `/api/places/admin/:id` | 地点详情 |
| POST | `/api/places/admin` | 创建地点 |
| PUT | `/api/places/admin/:id` | 更新地点 |
| DELETE | `/api/places/admin/:id` | 删除地点 |
| POST | `/api/places/admin/batch` | 批量获取 |

---

### 2.6 准备度配置 `/api/readiness/admin`

#### 原型页面：Readiness Pack 管理

```
┌─────────────────────────────────────────────────────────────────┐
│  准备度配置                                          [新增]      │
├─────────────────────────────────────────────────────────────────┤
│  Pack 列表                                                      │
│  ─────────────────────────────────────────────────────────────  │
│  ID      名称           目的地    检查项数   创建时间    操作     │
│  1       冰岛冬季准备   IS        12        2026-01-01  [编辑]   │
│  2       挪威峡湾准备   NO        8         2026-01-15  [编辑]   │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/readiness/admin/packs` | Pack 列表 |
| GET | `/api/readiness/admin/packs/:id` | Pack 详情 |
| POST | `/api/readiness/admin/packs` | 创建 Pack |
| PUT | `/api/readiness/admin/packs/:id` | 更新 Pack |
| DELETE | `/api/readiness/admin/packs/:id` | 删除 Pack |

---

### 2.7 Agent 监控 `/api/agent/admin`

#### 原型页面：Agent 运行监控

```
┌─────────────────────────────────────────────────────────────────┐
│  Agent 监控                                                     │
├─────────────────────────────────────────────────────────────────┤
│  运行统计                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ 总运行数     │  │ 成功率      │  │ 平均耗时     │              │
│  │   5,678     │  │   96.5%     │  │   2.3s      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  最近运行                                                       │
│  ─────────────────────────────────────────────────────────────  │
│  ID          类型          状态      耗时      时间              │
│  run-001     route_plan    success   1.8s      10:30:05        │
│  run-002     chat          success   0.5s      10:29:58        │
│  run-003     route_plan    failed    -         10:29:45        │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/agent/admin/runs/stats` | 运行统计 |
| GET | `/api/agent/admin/performance` | 性能指标 |
| GET | `/api/agent/admin/runs` | 运行列表 |
| GET | `/api/agent/admin/runs/:id` | 运行详情 |
| GET | `/api/agent/admin/attempts` | 尝试列表 |
| GET | `/api/agent/admin/attempts/:id` | 尝试详情 |
| POST | `/api/agent/admin/runs/:id/cancel` | 取消运行 |

---

### 2.8 RAG 系统 `/api/rag`

#### 原型页面：知识库管理

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/rag/stats` | RAG 统计 |
| GET | `/api/rag/documents` | 文档列表 |
| GET | `/api/rag/documents/:id` | 文档详情 |
| PUT | `/api/rag/documents/:id` | 更新文档 |
| DELETE | `/api/rag/documents/:id` | 删除文档 |
| GET | `/api/rag/cache/stats` | 缓存统计 |
| POST | `/api/rag/cache/clear` | 清除缓存 |
| GET | `/api/rag/monitoring/metrics` | 监控指标 |
| GET | `/api/rag/monitoring/performance` | 性能数据 |
| GET | `/api/rag/monitoring/quality` | 质量数据 |
| GET | `/api/rag/monitoring/cost` | 成本数据 |

---

### 2.9 数据质量 `/api/admin/data-quality`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/data-quality/dashboard` | 质量仪表盘 |
| GET | `/api/admin/data-quality/geographic/dashboard` | 地理数据仪表盘 |
| GET | `/api/admin/data-quality/geographic/assess/:countryCode` | 国家数据评估 |
| POST | `/api/admin/data-quality/physical-reality/upload` | 上传物理数据 |
| POST | `/api/admin/data-quality/validate/coordinates` | 坐标验证 |

---

### 2.10 目的地配置 `/api/admin/destination-clarification`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/destination-clarification` | 配置列表 |
| GET | `/api/admin/destination-clarification/:destinationCode` | 配置详情 |
| POST | `/api/admin/destination-clarification/:destinationCode` | 更新配置 |
| PATCH | `/api/admin/destination-clarification/:destinationCode/enable` | 启用 |
| PATCH | `/api/admin/destination-clarification/:destinationCode/disable` | 禁用 |
| POST | `/api/admin/destination-clarification/:destinationCode/test` | 测试配置 |

---

### 2.11 用户管理 `/api/users/admin`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/users/admin` | 用户列表 |
| GET | `/api/users/admin/stats` | 用户统计 |
| GET | `/api/users/admin/:id` | 用户详情 |
| GET | `/api/users/admin/:id/detail` | 用户详细信息 |
| PUT | `/api/users/admin/:id` | 更新用户 |
| DELETE | `/api/users/admin/:id` | 删除用户 |

---

### 2.12 系统监控 `/api/system/admin`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/system/admin/metrics` | 系统指标 |
| GET | `/api/system/admin/performance` | 性能数据 |
| GET | `/api/system/admin/errors` | 错误日志 |
| GET | `/api/system/admin/requests` | 请求日志 |
| GET | `/api/system/admin/database` | 数据库状态 |
| GET | `/api/system/admin/cache` | 缓存状态 |

---

### 2.13 联系消息 `/api/contact/admin`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/contact/admin/messages` | 消息列表 |
| GET | `/api/contact/admin/messages/:id` | 消息详情 |
| PUT | `/api/contact/admin/messages/:id/status` | 更新状态 |
| POST | `/api/contact/admin/messages/:id/reply` | 回复消息 |

---

### 2.14 Chain-of-Work 管理 `/api/chain-of-work/admin`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/chain-of-work/admin/stats` | 统计数据 |
| GET | `/api/chain-of-work/admin/draft` | 草案列表 |
| GET | `/api/chain-of-work/admin/draft/:draftId` | 草案详情 |
| POST | `/api/chain-of-work/admin/draft/batch` | 批量操作 |
| GET | `/api/chain-of-work/admin/execution` | 执行列表 |
| GET | `/api/chain-of-work/admin/execution/:executionId` | 执行详情 |
| GET | `/api/chain-of-work/admin/config` | 获取配置 |
| PUT | `/api/chain-of-work/admin/config` | 更新配置 |

---

## 三、管理后台仪表盘推荐

### 首页仪表盘应展示：

1. **核心指标卡片**
   - 总行程数 (`/api/trips/admin/stats`)
   - 活跃用户数 (`/api/users/admin/stats`)
   - 今日决策数 (`/api/decision/admin/stats`)
   - 系统健康度 (`/api/system/admin/metrics`)

2. **图表**
   - 行程趋势图（按日/周/月）
   - 决策来源分布饼图
   - Agent 运行成功率趋势

3. **告警列表**
   - HEURISTIC 热点 (`/api/decision/admin/analytics`)
   - 数据质量问题 (`/api/admin/data-quality/dashboard`)
   - 系统错误 (`/api/system/admin/errors`)

---

## 四、鉴权说明

所有 Admin 接口需要以下权限之一：
- `admin` 角色
- `ops` 角色
- `studio` 角色（部分接口）

请求头需携带 JWT Token：

```bash
Authorization: Bearer <your-admin-jwt-token>
```

---

## 五、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02-03 | 初始版本 |
