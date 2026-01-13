# 智能体入口产品设计方案

**文档版本**: v1.0  
**撰写日期**: 2025-01-13  
**撰写角色**: 产品经理（Danny）  
**审核状态**: 待技术评审

---

## 执行摘要

**核心原则**：
1. **智能体统一入口只为具体行程服务** - 必须有 `trip_id`，只处理已创建行程的运营服务
2. **行程详情页只读** - 只能询问行程信息，不支持修改操作
3. **规划工作台可操作** - 支持创建、修改、对比、提交等规划操作
4. **其他页面智能体入口策略** - 无入口或默认绑定最新行程，支持切换

**关键决策**：
- 统一入口强制要求 `trip_id`（前端必须传入）
- 行程详情页智能体限制为查询类操作
- 其他页面通过"默认绑定最新行程"机制提供智能体入口

---

## 1. 页面分类与智能体入口策略

### 1.1 页面分类

| 页面类型 | 页面名称 | 智能体入口 | 入口策略 | 操作权限 |
|---------|---------|-----------|---------|---------|
| **行程详情页** | Trip Detail Page | ✅ 有 | 直接绑定当前行程 | 🔍 **只读**（查询类） |
| **规划工作台** | Planning Workbench | ✅ 有 | 独立入口，无需 trip_id | ✏️ **可操作**（规划类） |
| **行程列表页** | Trip List Page | ✅ 有 | 默认绑定最新行程，支持切换 | 🔍 **只读**（查询类） |
| **首页/仪表盘** | Home/Dashboard | ⚠️ 可选 | 默认绑定最新行程，支持切换 | 🔍 **只读**（查询类） |
| **其他页面** | Other Pages | ❌ 无 | - | - |

---

## 2. 智能体统一入口职责边界（强化版）

### 2.1 核心原则

**强制要求**：`POST /agent/route_and_run` **必须**有 `trip_id`，否则返回错误提示。

**职责范围**：
- ✅ **只处理已创建行程的运营服务**
- ❌ **不处理规划请求**（已通过路由规则拦截）
- ❌ **不处理无 trip_id 的请求**（新增：返回明确错误）

### 2.2 请求验证规则

```typescript
// 伪代码
if (!request.trip_id || request.trip_id === '') {
  return {
    status: 'FAILED',
    error: 'MISSING_TRIP_ID',
    message: '智能体统一入口只为具体行程服务，请提供 trip_id',
    suggestion: '如果您想规划新行程，请使用规划工作台',
  };
}
```

### 2.3 支持的操作类型

| 操作类型 | 示例请求 | 前提条件 | 操作权限 |
|---------|---------|---------|---------|
| **行程查询** | "查询我的行程"、"显示行程详情" | `trip_id` 存在 | ✅ 允许 |
| **行程修改** | "修改第2天的行程"、"删除某个POI" | `trip_id` 存在 | ✅ 允许（但行程详情页入口不允许） |
| **执行阶段服务** | "提醒我明天出发"、"处理行程变更" | `trip_id` 存在 | ✅ 允许 |
| **简单查询** | "查询某个POI的开放时间"、"搜索附近的餐厅" | `trip_id` 存在 | ✅ 允许 |
| **知识库查询** | "冰岛有什么景点"、"如何申请签证" | `trip_id` 存在 | ✅ 允许 |

---

## 3. 行程详情页智能体入口设计

### 3.1 入口位置

**页面**: Trip Detail Page (`/trips/:tripId`)  
**入口形式**: 聊天窗口/对话气泡  
**绑定关系**: 自动绑定当前页面的 `tripId`

### 3.2 操作限制

**核心原则**：**只读模式**，只能询问行程信息，不支持修改操作。

#### ✅ 允许的操作类型

| 操作类型 | 示例请求 | 说明 |
|---------|---------|------|
| **状态查询** | "我的行程现在是什么状态？" | 查询行程当前阶段（规划中/进行中/已完成） |
| **详情查询** | "第2天有什么安排？"、"这个POI的开放时间是什么？" | 查询行程详细信息 |
| **健康度分析** | "我的行程健康度如何？"、"有什么潜在问题？" | 分析行程健康度 |
| **决策解释** | "为什么选择这个路线？"、"这个决策的依据是什么？" | 解释规划决策 |
| **证据展示** | "显示这个决策的证据" | 展示决策依据 |
| **知识查询** | "这个景点有什么特色？"、"如何到达？" | 查询相关知识 |

#### ❌ 不允许的操作类型

