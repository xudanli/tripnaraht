# Planning Assistant V2 - Airbnb MCP 集成检查报告

**检查日期**: 2026-02-08  
**检查人**: 首席AI科学家  
**检查范围**: 用户自然语言输入触发 Airbnb MCP 服务调用

---

## 📋 执行摘要

### 当前状态

❌ **问题发现**: Planning Assistant V2 接口**不支持**通过用户自然语言输入（如"推荐酒店"）直接调用 Airbnb MCP 服务。

### 关键发现

1. ✅ **Airbnb MCP 服务已实现并集成**
   - `AirbnbService` 已实现 (`src/mcp/airbnb.service.ts`)
   - `airbnb.search` 工具已注册到 MCP Skills Server
   - 独立的 REST API 接口 `/airbnb/search` 可用

2. ❌ **智能路由不支持 Airbnb 意图识别**
   - 当前智能路由只识别 `hotel` 目标
   - 默认**排除 Airbnb**（`excludeAirbnb: true`）
   - 即使用户明确说"推荐 Airbnb"或"推荐民宿"，也不会调用 Airbnb MCP

3. ❌ **酒店搜索只调用 Hotel Direct API**
   - 只调用 `hotelDirectService.searchHotels()`
   - **没有调用** `airbnbService.searchListings()`
   - 结果中明确标注"已排除Airbnb"

---

## 🔍 详细分析

### 1. 当前实现流程

```typescript
用户输入: "推荐酒店"
  ↓
SmartRouterService.route()
  ↓
识别为 target: 'hotel'
  ↓
PlanningAssistantV2Service.chat()
  ↓
调用 hotelDirectService.searchHotels()
  ↓
默认 excludeAirbnb: true
  ↓
返回结果: "我为您找到了X家酒店（已排除Airbnb）"
```

### 2. 代码位置

**智能路由服务** (`smart-router.service.ts`):
- 第 150 行: 定义了 `hotel` 路由目标
- 第 165 行: 路由结果中包含 `excludeAirbnb: true`（默认值）
- 第 220-234 行: 关键词路由检测到"酒店"时，设置 `excludeAirbnb: true`

**Planning Assistant V2 Service** (`planning-assistant-v2.service.ts`):
- 第 492 行: `const excludeAirbnb = routingResult.extractedParams?.excludeAirbnb !== false;`（默认排除）
- 第 546 行: 只调用 `hotelDirectService.searchHotels()`
- 第 554-572 行: 过滤掉 Airbnb 相关结果
- **没有调用 Airbnb MCP 服务的代码**

### 3. Airbnb MCP 服务状态

✅ **已实现**:
- `src/mcp/airbnb.service.ts` - AirbnbService 实现
- `src/mcp/airbnb.controller.ts` - REST API 控制器
- `src/mcp/mcp-skills-server.ts` - MCP 工具注册（`airbnb.search`）

✅ **可用接口**:
- REST API: `POST /airbnb/search`
- MCP Tool: `airbnb.search`

---

## 🎯 问题分析

### 问题 1: 智能路由不支持 Airbnb 意图识别

**当前行为**:
- 用户说"推荐酒店" → 路由到 `hotel`，排除 Airbnb
- 用户说"推荐 Airbnb" → 仍然路由到 `hotel`，排除 Airbnb（错误）
- 用户说"推荐民宿" → 仍然路由到 `hotel`，排除 Airbnb（错误）

**期望行为**:
- 用户说"推荐酒店" → 只搜索酒店（排除 Airbnb）
- 用户说"推荐 Airbnb" → 只搜索 Airbnb
- 用户说"推荐民宿" → 搜索 Airbnb
- 用户说"推荐住宿" → 同时搜索酒店和 Airbnb，合并结果

### 问题 2: 没有调用 Airbnb MCP 服务

**当前代码** (`planning-assistant-v2.service.ts:546`):
```typescript
// 只调用酒店搜索
const hotelSearchResult = await this.hotelDirectService.searchHotels({...});
```

**缺失代码**:
```typescript
// 应该根据用户意图决定是否调用 Airbnb
if (!excludeAirbnb || userWantsAirbnb) {
  const airbnbResult = await this.airbnbService.searchListings({...});
}
```

---

## 💡 解决方案

### 方案 1: 增强智能路由（推荐）

**步骤**:
1. 在 `SmartRouterService` 中添加 Airbnb 意图识别
2. 新增路由目标: `'airbnb'` 或 `'accommodation'`
3. 识别用户意图:
   - "推荐 Airbnb" → `target: 'airbnb'`
   - "推荐民宿" → `target: 'airbnb'`
   - "推荐住宿" → `target: 'accommodation'`（同时搜索酒店和 Airbnb）
   - "推荐酒店" → `target: 'hotel'`（排除 Airbnb）

