# Context API 使用指南

## 接口定位

### ✅ Context API = 智能体系统核心基础设施

**Context API 是智能体（Agent）系统的核心基础设施**，专门为智能体服务：

1. **智能体系统内部调用**（主要用途）
   - 为各个 Sub-Agents（Planner、Gatekeeper、CoreDecision、LocalInsight、Compliance、Narrator）构建 Context Package
   - 在 LangGraph 节点中构建上下文，供 LLM 使用
   - 压缩 Context 以优化 Token 使用
   - 投影状态为 Public/Private，保护隐私和减少 Token 消耗

2. **Skills 系统调用**
   - `context.build` skill 调用 ContextEngineerService
   - 其他 skills 通过 Skills Registry 调用 context.build

3. **系统监控和调试**
   - 获取 Context 构建指标
   - 监控 Token 使用情况
   - 调试 Context Package 构建问题

### 智能体系统中的使用场景

#### 1. LangGraph 节点中使用

```typescript
// 在 LangGraph 节点中构建上下文
import { buildContextForNode, writeBackFromNode } from '../../agent/context-engine/utils/langgraph-context-integration';

async function plannerNode(state: LangGraphState, contextEngineer: ContextEngineerService) {
  // 1. 构建上下文（节点开始）
  const ctx = await buildContextForNode(state, contextEngineer, {
    agent: 'PLANNER',
    phase: 'planning',
    tokenBudget: 3600,
    requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'],
  });
  
  // 2. 使用 Context Package 构建 prompt
  const prompt = buildPromptFromContextPackage(ctx.contextPackage);
  
  // 3. 调用 LLM
  const response = await llmService.call(prompt);
  
  // 4. 写入回写（节点结束）
  await writeBackFromNode(state, contextEngineer, {
    tripRunId: state.metadata?.tripRunId,
    attemptNumber: state.metadata?.attemptNumber || 1,
    scratchpad: {
      planOutline: '已完成的计划...',
      nextActions: ['decision.abuCheck'],
    },
  });
}
```

#### 2. Sub-Agents 中使用

- **PlannerAgent**: 构建规划上下文
- **GatekeeperAgent**: 构建安全规则上下文
- **CoreDecisionAgent**: 构建决策上下文
- **LocalInsightAgent**: 构建本地洞察上下文
- **ComplianceAgent**: 构建合规检查上下文
- **NarratorAgent**: 构建叙述上下文

#### 3. Skills 系统中使用

```typescript
// context.build skill 被其他 skills 调用
const contextBuildSkill = skillsRegistry.getSkill('context.build');
const result = await contextBuildSkill.execute({
  tripId: 'trip-123',
  phase: 'planning',
  agent: 'PLANNER',
  userQuery: '帮我规划冰岛7天行程',
});
```

### 不适合的场景

❌ **不适合前端直接调用**：
- Context API 是智能体系统的底层基础设施
- 前端应该通过更高层的接口（如 `/agent/route_and_run`、`/planning-workbench/execute`）来使用智能体功能
- 前端不需要了解 Context Package 的技术细节

❌ **不适合用户界面**：
- Context Package 是技术实现细节，用户不需要看到
- 用户看到的是规划结果，而不是 Context Package
- Context Package 是智能体内部的"工作内存"

## 接口分类

### 1. 智能体系统接口（当前 Context API）✅

**用途**: 智能体（Agent）系统核心基础设施

| 接口 | 用途 | 调用方 |
|------|------|--------|
| POST /context/build | 构建 Context Package | **Sub-Agents**、**LangGraph 节点**、**Skills** |
| POST /context/compress | 压缩 Context | ContextEngineerService（内部调用） |
| POST /context/project-state | 投影状态 | **LangGraph 节点** |
| POST /context/write-back | 写入回写 | **LangGraph 节点** |
| GET /context/metrics | 获取指标 | 监控系统、调试工具 |

**典型调用链**：
```
用户请求 
  → /agent/route_and_run 
    → ClaudeOrchestratorService 
      → LangGraph 节点 
        → buildContextForNode() 
          → POST /context/build ✅
        → LLM 调用
        → writeBackFromNode() 
          → POST /context/write-back ✅
```

### 2. 后台管理接口（需要创建）

**用途**: 后台管理系统使用

| 接口 | 用途 | 调用方 |
|------|------|--------|
| GET /context/admin/metrics | Context 指标统计 | 后台管理系统 |
| GET /context/admin/packages | Context Package 列表 | 后台管理系统 |
| GET /context/admin/packages/:id | Context Package 详情 | 后台管理系统 |
| GET /context/admin/analytics | Context 分析报告 | 后台管理系统 |

## 后台管理接口设计

### 应该创建的 Context 后台管理接口

#### 1. GET /context/admin/metrics - Context 指标统计

**用途**: 后台管理系统展示 Context 使用情况

**功能**:
- 总体统计（总构建次数、平均 Token、缓存命中率等）
- 按时间范围统计
- 按 Agent 分类统计
- 按 Phase 分类统计

