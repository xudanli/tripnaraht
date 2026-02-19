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
    // 卡片展示：name, address|roomSpecs, photoUrl|photos[0], price, rating, url
    displayAccommodations(accommodations); // 统一渲染，根据 acc.source 区分酒店/Airbnb
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

## 总结

1. **消息明确性**：确保消息包含明确的关键词（如"推荐酒店"）
2. **上下文传递**：规划工作台场景下传递 `tripId` 和 `countryCode`
3. **响应检查**：检查 `routing.target` 确保路由正确
4. **错误处理**：实现完善的错误处理逻辑，记录日志便于调试
5. **会话管理**：复用会话，避免频繁创建新会话
6. **性能优化**：使用请求节流和响应缓存提升用户体验
