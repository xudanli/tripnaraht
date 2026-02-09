# 路由修复：确保"推荐酒店"正确路由到 hotel 服务

**修复日期**: 2026-02-09  
**问题**: "推荐酒店"被误路由到 `recommendations`（目的地推荐）  
**优先级**: P0（阻塞功能）

---

## 🔍 问题分析

### 现象
用户点击"推荐酒店"按钮时，系统将其路由到 `recommendations`（目的地推荐），而不是 `hotel`（酒店搜索）。

### 根本原因

**问题1: 路由优先级逻辑缺陷**

在 `SmartRouterService.route()` 方法中，路由优先级逻辑存在缺陷：

```typescript
// 修复前的逻辑
if (llmResult && llmResult.confidence > 0.6) {
  // 如果 LLM 路由到具体服务，且关键词也匹配到具体服务，优先使用关键词结果
  if (specificServiceTargets.includes(llmResult.target) && 
      specificServiceTargets.includes(keywordResult.target) &&
      keywordResult.confidence >= 0.8) {
    return keywordResult;
  }
  return llmResult; // ❌ 如果 LLM 路由到 recommendations，会直接返回
}
```

**问题**:
- 如果关键词路由匹配到 `hotel`（置信度 0.95）
- 但 LLM 路由到了 `recommendations`（置信度 > 0.6）
- 由于 `recommendations` 不在 `specificServiceTargets` 中，不会进入优先使用关键词结果的逻辑
- 直接返回 `llmResult`，导致路由到 `recommendations`

**问题2: 关键词匹配可能不够严格**

虽然 `hotelKeywords` 包含了"推荐酒店"，但可能存在边界情况导致匹配失败。

---

## ✅ 修复方案

### 修复1: 增强路由优先级逻辑

**文件**: `src/agent/assistants/planning-assistant/services/smart-router.service.ts`

**修改内容**:

```typescript
// 修复后的逻辑
if (llmResult && llmResult.confidence > 0.6) {
  // 优先级规则1: 如果关键词路由匹配到具体服务（如 hotel），且置信度足够高（>= 0.8），优先使用关键词结果
  // 这可以防止 LLM 将"推荐酒店"误判为 recommendations
  if (specificServiceTargets.includes(keywordResult.target) && 
      keywordResult.confidence >= 0.8) {
    // 如果 LLM 也路由到具体服务，且与关键词路由一致，使用关键词结果（更可靠）
    if (specificServiceTargets.includes(llmResult.target) && 
        llmResult.target === keywordResult.target) {
      this.logger.debug(`关键词路由与LLM路由一致，使用关键词结果: ${keywordResult.target}`);
      return keywordResult;
    }
    // 如果 LLM 路由到 recommendations 或其他非具体服务，但关键词路由匹配到具体服务，优先使用关键词路由
    if (!specificServiceTargets.includes(llmResult.target) || 
        llmResult.target === 'recommendations') {
      this.logger.debug(
        `关键词路由优先级更高（${keywordResult.target}, confidence=${keywordResult.confidence}），` +
        `覆盖LLM路由（${llmResult.target}, confidence=${llmResult.confidence}）`
      );
      return keywordResult; // ✅ 优先使用关键词路由
    }
  }
  // 优先级规则2: 如果 LLM 路由到具体服务，且关键词也匹配到具体服务，优先使用关键词结果（更可靠）
  if (specificServiceTargets.includes(llmResult.target) && 
      specificServiceTargets.includes(keywordResult.target) &&
      keywordResult.confidence >= 0.8) {
    this.logger.debug(`关键词路由优先级更高，使用关键词结果: ${keywordResult.target}`);
    return keywordResult;
  }
  return llmResult;
}
```

**关键改进**:
1. **优先级规则1**: 如果关键词路由匹配到具体服务（如 `hotel`）且置信度 >= 0.8，即使 LLM 路由到了 `recommendations`，也优先使用关键词路由结果
2. **优先级规则2**: 如果 LLM 和关键词都路由到具体服务，优先使用关键词路由结果（更可靠）
3. **详细日志**: 添加了详细的调试日志，记录路由决策过程

### 修复2: 增强关键词匹配和日志

**修改内容**:

```typescript
// 酒店搜索关键词（增强匹配，确保"推荐酒店"按钮正确路由）
const hotelKeywords = [
  '酒店', 'hotel', '找酒店', '搜索酒店', '推荐酒店',
  '酒店推荐', '酒店搜索', '找住宿', '住宿推荐'
];
const hasHotelKeyword = hotelKeywords.some(keyword => lowerMessage.includes(keyword));

// 特殊处理："推荐酒店"必须路由到 hotel，不能路由到 recommendations
const isRecommendHotel = lowerMessage.includes('推荐') && lowerMessage.includes('酒店');

if (hasHotelKeyword || isRecommendHotel) {
  this.logger.debug(
    `[关键词路由] 酒店关键词匹配: message="${message}", ` +
    `hasHotelKeyword=${hasHotelKeyword}, isRecommendHotel=${isRecommendHotel}, ` +
    `lowerMessage="${lowerMessage}"`
  );
  // ... 后续处理
}
```

