# 前端集成指南 - 规划助手智能体

## 概述

本文档说明前端如何正确调用规划助手 API，特别是"推荐酒店"等按钮功能的实现。

## 关键问题修复

### 1. "推荐酒店"按钮路由问题

**问题**：点击"推荐酒店"按钮后，系统返回目的地推荐而不是酒店搜索结果。

**原因**：
- 前端可能发送的消息不够明确
- 路由逻辑可能被误判为目的地推荐

**解决方案**：

#### 方案A：明确的消息内容（推荐）

当用户点击"推荐酒店"按钮时，前端应该发送明确的消息：

```typescript
// ✅ 正确：明确包含"推荐酒店"
const message = "推荐酒店";

// ✅ 更好：如果已有选定目的地，包含目的地信息
const message = selectedDestination 
  ? `推荐${selectedDestination}的酒店` 
  : "推荐酒店";
```

#### 方案B：使用 context 参数（规划工作台场景）

如果是在规划工作台场景（已有 tripId 和 countryCode），应该传递这些参数：

```typescript
const response = await fetch('/api/agent/planning-assistant/v2/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sessionId: sessionId,
    message: "推荐酒店", // 或 "推荐酒店" + 目的地
    language: 'zh',
    context: {
      tripId: tripId,           // 规划工作台场景下必需
      countryCode: countryCode, // 规划工作台场景下必需
      userCountryCode: 'CN',    // 可选，用户国籍，住宿数据按对应语言展示（CN→中文、JP→日文等）
      currentLocation: {
        lat: currentLat,
        lng: currentLng,
      },
      timezone: 'Asia/Shanghai',
    },
  }),
});
```

### 2. 消息格式建议

#### 酒店搜索相关消息

| 按钮/操作 | 推荐消息内容 | 说明 |
|---------|------------|------|
| 推荐酒店 | `"推荐酒店"` 或 `"推荐${destination}的酒店"` | 明确包含"推荐"和"酒店" |
| 找酒店 | `"找酒店"` 或 `"搜索酒店"` | 包含"酒店"关键词 |
| 推荐住宿 | `"推荐住宿"` | 会同时搜索酒店和 Airbnb |

#### 其他服务消息

| 服务 | 推荐消息内容 |
|------|------------|
| Airbnb | `"推荐 Airbnb"` 或 `"找民宿"` |
| 餐厅 | `"推荐餐厅"` 或 `"附近有什么好吃的"` |
| 天气 | `"天气怎么样"` 或 `"${destination}天气"` |
| 航班 | `"搜索航班"` 或 `"查机票"` |

### 3. 前端实现示例

#### React Hook 示例

```typescript
import { useState } from 'react';

interface ChatRequest {
  sessionId: string;
  message: string;
  userId?: string;
  language?: 'en' | 'zh';
  context?: {
    tripId?: string;
    countryCode?: string;
    /** 用户国籍（用于住宿数据按对应语言展示，如 CN→中文、JP→日文） */
    userCountryCode?: string;
    currentLocation?: {
      lat: number;
      lng: number;
    };
    timezone?: string;
  };
}

export function usePlanningAssistant() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = async (request: ChatRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/agent/planning-assistant/v2/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `请求失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('未知错误');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // 推荐酒店按钮处理
  const recommendHotels = async (
    sessionId: string,
    destination?: string,
    tripId?: string,
    countryCode?: string
  ) => {
    const message = destination 
      ? `推荐${destination}的酒店`
      : "推荐酒店";
    
    return sendMessage({
      sessionId,
      message,
      language: 'zh',
      ...(tripId && countryCode && {
        context: {
          tripId,
          countryCode,
        },
      }),
    });
  };

  return {
    loading,
    error,
    sendMessage,
    recommendHotels,
  };
}
```

#### 组件使用示例

```typescript
function PlanningWorkbench({ tripId, countryCode, selectedDestination }) {
  const { loading, error, recommendHotels } = usePlanningAssistant();

  const handleRecommendHotels = async () => {
    try {
      const response = await recommendHotels(
        sessionId,
        selectedDestination,
        tripId,
        countryCode
      );
      
      // 处理响应
      if (response.routing?.target === 'hotel') {
        // 显示酒店列表
        displayHotels(response.hotels || response.airbnbListings);
      } else {
        // 路由到其他目标，显示相应内容
        handleRoutingResponse(response);
      }
    } catch (err) {
      console.error('推荐酒店失败:', err);
    }
  };

  return (
    <div>
      <button 
        onClick={handleRecommendHotels}
        disabled={loading}
      >
        {loading ? '搜索中...' : '推荐酒店'}
      </button>
      {error && <div className="error">{error.message}</div>}
    </div>
  );
}
```

### 4. 响应处理

#### 检查路由结果

```typescript
const response = await sendMessage({...});