| 操作类型 | 示例请求 | 应该使用 |
|---------|---------|---------|
| **行程修改** | "修改第2天的行程"、"删除这个POI" | 规划工作台或统一入口（非详情页入口） |
| **规划操作** | "规划一个5天行程"、"生成新方案" | 规划工作台 |
| **创建操作** | "添加一个新的POI" | 规划工作台或统一入口（非详情页入口） |

### 3.3 技术实现

**请求示例**：
```typescript
// 前端调用
POST /agent/route_and_run
{
  "request_id": "req-001",
  "user_id": "user-123",
  "trip_id": "trip-456",  // 从页面 URL 获取
  "message": "第2天有什么安排？",
  "options": {
    "entry_point": "trip_detail_page",  // 新增：标识入口来源
    "readonly_mode": true,  // 新增：只读模式标志
  }
}
```

**后端验证**：
```typescript
// 伪代码
if (request.options?.entry_point === 'trip_detail_page') {
  // 检查是否包含修改类操作关键词
  if (isModificationRequest(request.message)) {
    return {
      status: 'NEED_REDIRECT',
      message: '行程详情页只支持查询操作，如需修改请前往规划工作台',
      redirect_to: '/planning-workbench',
    };
  }
}
```

---

## 4. 规划工作台智能体入口设计

### 4.1 入口位置

**页面**: Planning Workbench (`/planning-workbench`)  
**入口形式**: 独立智能体入口  
**绑定关系**: 无需 `trip_id`（规划新行程）

### 4.2 操作权限

**核心原则**：**可操作模式**，支持所有规划相关操作。

#### ✅ 支持的操作类型

| 操作类型 | 示例请求 | API 端点 |
|---------|---------|---------|
| **生成行程骨架** | "规划一个5天冰岛行程" | `POST /planning-workbench/execute` (`userAction: 'generate'`) |
| **对比方案** | "对比这两个方案" | `POST /planning-workbench/execute` (`userAction: 'compare'`) |
| **提交方案** | "使用这个方案" | `POST /planning-workbench/execute` (`userAction: 'commit'`) |
| **调整方案** | "调整第3天的行程" | `POST /planning-workbench/execute` (`userAction: 'adjust'`) |

### 4.3 技术实现

**请求示例**：
```typescript
// 前端调用
POST /planning-workbench/execute
{
  "context": {
    "destination": { "country": "Iceland" },
    "days": 5,
  },
  "userAction": "generate",
  "message": "规划一个5天冰岛行程",
}
```

**注意**：规划工作台有独立的 API 端点，不通过统一入口。

---

## 5. 其他页面智能体入口设计

### 5.1 行程列表页（Trip List Page）

**页面**: `/trips`  
**入口形式**: 聊天窗口/对话气泡  
**绑定策略**: **默认绑定最新行程**，支持切换

#### 5.1.1 默认绑定逻辑

```typescript
// 伪代码
const defaultTripId = await getLatestTripId(userId);
// 如果用户有行程，默认绑定最新行程
// 如果用户没有行程，显示提示："您还没有行程，请先创建行程"
```

#### 5.1.2 行程切换功能

**UI 设计**：
- 在智能体入口上方显示当前绑定的行程名称
- 提供下拉菜单/选择器，支持切换其他行程
- 显示"创建新行程"选项，点击跳转到规划工作台

**交互流程**：
1. 用户打开行程列表页
2. 智能体入口自动绑定最新行程（如果有）
3. 用户可以通过下拉菜单切换其他行程
4. 用户查询时，使用当前绑定的 `trip_id`

#### 5.1.3 操作权限

**只读模式**：同行程详情页，只支持查询类操作。

### 5.2 首页/仪表盘（Home/Dashboard）

**页面**: `/` 或 `/dashboard`  
**入口形式**: 可选（根据产品策略决定）  
**绑定策略**: **默认绑定最新行程**，支持切换

#### 5.2.1 可选策略

**策略A：有智能体入口**
- 默认绑定最新行程
- 支持切换行程
- 只读模式（查询类操作）

**策略B：无智能体入口**
- 引导用户前往行程详情页或规划工作台
- 显示快捷入口卡片

#### 5.2.2 推荐策略

**推荐策略A**：提供智能体入口，但功能受限（只读模式），引导用户前往具体页面进行详细操作。

### 5.3 其他页面

**页面**: 其他所有页面（如设置页、帮助页等）  
**入口策略**: ❌ **无智能体入口**

**原因**：
- 避免功能分散
- 保持用户体验一致性
- 降低开发维护成本

---

## 6. 前端实现指南

### 6.1 智能体入口组件设计

#### 6.1.1 组件结构