**实现**:
```typescript
// smart-router.service.ts

// 新增路由目标
export type RoutingTarget = 
  | 'recommendations' 
  | 'generate' 
  | 'compare' 
  | 'hotel' 
  | 'airbnb'        // 🆕 新增
  | 'accommodation' // 🆕 新增（酒店+Airbnb）
  | 'chat';

// 增强 LLM Prompt
const prompt = `分析用户消息，判断应该路由到哪个接口。

可选接口:
- hotel: 用户想要搜索酒店（排除 Airbnb）
- airbnb: 用户想要搜索 Airbnb/民宿
- accommodation: 用户想要搜索住宿（包括酒店和 Airbnb）
...`;

// 关键词路由增强
if (lowerMessage.includes('airbnb') || 
    lowerMessage.includes('民宿') || 
    lowerMessage.includes('短租')) {
  return {
    target: 'airbnb',
    confidence: 0.9,
    extractedParams: { excludeAirbnb: false },
  };
}
```

### 方案 2: 在酒店搜索中集成 Airbnb（备选）

**步骤**:
1. 在 `PlanningAssistantV2Service.chat()` 中，当路由到 `hotel` 时：
   - 检查用户是否明确要求 Airbnb
   - 如果要求 Airbnb，调用 `airbnbService.searchListings()`
   - 如果要求"住宿"，同时调用酒店和 Airbnb，合并结果

**实现**:
```typescript
// planning-assistant-v2.service.ts

case 'hotel': {
  const excludeAirbnb = routingResult.extractedParams?.excludeAirbnb !== false;
  const userWantsAirbnb = routingResult.extractedParams?.includeAirbnb === true;
  const userWantsAccommodation = routingResult.extractedParams?.accommodationType === 'all';

  // 搜索酒店
  const hotelResults = await this.hotelDirectService.searchHotels({...});

  // 如果需要 Airbnb，也搜索 Airbnb
  let airbnbResults = [];
  if (userWantsAirbnb || userWantsAccommodation) {
    if (this.airbnbService) {
      airbnbResults = await this.airbnbService.searchListings({
        location: `${location.lat},${location.lng}`,
        // ... 其他参数
      });
    }
  }

  // 合并结果
  const allResults = [...hotelResults, ...airbnbResults];
  
  return {
    hotels: allResults,
    // ...
  };
}
```

### 方案 3: 新增独立的 Airbnb 路由目标（最简单）

**步骤**:
1. 在 `SmartRouterService` 中添加 `'airbnb'` 路由目标
2. 在 `PlanningAssistantV2Service.chat()` 中添加 `case 'airbnb':` 处理
3. 直接调用 `airbnbService.searchListings()`

**实现**:
```typescript
// planning-assistant-v2.service.ts

case 'airbnb': {
  if (!this.airbnbService) {
    this.logger.warn('AirbnbService not available');
    break;
  }

  const location = routingResult.extractedParams?.location;
  const destination = routingResult.extractedParams?.destination || dto.message;

  // 调用 Airbnb MCP 服务
  const airbnbResult = await this.airbnbService.searchListings({
    location: `${location.lat},${location.lng}`,
    // ... 其他参数
  });

  return {
    messageCN: `我为您找到了${airbnbResult.results?.length || 0}个Airbnb房源。`,
    airbnbListings: airbnbResult.results,
    routing: {
      target: 'airbnb',
      reason: 'User requested Airbnb listings',
    },
  };
}
```

---

## 📊 推荐方案

### 推荐: **方案 1 + 方案 3 组合**

**理由**:
1. **方案 1**: 增强智能路由，准确识别用户意图
2. **方案 3**: 添加独立的 Airbnb 路由处理，代码清晰
3. **组合**: 既支持"推荐 Airbnb"的明确请求，也支持"推荐住宿"的合并搜索

**实施步骤**:
1. ✅ 增强 `SmartRouterService`，添加 Airbnb 意图识别
2. ✅ 在 `PlanningAssistantV2Service` 中添加 `case 'airbnb':` 处理
3. ✅ 可选：添加 `case 'accommodation':` 处理（同时搜索酒店和 Airbnb）
4. ✅ 注入 `AirbnbService` 到 `PlanningAssistantV2Service`
5. ✅ 更新文档和测试

---

## 🔧 实施细节

### 1. 修改 SmartRouterService