// 检查路由目标
if (response.routing?.target === 'hotel' || response.routing?.target === 'accommodation') {
  // 住宿搜索结果：优先使用统一结构 accommodations
  const accommodations = response.accommodations || [];
  if (accommodations.length > 0) {
    // 卡片必展示字段：name, price, rating, url
    // 决策辅助（后端已写入，前端需渲染否则用户无法比价）：
    //   distance_label_zh  — 如「距「黄金瀑布」约 12.3 km」（按用户说的「离第 N 天近」锚定第 N 天首个行程 POI）
    //   decision_support_zh — 选房权衡：距离/价位/人数/评分 + 跨天动线（第 N 天收队强度、第 N+1 天是否宜早起等）
    // 有「第二天住、离第三天近」类意图时，列表按综合分排序（非纯距离），见 hotel-proximity-stay-context.util
    //   checkIn / checkOut — 本次搜索入住窗（第二天酒店通常为 6/2–6/3）
    // 列表已按 distanceKm 升序；顶部 messageCN 含入住窗与排序说明
    // 每张卡片 actions[]：view_accommodation（打开 url）、add_accommodation_to_itinerary（一键加入行程）
    displayAccommodations(accommodations);
  } else {
    // 兼容旧版
    const hotels = response.hotels || [];
    const airbnbListings = response.airbnbListings || [];
    if (airbnbListings.length > 0) displayAirbnbListings(airbnbListings);
    else if (hotels.length > 0) displayHotels(hotels);
  }
} else if (response.routing?.target === 'recommendations') {
  // 目的地推荐（不应该在点击"推荐酒店"时出现）
  console.warn('路由到目的地推荐，可能是路由错误');
  // 可以显示推荐，但应该记录日志
  displayRecommendations(response.recommendations);
}
```

#### 一键加入行程（住宿卡片）

用户点击卡片上的 **「加入行程」** 时，不要再次走 chat，而是调用专用接口（会话内会缓存最近一次 `accommodations` 列表）：

```typescript
async function addAccommodationToTrip(params: {
  tripId: string;
  sessionId: string;
  accommodationIndex: number;
}) {
  const res = await fetch(
    `/api/agent/planning-assistant/v2/trips/${params.tripId}/accommodations/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: params.sessionId,
        accommodationIndex: params.accommodationIndex,
        replaceExisting: true, // 默认：替换该入住日已有 REST 住宿项
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.messageCN || data.message);
  // data.itineraryItemId — 新建行程项；刷新时间轴
  return data;
}

// 卡片按钮绑定示例
function onAccommodationAction(
  action: { action: string; params?: { accommodationIndex?: number; url?: string } },
  ctx: { tripId: string; sessionId: string },
) {
  if (action.action === 'view_accommodation' && action.params?.url) {
    window.open(action.params.url, '_blank', 'noopener');
    return;
  }
  if (action.action === 'add_accommodation_to_itinerary') {
    const idx = action.params?.accommodationIndex;
    if (idx == null) return;
    return addAccommodationToTrip({
      tripId: ctx.tripId,
      sessionId: ctx.sessionId,
      accommodationIndex: idx,
    });
  }
}
```

**注意**：`chat` 请求仍需每轮携带 `context: { tripId, countryCode }`；`apply` 的 `tripId` 必须与搜索酒店时一致，否则会返回「住宿结果属于其他行程」。

### 5. 调试建议

#### 启用详细日志

前端可以在开发环境中记录请求和响应：

```typescript
const sendMessage = async (request: ChatRequest) => {
  // 开发环境日志
  if (process.env.NODE_ENV === 'development') {
    console.log('[Planning Assistant] 发送请求:', {
      message: request.message,
      routing: 'auto',
      context: request.context,
    });
  }
  
  const response = await fetch(...);
  const data = await response.json();
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[Planning Assistant] 收到响应:', {
      routing: data.routing,
      target: data.routing?.target,
      reasonCN: data.routing?.reasonCN,
      hasHotels: !!data.hotels?.length,
      hasAirbnb: !!data.airbnbListings?.length,
    });
  }
  
  return data;
};
```

#### 检查路由结果

如果发现路由错误（如点击"推荐酒店"却返回目的地推荐），检查：

1. **消息内容**：确保消息包含"酒店"关键词
2. **会话状态**：检查是否有 `selectedDestination`
3. **路由响应**：检查 `response.routing.target` 和 `response.routing.reasonCN`
4. **后端日志**：查看后端日志中的路由决策过程

### 6. 常见问题

#### Q: 点击"推荐酒店"却返回目的地推荐

**A**: 
1. 确保消息包含"推荐酒店"或"找酒店"
2. 如果是在规划工作台，确保传递 `tripId` 和 `countryCode`
3. 检查后端日志中的路由决策

#### Q: 匹配度都是71%，没有区分度

**A**: 
- 已优化匹配度计算算法，现在会有更好的区分度
- 如果仍然相同，可能是用户偏好设置导致所有目的地确实匹配度相近
- 检查 `response.recommendations` 中的 `matchScore` 字段

#### Q: 如何确保优先显示 Airbnb？

**A**: 
- 系统会自动优先使用 Airbnb 搜索
- 检查响应中的 `response.airbnbListings` 字段
- 如果存在，优先显示 Airbnb 结果

### 7. API 端点

#### V2 API（推荐使用）

```
POST /api/agent/planning-assistant/v2/chat
```

#### 请求格式

```typescript
{
  sessionId: string;
  message: string;
  userId?: string;
  language?: 'en' | 'zh';
  context?: {
    tripId?: string;        // 规划工作台场景下必需
    countryCode?: string;   // 规划工作台场景下必需
    currentLocation?: {
      lat: number;
      lng: number;
    };
    timezone?: string;
  };
}
```

#### 响应格式

```typescript
{
  message: string;              // 回复消息（英文）
  messageCN: string;           // 回复消息（中文）
  reply?: string;              // 主要回复消息（根据语言参数自动选择）
  replyCN?: string;            // 主要回复消息（中文）
  phase: string;               // 当前阶段: 'INITIAL' | 'COLLECTING_PREFERENCES' | 'RECOMMENDING' | 'COMPARING_PLANS' | 'CONFIRMING' | 'COMPLETED' | 'ADJUSTING' | 'CLARIFYING_HOTEL_DATES'
  clarificationNeeded?: {      // 需要用户澄清时包含（如 phase === 'CLARIFYING_HOTEL_DATES'）
    type: string;              // 澄清类型，如 'HOTEL_DATES'
    message: string;
    messageCN: string;
  };
  sessionId?: string;          // 会话ID
  routing?: {                   // 智能路由信息（如果路由到业务接口）
    target: 'hotel' | 'recommendations' | 'generate' | 'compare' | 'airbnb' | 'accommodation' | 'restaurant' | 'flight' | 'rail' | 'carRental' | 'weather' | 'search' | 'translate' | 'currency' | 'image' | 'chat';
    reason?: string;            // 路由原因（英文）
    reasonCN?: string;          // 路由原因（中文）
    params?: any;               // 提取的参数
  };
  suggestedActions?: Array<{    // 建议操作
    type: string;
    label: string;
    labelCN: string;
    action: string;
  }>;
  
  // 根据 routing.target 不同，可能包含以下字段：
  recommendations?: Array<{     // 目的地推荐（routing.target === 'recommendations'）
    id: string;
    countryCode: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    highlights: string[];
    highlightsCN: string[];
    matchScore: number;         // 匹配度（0-100，保留一位小数）
    matchReasons: string[];
    matchReasonsCN: string[];
    estimatedBudget: {
      min: number;
      max: number;
      currency: string;
    };
    bestSeasons: string[];
    tags: string[];
    imageUrl?: string;
  }>;
  
  plans?: Array<{              // 方案候选（routing.target === 'generate'）
    id: string;
    name: string;
    nameCN: string;
    destination: string;
    duration: number;
    estimatedBudget: any;
    pace: string;
    suitability: any;
  }>;
  
  hotels?: Array<{             // 酒店列表（routing.target === 'hotel'）
    placeId: string;
    name: string;
    address: string;
    location: { lat: number; lng: number };
    rating: number;
    userRatingsTotal: number;
    priceLevel?: number;
    photos?: Array<{ photoReference: string; width: number; height: number }>;
    // ... 更多字段
  }>;
  
  airbnbListings?: Array<any>; // Airbnb 房源列表（routing.target === 'hotel' 或 'airbnb'）
  restaurants?: Array<any>;    // 餐厅列表（routing.target === 'restaurant'）
  weather?: any;                // 天气信息（routing.target === 'weather'）
  searchResults?: Array<any>;  // 搜索结果（routing.target === 'search'）
  flights?: Array<any>;         // 航班列表（routing.target === 'flight'）
  railRoutes?: Array<any>;      // 铁路路线列表（routing.target === 'rail'）
  carRentals?: Array<any>;      // 租车列表（routing.target === 'carRental'）
  translation?: any;            // 翻译结果（routing.target === 'translate'）
  currencyConversion?: any;     // 货币转换结果（routing.target === 'currency'）
  images?: Array<any>;          // 图片列表（routing.target === 'image'）
}
```

### 8. 错误处理

#### 错误响应格式

```typescript
{
  statusCode: number;
  message: string;
  error: string;
  // 可能包含 details 字段，提供更详细的错误信息
}
```

#### 常见错误码

| 状态码 | 说明 | 处理建议 |
|--------|------|---------|
| 400 | 请求参数错误 | 检查请求体格式，确保必需字段存在 |
| 404 | 会话不存在 | 重新创建会话或检查 sessionId |
| 429 | 请求过于频繁 | 实现请求节流，等待后重试 |
| 500 | 服务器内部错误 | 记录错误日志，稍后重试 |

#### 错误处理示例

```typescript
const sendMessage = async (request: ChatRequest) => {
  try {
    const response = await fetch('/api/agent/planning-assistant/v2/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      
      // 根据状态码处理不同错误
      switch (response.status) {
        case 400:
          throw new Error(`参数错误: ${errorData.message}`);
        case 404:
          // 会话不存在，可能需要重新创建
          throw new Error('会话不存在，请重新创建会话');
        case 429:
          throw new Error('请求过于频繁，请稍后再试');
        default:
          throw new Error(errorData.message || `请求失败: ${response.statusText}`);
      }
    }

    return await response.json();
  } catch (err) {
    // 网络错误或其他错误
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('网络错误，请检查网络连接');
    }
    throw err;
  }
};
```

### 9. 最佳实践

#### 会话管理

```typescript
// ✅ 推荐：复用会话，而不是每次都创建新会话
let sessionId: string | null = null;

async function getOrCreateSession(userId?: string): Promise<string> {
  if (sessionId) return sessionId;
  
  const response = await fetch('/api/agent/planning-assistant/v2/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  
  const data = await response.json();
  sessionId = data.sessionId;
  return sessionId;
}
```

#### 请求节流

```typescript
import { debounce } from 'lodash';

// 对用户输入进行防抖处理
const debouncedSendMessage = debounce(async (message: string) => {
  await sendMessage({ sessionId, message });
}, 500);
```

#### 响应缓存

```typescript
// 对于相同的目的地推荐请求，可以缓存结果
const recommendationCache = new Map<string, any>();

async function getRecommendations(destination: string) {
  const cacheKey = `recommendations:${destination}`;
  
  if (recommendationCache.has(cacheKey)) {
    return recommendationCache.get(cacheKey);
  }
  
  const response = await sendMessage({
    sessionId,
    message: `推荐${destination}的目的地`,
  });
  
  if (response.recommendations) {
    recommendationCache.set(cacheKey, response);
  }
  
  return response;
}
```

## 规划工作台：智能体须看见当前 Trip 草案

左侧时间轴来自 **Trip 库**（如 Day1 已排「黑沙滩套房酒店」「维克超市 10:00–12:00」）。若右侧智能体写「**尚未提供具体住宿、餐饮和活动**」并只给市场区间估算，通常是 **聊天未注入 `tripId` 日程摘要**（走 `planningAssistantService.chat` 回退路径时曾只传经纬度）。

**前端每轮 chat 必须带：**

```typescript
context: {
  tripId: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
  countryCode: 'IS',
}
```

后端会把库内 `TripDay` + `Place` 名称注入 LLM；分析/预算须与草案一致。深度分析更推荐走 `route_and_run` 且 `conversation_context.context_type: 'active_trip_summary'`（与编排 VERIFY 同源）。

## 规划工作台：时间轴与智能体「可执行性」对齐

### 问题现象

左侧时间轴来自 **Trip 库内草案**（或 `payload.timeline`），右侧智能体折叠区来自 **`gate_result.violations` / `safety_surface.verify_issues`**。若 CGUS/改排/auto-apply 只更新了其中一侧，会出现：

- 左侧已是「众神瀑布」，右侧仍提示「钻石沙滩 @ 2026-06-06 09:00」；
- 或时间轴有 10:00–12:00 计划窗，仍报「缺少开放时间」（计划窗 ≠ 营业时间，见后端 VERIFY 说明）。

### 单一数据源（推荐）

绑定 `context.tripId` 且走 `route_and_run`（`entry_point: planning_workbench`）时，响应会带：

| 字段 | 用途 |
|------|------|
| `payload.timeline` | **优先渲染时间轴**（已与 Trip 对齐时与库内一致） |
| `payload.poi_cards` | POI 卡片，与 `timeline` 同源 |
| `payload.workbench_display` | `timeline_source` / `feasibility_source`：`orchestration` \| `trip_persisted`；`drift_detected` |
| `result.payload` 内 `gate_result`（经 BFF 清洗） | 右侧「可执行性 · POI_CLOSED」等 |
| `safety_surface.verify_issues` | 与 gate **去重后**的补充项（勿与 `violations` 各渲染一遍） |
| `payload.itinerary_adjust_result` | 改排草案：`draft_schedule_zh`、`apply_confirmation_lines`、`display_title_zh`、`poi_selection_rationale_zh`、`suppress_chat_lead` |
| `payload.workbench_feasibility` | **改排唯一可执行性列表**（已剥离 VERIFY 合成 POI_CLOSED；**且仅保留草案内 POI**） |

规划助手 v2 聊天响应亦透传：`timeline`、`workbench_display`、`workbench_feasibility`、`safety_surface`（见 `ChatResponseDto`）。

**改排「草案待确认」**：不应在「应用到行程」上方展示 VERIFY 合成的 `POI_CLOSED` 红卡。后端对 `itinerary_adjust_intake` 已剥离 `verify_synthetic`（与 gate 是否 `ALLOW` 无关），并**只保留 `itinerary_adjust_result.poi_names` / 草案时间轴内的 POI**（未写入草案的候选如「斯卡夫塔 vs 斯科加」勿展示）。请读当轮 `workbench_feasibility.violations`（通常为空），勿复用上一轮缓存 gate。

**决策日志（折叠区）**：POI_SELECTION 仍会显示「目标日候选：A、B、C」（检索池审计）；但 VERIFY 的「开放时间冲突」行在 REPAIR 后会裁剪为**仅草案内 POI**。若仍看到维克/斯卡夫塔红卡，说明前端在读未裁剪的 `state.decision_log` 而非出站 `decision_log`。

**Chat 正文 vs 结构化卡片**（`suppress_chat_lead === true` 时）：

| 字段 | 渲染位置 |
|------|----------|
| `answer_text` / `messageCN` | `suppress_chat_lead` 时读 `chat_answer_text_zh`（完整当日安排 + 应用说明） |
| `display_title_zh` | 仅草案卡片标题（如「第 2 天（2026-06-02）」） |
| `draft_schedule_zh` | 卡片内时段列表（**完整**渲染每一项，勿 `slice(0, 2)`） |
| `draft_card_body_zh` | 卡片正文「当日安排」整块（与 `draft_schedule_zh` 同源，单字段渲染时用此字段） |
| `poi_selection_rationale_zh` | 卡片内「选点说明」（含「并非二选一」） |
| `optimization_summary_zh` | 卡片展开详情：走廊约束 + 选点说明（**不含**当日时段列表，时段见 `draft_schedule_zh`） |
| `chat_answer_text_zh` | `suppress_chat_lead` 时 chat 气泡完整草案（含全部时段 + 应用说明） |

```typescript
const adjust = payload.itinerary_adjust_result;
if (adjust?.suppress_chat_lead) {
  // 右侧 chat：不渲染 answer_text 里的 autoLead + 日期行
  renderDraftCard({
    title: adjust.display_title_zh,
    body: adjust.draft_card_body_zh ?? adjust.draft_schedule_zh,
    schedule: adjust.draft_schedule_zh,
    rationale: adjust.poi_selection_rationale_zh,
    applyLines: adjust.apply_confirmation_lines,
  });
} else {
  renderChatBubble(response.result.answer_text);
}
```

### 改排勿落黄金圈（走廊 vs region_id）

用户只说「第二天不合理，优化一下」时，**不应**因 Trip 上残留的 `region_id=golden_circle` 而排出辛格维利尔/盖歇尔/黄金瀑布（09:00–10:30 / 11:00–11:45 / 12:30–13:15 为黄金圈模板时段）。

| 原因 | 说明 |
|------|------|
| `trip_plan_request.region_id` | 曾写入 `golden_circle` 时，STATE_UPDATE 会把 `requiredAnchorPoiIds` 强制为三锚点 |
| `enforceRequiredAnchorsTopN` | 走廊已筛出南岸 POI 后仍可能被黄金圈锚点顶回 TopN |
| `workbench_display` | 草案待确认时左侧曾读库内 Trip，与右侧编排草案不一致 |

后端修复（需重启 dev）：
- 改排且用户**未**在原文提区域 → 使用 `itinerary_adjust_corridor` slice，**排除**黄金圈 slug，**无**必选锚点
- 走廊 POI 选择时 **跳过** `enforceRequiredAnchorsTopN`
- `itineraryAdjustDraftPending` → 左侧 `timeline` 预览 **编排草案**（`orchestration`），不是库内旧 Trip

```typescript
// 草案待确认：左侧与右侧同源
if (payload.itinerary_adjust_intake && !payload.actionExecution?.status?.includes('SUCCEEDED')) {
  renderTimeline(payload.timeline); // orchestration 草案
  renderDraftCard(payload.itinerary_adjust_result);
}
```

```typescript
// ✅ 推荐：同一轮响应内绑定展示
const { timeline, workbench_display, safety_surface, workbench_feasibility } =
  routeAndRun.result.payload;
const gate = routeAndRun.result.payload.orchestrationResult?.gate_result
  ?? orchestrationResult?.gate_result;

renderTimeline(timeline);
const gateViolations =
  workbench_feasibility?.violations ??
  routeAndRun.gate_result?.violations ??
  routeAndRun.result.payload.orchestrationResult?.gate_result?.violations ??
  [];
renderFeasibilityHints({
  violations: gateViolations,
  verifyIssues: safety_surface?.verify_issues ?? [],
});

// ❌ 勿读 orchestrationResult.state.gate_result.violations（BFF 已清空，防止与 sibling 重复）
// ❌ 勿将 gate.violations 与 verify_issues 简单 concat

// 改排「草案待确认」：必须用 itinerary_adjust_result + timeline，勿用 plans[0] 全周骨架
const adjust =
  routeAndRun.itinerary_adjust_result ??
  routeAndRun.result.payload.itinerary_adjust_result;
if (adjust?.apply_confirmation_lines?.length) {
  showApplyDraftBanner(adjust.apply_confirmation_lines, adjust.draft_schedule_zh);
} else if (adjust?.apply_confirmation_zh) {
  showApplyDraftBanner(adjust.apply_confirmation_zh.split('\n'), adjust.draft_schedule_zh);
}

// 「应用到行程」按钮：须调用 route_and_run 落库，勿仅隐藏卡片
await routeAndRun({
  trip_id: tripId,
  message: '应用到行程',
  options: {
    entry_point: 'planning_workbench',
    apply_itinerary_adjust_draft: true,
    durable_trip_run_id: lastResponse.durable?.trip_run_id,
    itinerary_adjust_draft_snapshot: {
      target_date_iso: adjust.target_date_iso,
      target_day_number: adjust.target_day_number,
      items: payload.timeline.find((d) => d.date === adjust.target_date_iso)?.items,
    },
  },
});
// 成功后刷新 Trip 时间轴（GET trip days），并切换到目标日 view

// 工作台正在查看某一天时，只展示该日的可执行性（避免全周 6 条冰河湖重复卡片）
const selectedDate = workbenchUi.selectedDayDate; // 如 '2026-06-02'
const dayIssues = (safety_surface?.verify_issues ?? []).filter(
  (i) => !selectedDate || String(i.day ?? '').slice(0, 10) === selectedDate,
);

if (workbench_display?.drift_detected) {
  showBanner('决策说明已按当前 Trip 草案过滤；与上一轮编排内存可能曾不一致');
}
```

```typescript
// ❌ 避免：时间轴单独 GET Trip，可执行性仍用上一轮 orchestrationResult 缓存
const days = await fetchTripDays(tripId);           // 库内最新
const oldGate = session.lastOrchestration.gate_result; // 可能是改排前的 VERIFY
```

### 何时仍可能不一致

- 前端**未使用**当轮 `payload.timeline`，而自行拉 Trip + 复用旧 `gate_result`。
- 用户在库外改 Trip 后**未重新** `route_and_run` / 聊天，右侧仍是旧 violations。
- `workbench_display.aligned === false` 且 `timeline_source === orchestration'`：库内 Trip 与编排器仍不同，需提示用户「保存/同步」或重新生成。

### 调试

1. 看当轮 `workbench_display.timeline_source` 是否为 `trip_persisted`。
2. 对比 `fingerprint`：同日 09:00 槽位 POI 名是否与 violations 文案一致。
3. 改排/auto-apply 后务必用**当轮**响应刷新右侧，勿 merge 历史 `orchestrationResult`。

## 总结

1. **消息明确性**：确保消息包含明确的关键词（如"推荐酒店"）
2. **上下文传递**：规划工作台场景下传递 `tripId` 和 `countryCode`
3. **响应检查**：检查 `routing.target` 确保路由正确
4. **错误处理**：实现完善的错误处理逻辑，记录日志便于调试
5. **会话管理**：复用会话，避免频繁创建新会话
6. **性能优化**：使用请求节流和响应缓存提升用户体验