```typescript
// 伪代码
interface AgentEntryProps {
  // 入口来源
  entryPoint: 'trip_detail' | 'trip_list' | 'dashboard' | 'planning_workbench';
  
  // 行程绑定（可选）
  tripId?: string;
  onTripChange?: (tripId: string) => void;
  
  // 操作权限
  readonlyMode?: boolean;
  
  // UI 配置
  position?: 'bottom-right' | 'bottom-left' | 'inline';
  collapsed?: boolean;
}
```

#### 6.1.2 行程绑定组件

```typescript
// 伪代码
interface TripSelectorProps {
  currentTripId?: string;
  availableTrips: Trip[];
  onTripChange: (tripId: string) => void;
  onCreateNewTrip: () => void;
}
```

### 6.2 请求构建逻辑

```typescript
// 伪代码
function buildAgentRequest(
  message: string,
  entryPoint: string,
  tripId?: string
): RouteAndRunRequestDto {
  const request: RouteAndRunRequestDto = {
    request_id: generateRequestId(),
    user_id: getCurrentUserId(),
    trip_id: tripId,  // 必须提供（统一入口要求）
    message,
    options: {
      entry_point: entryPoint,  // 标识入口来源
      readonly_mode: entryPoint === 'trip_detail' || entryPoint === 'trip_list',
    },
  };
  
  // 验证 trip_id
  if (!tripId && entryPoint !== 'planning_workbench') {
    throw new Error('智能体统一入口需要 trip_id');
  }
  
  return request;
}
```

### 6.3 错误处理

```typescript
// 伪代码
async function handleAgentRequest(request: RouteAndRunRequestDto) {
  try {
    const response = await agentService.routeAndRun(request);
    
    // 处理重定向
    if (response.result.status === 'REDIRECT_REQUIRED') {
      const redirectInfo = response.result.payload.redirectInfo;
      if (redirectInfo?.redirect_to === '/planning-workbench/execute') {
        // 跳转到规划工作台
        router.push('/planning-workbench');
        return;
      }
    }
    
    // 处理只读模式限制
    if (response.result.status === 'NEED_REDIRECT' && 
        response.message?.includes('只支持查询操作')) {
      showMessage({
        type: 'warning',
        message: response.message,
        action: {
          label: '前往规划工作台',
          onClick: () => router.push('/planning-workbench'),
        },
      });
      return;
    }
    
    // 正常处理响应
    displayAgentResponse(response);
  } catch (error) {
    handleError(error);
  }
}
```

---

## 7. 后端实现指南

### 7.1 统一入口验证增强

**文件**: `src/agent/services/agent.service.ts`

```typescript
// 伪代码
async routeAndRun(request: RouteAndRunRequestDto): Promise<RouteAndRunResponseDto> {
  // 0. 验证 trip_id（新增）
  if (!request.trip_id || request.trip_id === '') {
    return {
      status: 'FAILED',
      error: {
        code: 'MISSING_TRIP_ID',
        message: '智能体统一入口只为具体行程服务，请提供 trip_id',
        suggestion: '如果您想规划新行程，请使用规划工作台',
      },
    };
  }
  
  // 1. 检查是否是规划请求（已有逻辑）
  if (this.isPlanningRequest(request)) {
    return this.createRedirectToPlanningWorkbenchResponse(request, startTime);
  }
  
  // 2. 检查入口来源和操作权限（新增）
  if (request.options?.entry_point === 'trip_detail_page' && 
      request.options?.readonly_mode === true) {
    if (this.isModificationRequest(request.message)) {
      return {
        status: 'NEED_REDIRECT',
        message: '行程详情页只支持查询操作，如需修改请前往规划工作台',
        redirect_to: '/planning-workbench',
      };
    }
  }
  
  // 3. 继续原有逻辑...
}
```

### 7.2 修改请求识别

**文件**: `src/agent/services/agent.service.ts`

```typescript
// 伪代码
private isModificationRequest(message: string): boolean {
  const modificationKeywords = [
    '修改', '删除', '添加', '更新', '调整', '变更',
    'modify', 'delete', 'add', 'update', 'change', 'adjust',
  ];
  
  return modificationKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );
}
```

---

## 8. 用户体验设计

### 8.1 智能体入口 UI 设计

#### 8.1.1 行程详情页入口