**关键改进**:
1. **双重检查**: 除了检查 `hotelKeywords`，还单独检查 `isRecommendHotel`（包含"推荐"和"酒店"）
2. **详细日志**: 记录匹配过程，帮助调试

---

## 📊 修复前后对比

### 修复前

| 场景 | 关键词路由 | LLM 路由 | 最终路由 | 结果 |
|------|-----------|---------|---------|------|
| "推荐酒店" | `hotel` (0.95) | `recommendations` (0.7) | `recommendations` | ❌ 错误 |
| "推荐冰岛的酒店" | `hotel` (0.95) | `hotel` (0.8) | `hotel` | ✅ 正确 |

### 修复后

| 场景 | 关键词路由 | LLM 路由 | 最终路由 | 结果 |
|------|-----------|---------|---------|------|
| "推荐酒店" | `hotel` (0.95) | `recommendations` (0.7) | `hotel` | ✅ 正确 |
| "推荐冰岛的酒店" | `hotel` (0.95) | `hotel` (0.8) | `hotel` | ✅ 正确 |

---

## 🎯 路由优先级规则（修复后）

1. **最高优先级**: 关键词路由匹配到具体服务（如 `hotel`）且置信度 >= 0.8
   - 即使 LLM 路由到了 `recommendations`，也优先使用关键词路由
   - 这确保了"推荐酒店"、"找酒店"等明确的关键词能正确路由

2. **次高优先级**: 关键词路由和 LLM 路由都匹配到具体服务
   - 优先使用关键词路由结果（更可靠）

3. **默认优先级**: LLM 路由结果
   - 如果关键词路由没有匹配到具体服务，使用 LLM 路由结果

---

## 🔧 技术细节

### 关键词路由置信度

- `hotel`: 0.95（非常高）
- `accommodation`: 0.85（高）
- `airbnb`: 0.95（非常高）

### 置信度阈值

- `hotel`: 0.75（降低阈值，确保能匹配）
- 其他具体服务: 0.8

### 关键词列表

```typescript
const hotelKeywords = [
  '酒店', 'hotel', '找酒店', '搜索酒店', '推荐酒店',
  '酒店推荐', '酒店搜索', '找住宿', '住宿推荐'
];
```

---

## 📝 测试建议

### 测试用例1: "推荐酒店"

```bash
POST /api/agent/planning-assistant/v2/chat
{
  "sessionId": "xxx",
  "message": "推荐酒店",
  "context": {
    "tripId": "trip_123",
    "countryCode": "IS"
  }
}
```

**预期结果**:
- ✅ 关键词路由匹配到 `hotel`（置信度 0.95）
- ✅ 即使 LLM 路由到 `recommendations`，也优先使用关键词路由
- ✅ 最终路由到 `hotel`
- ✅ 返回酒店搜索结果

### 测试用例2: "推荐冰岛的酒店"

```bash
POST /api/agent/planning-assistant/v2/chat
{
  "sessionId": "xxx",
  "message": "推荐冰岛的酒店"
}
```

**预期结果**:
- ✅ 关键词路由匹配到 `hotel`（置信度 0.95）
- ✅ LLM 路由到 `hotel`（置信度 > 0.6）
- ✅ 最终路由到 `hotel`
- ✅ 返回冰岛的酒店搜索结果

### 测试用例3: "推荐一些目的地"

```bash
POST /api/agent/planning-assistant/v2/chat
{
  "sessionId": "xxx",
  "message": "推荐一些目的地"
}
```

**预期结果**:
- ✅ 关键词路由没有匹配到具体服务
- ✅ LLM 路由到 `recommendations`（置信度 > 0.6）
- ✅ 最终路由到 `recommendations`
- ✅ 返回目的地推荐结果

---

## 🚀 后续优化建议

### P1: LLM Prompt 优化

- 在 LLM prompt 中更明确地强调："如果消息包含'酒店'或'hotel'，必须路由到 hotel，不要路由到 recommendations"
- 添加更多示例，帮助 LLM 理解

### P2: 关键词匹配优化

- 考虑使用更精确的正则表达式匹配
- 支持更多变体（如"酒店推荐"、"推荐酒店"、"找酒店"等）

### P3: 路由决策日志

- 添加更详细的路由决策日志，记录：
  - 关键词路由结果
  - LLM 路由结果
  - 最终选择的路由
  - 选择原因

---

## ✅ 修复完成

- ✅ 增强路由优先级逻辑，确保关键词路由优先于 LLM 路由
- ✅ 特殊处理"推荐酒店"，确保正确路由到 `hotel`
- ✅ 添加详细的调试日志
- ✅ 代码通过 linter 检查

**状态**: ✅ **已修复，可以测试**