**示例响应**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalBuilds": 1000,
      "avgTokens": 3200,
      "avgBuildTimeMs": 450,
      "cacheHitRate": 0.65,
      "compressionRate": 0.15
    },
    "byAgent": {
      "PLANNER": { "count": 500, "avgTokens": 3500 },
      "GATEKEEPER": { "count": 300, "avgTokens": 2000 }
    },
    "byPhase": {
      "planning": { "count": 800, "avgTokens": 3000 },
      "execution": { "count": 200, "avgTokens": 2500 }
    }
  }
}
```

#### 2. GET /context/admin/packages - Context Package 列表

**用途**: 查看历史构建的 Context Package

**功能**:
- 分页列表
- 按 tripId、phase、agent 筛选
- 按时间范围筛选
- 搜索功能

**查询参数**:
- `page`: 页码
- `limit`: 每页数量
- `tripId`: Trip ID 筛选
- `phase`: Phase 筛选
- `agent`: Agent 筛选
- `startTime`: 开始时间
- `endTime`: 结束时间
- `search`: 搜索关键词

#### 3. GET /context/admin/packages/:id - Context Package 详情

**用途**: 查看特定 Context Package 的详细信息

**功能**:
- 显示完整的 Context Package
- 显示所有 blocks 的详细信息
- 显示构建元数据
- 显示性能指标

#### 4. GET /context/admin/analytics - Context 分析报告

**用途**: 生成 Context 使用分析报告

**功能**:
- Token 使用趋势
- 缓存命中率趋势
- 压缩率分析
- 质量分布分析
- Top Block Types
- 性能瓶颈分析

## 完整的后台管理接口清单

### 用户管理
- ✅ GET /users/admin - 用户列表
- ✅ GET /users/admin/stats - 用户统计
- ✅ GET /users/admin/:id - 用户详情

### 地点管理
- ✅ GET /places/admin - 地点列表
- ✅ GET /places/admin/:id - 地点详情

### 行程管理
- ⚠️ GET /trips/admin - 行程列表（需要创建）
- ⚠️ GET /trips/admin/stats - 行程统计（需要创建）
- ⚠️ GET /trips/admin/:id - 行程详情（需要创建）

### 决策日志管理
- ⚠️ GET /decision/admin/logs - 决策日志列表（需要创建）
- ⚠️ GET /decision/admin/logs/:id - 决策日志详情（需要创建）
- ⚠️ GET /decision/admin/stats - 决策统计（已有 `/decision/monitoring/metrics`）

### Context 管理
- ❌ GET /context/admin/metrics - Context 指标统计（需要创建）
- ❌ GET /context/admin/packages - Context Package 列表（需要创建）
- ❌ GET /context/admin/packages/:id - Context Package 详情（需要创建）
- ❌ GET /context/admin/analytics - Context 分析报告（需要创建）

### 系统监控
- ✅ GET /system/health - 系统健康检查
- ✅ GET /system/info - 系统信息
- ⚠️ GET /system/admin/metrics - 系统指标（需要创建）

### 训练数据管理
- ✅ GET /training/admin/trajectories - 训练轨迹列表
- ✅ GET /training/admin/trajectories/:id - 训练轨迹详情
- ✅ GET /training/admin/stats - 训练统计

## 建议

### 1. Context API 保持为内部接口

- ✅ 保持当前的 Context API 作为内部服务接口
- ✅ 主要用于 Agent 系统内部调用和调试
- ✅ 不直接暴露给前端

### 2. 创建 Context 后台管理接口

- 📝 创建 `/context/admin/*` 系列接口
- 📝 用于后台管理系统展示 Context 使用情况
- 📝 提供统计、列表、详情、分析等功能

### 3. 统一后台管理接口规范

所有后台管理接口应该遵循以下规范：

- **路径前缀**: `/admin` 或 `/admin/{resource}`
- **认证**: 需要管理员权限（当前很多是 `@Public()`，应该改为需要认证）
- **分页**: 统一使用 `page` 和 `limit` 参数
- **筛选**: 支持常见筛选条件（时间范围、状态等）
- **搜索**: 支持关键词搜索
- **响应格式**: 统一使用 `successResponse` 格式

## 总结

| 接口类型 | 用途 | 调用方 | 示例 |
|---------|------|--------|------|
| **内部服务接口** | Agent 系统内部使用 | Agent 服务、Skills | `/context/build` |
| **后台管理接口** | 后台管理系统 | 后台管理前端 | `/context/admin/metrics` |
| **用户接口** | 用户功能 | 前端应用 | `/trips`, `/planning-workbench` |

### ✅ 核心结论

**Context API 是智能体系统的核心基础设施**，专门为智能体服务：

1. **主要调用方**：
   - Sub-Agents（Planner、Gatekeeper、CoreDecision 等）
   - LangGraph 节点（状态机流程中的各个节点）
   - Skills 系统（通过 `context.build` skill）

2. **核心作用**：
   - 为智能体构建"工作内存"（Context Package）
   - 让智能体在"干净、够用、可追溯"的上下文中工作
   - 优化 Token 使用，保护隐私

3. **不是用户接口**：
   - 前端不应该直接调用 Context API
   - 用户看到的是规划结果，而不是 Context Package
   - Context Package 是智能体内部的实现细节

如果需要后台管理功能，应该创建新的 `/context/admin/*` 系列接口。