```
┌─────────────────────────────────────┐
│ 行程详情页                           │
│                                     │
│  [行程内容展示区域]                  │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 💬 智能助手（只读模式）        │ │
│  │ 当前行程：冰岛5日游            │ │
│  │                               │ │
│  │ 您可以询问：                   │ │
│  │ • 行程状态和详情               │ │
│  │ • 健康度分析                   │ │
│  │ • 决策解释                     │ │
│  │                               │ │
│  │ [输入框：只能查询，不能修改]   │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### 8.1.2 行程列表页入口

```
┌─────────────────────────────────────┐
│ 行程列表页                           │
│                                     │
│  [行程列表]                          │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 💬 智能助手                   │ │
│  │ 当前行程：                    │ │
│  │ [下拉菜单：冰岛5日游 ▼]       │ │
│  │   ├─ 冰岛5日游 (当前)         │ │
│  │   ├─ 日本7日游                │ │
│  │   └─ + 创建新行程             │ │
│  │                               │ │
│  │ [输入框：查询当前行程信息]    │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### 8.1.3 规划工作台入口

```
┌─────────────────────────────────────┐
│ 规划工作台                           │
│                                     │
│  [规划内容展示区域]                  │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 💬 规划助手                   │ │
│  │                               │ │
│  │ 您可以：                       │ │
│  │ • 规划新行程                   │ │
│  │ • 调整方案                     │ │
│  │ • 对比方案                     │ │
│  │                               │ │
│  │ [输入框：支持所有规划操作]     │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 8.2 错误提示设计

#### 8.2.1 缺少 trip_id 错误

```
┌─────────────────────────────────────┐
│ ⚠️ 需要选择行程                      │
│                                     │
│ 智能体统一入口只为具体行程服务。     │
│                                     │
│ 请选择要查询的行程，或前往规划工作台 │
│ 创建新行程。                         │
│                                     │
│ [选择行程] [前往规划工作台]          │
└─────────────────────────────────────┘
```

#### 8.2.2 只读模式限制错误

```
┌─────────────────────────────────────┐
│ ℹ️ 行程详情页只支持查询操作          │
│                                     │
│ 如需修改行程，请前往规划工作台。     │
│                                     │
│ [前往规划工作台] [取消]              │
└─────────────────────────────────────┘
```

---

## 9. 实施计划

### 9.1 阶段一：后端增强（P0）

- [ ] 统一入口添加 `trip_id` 强制验证
- [ ] 添加入口来源标识（`entry_point`）
- [ ] 添加只读模式标志（`readonly_mode`）
- [ ] 实现修改请求识别逻辑
- [ ] 添加相关错误响应

### 9.2 阶段二：前端基础实现（P0）

- [ ] 行程详情页智能体入口（只读模式）
- [ ] 规划工作台智能体入口（可操作模式）
- [ ] 错误提示 UI 组件

### 9.3 阶段三：前端增强（P1）

- [ ] 行程列表页智能体入口（默认绑定最新行程）
- [ ] 行程切换功能
- [ ] 首页/仪表盘智能体入口（可选）

### 9.4 阶段四：优化与测试（P1）

- [ ] 用户体验优化
- [ ] 端到端测试
- [ ] 性能优化
- [ ] 监控埋点

---

## 10. 成功指标

### 10.1 功能指标

- ✅ 统一入口 100% 要求 `trip_id`
- ✅ 行程详情页入口 100% 限制为只读操作
- ✅ 规划工作台入口 100% 支持规划操作
- ✅ 其他页面智能体入口正确绑定最新行程

### 10.2 用户体验指标

- 用户理解入口限制的清晰度 > 90%
- 错误提示点击率（前往规划工作台）> 50%
- 行程切换功能使用率 > 30%

### 10.3 技术指标

- 统一入口响应时间 < 100ms（重定向场景）
- 错误处理覆盖率 100%
- 前端错误提示显示率 100%

---

## 11. 风险与应对

### 11.1 风险识别

| 风险 | 影响 | 概率 | 应对措施 |
|-----|------|------|---------|
| 用户不理解入口限制 | 中 | 中 | 清晰的 UI 提示和错误消息 |
| 行程切换功能复杂度高 | 中 | 低 | 简化交互，提供默认值 |
| 前端实现成本高 | 高 | 中 | 分阶段实施，优先核心功能 |

### 11.2 应对策略

1. **用户教育**：在首次使用时提供引导
2. **渐进式实施**：先实现核心功能，再优化体验
3. **监控反馈**：收集用户反馈，持续优化

---

## 12. 总结

本方案明确了智能体入口在不同页面的使用策略：

1. **统一入口强制要求 trip_id** - 确保只为具体行程服务
2. **行程详情页只读模式** - 限制为查询类操作
3. **规划工作台可操作模式** - 支持所有规划操作
4. **其他页面默认绑定最新行程** - 提供便捷的智能体入口

**下一步**：技术评审 → 后端实现 → 前端实现 → 测试验证

---

**文档状态**: ✅ **完成，待技术评审**