```typescript
// smart-router.service.ts

export type RoutingTarget = 
  | 'recommendations' 
  | 'generate' 
  | 'compare' 
  | 'hotel' 
  | 'airbnb'        // 🆕 新增
  | 'accommodation' // 🆕 新增
  | 'chat';

// 在 routeWithLLM 的 prompt 中添加:
可选接口:
- hotel: 用户想要搜索酒店（例如："冰岛酒店"、"找酒店"、"住宿推荐（仅酒店）"）
- airbnb: 用户想要搜索 Airbnb/民宿（例如："推荐 Airbnb"、"找民宿"、"短租"）
- accommodation: 用户想要搜索住宿（包括酒店和 Airbnb）（例如："推荐住宿"、"找住处"）
- chat: 其他对话、问答、闲聊

// 在 routeByKeywords 中添加:
// Airbnb 相关关键词
if (lowerMessage.includes('airbnb') || 
    lowerMessage.includes('民宿') || 
    lowerMessage.includes('短租') ||
    lowerMessage.includes('bnb') && !lowerMessage.includes('hotel')) {
  return {
    target: 'airbnb',
    confidence: 0.9,
    reason: 'User wants Airbnb listings',
    reasonCN: '用户想要搜索 Airbnb/民宿',
    extractedParams: {
      naturalLanguage: message,
      excludeAirbnb: false,
    },
  };
}

// 住宿相关关键词（包括酒店和 Airbnb）
if (lowerMessage.includes('住宿') && !lowerMessage.includes('酒店') && !lowerMessage.includes('airbnb')) {
  return {
    target: 'accommodation',
    confidence: 0.85,
    reason: 'User wants accommodation (hotels + Airbnb)',
    reasonCN: '用户想要搜索住宿（包括酒店和 Airbnb）',
    extractedParams: {
      naturalLanguage: message,
      excludeAirbnb: false,
    },
  };
}
```

### 2. 修改 PlanningAssistantV2Service

```typescript
// planning-assistant-v2.service.ts

constructor(
  // ... 现有依赖
  @Optional() private readonly airbnbService?: any, // 🆕 新增 AirbnbService
) {}

async chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
  // ... 现有代码

  switch (routingResult.target) {
    // ... 现有 case

    case 'airbnb': {
      // 🆕 新增 Airbnb 搜索处理
      if (!this.airbnbService) {
        this.logger.warn('AirbnbService not available, falling back to chat');
        break;
      }

      try {
        // 提取位置和参数
        let location = routingResult.extractedParams?.location;
        const destination = routingResult.extractedParams?.destination || dto.message;

        // 地理编码（如果没有位置）
        if (!location && destination && this.googleMapsDirectService) {
          // ... 地理编码逻辑（复用现有代码）
        }

        if (!location) {
          throw new Error('无法确定搜索位置');
        }

        // 调用 Airbnb MCP 服务
        const airbnbResult = await this.airbnbService.searchListings({
          location: `${location.lat},${location.lng}`,
          // 可以从用户消息中提取日期、人数等参数
        });

        const listings = airbnbResult.results || [];
        const messageCN = `我为您找到了${listings.length}个Airbnb房源。`;

        return {
          message: `I found ${listings.length} Airbnb listing${listings.length !== 1 ? 's' : ''} for you.`,
          messageCN,
          reply: isChinese ? messageCN : `I found ${listings.length} Airbnb listings.`,
          replyCN: messageCN,
          phase: 'RECOMMENDING',
          sessionId: dto.sessionId,
          airbnbListings: listings, // 🆕 新增字段
          routing: {
            target: routingResult.target,
            reason: routingResult.reason || 'Routed to Airbnb search',
          },
        };
      } catch (error: any) {
        this.logger.error(`Airbnb搜索失败: ${error.message}`, error.stack);
        break;
      }
    }

    case 'accommodation': {
      // 🆕 新增：同时搜索酒店和 Airbnb
      // ... 实现合并搜索逻辑
    }
  }
}
```

### 3. 更新模块依赖注入

```typescript
// planning-assistant.module.ts

@Module({
  imports: [
    // ... 现有导入
    McpModule, // 🆕 确保导入 McpModule（包含 AirbnbService）
  ],
  providers: [
    PlanningAssistantV2Service,
    // ... 其他 providers
  ],
})
```

---

## ✅ 验收标准

### 功能验收

- [ ] 用户说"推荐 Airbnb" → 调用 Airbnb MCP，返回 Airbnb 房源
- [ ] 用户说"推荐民宿" → 调用 Airbnb MCP，返回 Airbnb 房源
- [ ] 用户说"推荐酒店" → 只调用 Hotel API，排除 Airbnb
- [ ] 用户说"推荐住宿" → 同时调用 Hotel 和 Airbnb，合并结果（可选）

### 技术验收

- [ ] `SmartRouterService` 能正确识别 Airbnb 意图
- [ ] `PlanningAssistantV2Service` 能调用 `airbnbService.searchListings()`
- [ ] 错误处理完善（Airbnb 服务不可用时降级）
- [ ] 日志记录完整

---

## 📝 总结

### 当前状态
❌ **不支持**通过用户自然语言输入调用 Airbnb MCP 服务

### 问题根源
1. 智能路由不支持 Airbnb 意图识别
2. 酒店搜索默认排除 Airbnb，且没有调用 Airbnb MCP 的代码

### 解决方案
推荐实施**方案 1 + 方案 3 组合**：
1. 增强智能路由，添加 Airbnb 意图识别
2. 添加独立的 Airbnb 路由处理
3. 可选：添加"住宿"路由，同时搜索酒店和 Airbnb

### 预计工作量
- **开发时间**: 2-3 小时
- **测试时间**: 1 小时
- **总计**: 3-4 小时

---

**报告生成日期**: 2026-02-08  
**状态**: ⚠️ 需要实施改进
