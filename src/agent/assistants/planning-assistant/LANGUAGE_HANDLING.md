# Planning Assistant V2 语言处理说明

**最后更新**: 2026-02-08

---

## 🌐 语言处理机制

### 自动语言检测

系统会根据以下规则自动检测用户输入的语言：

1. **显式语言参数**: 如果请求中提供了 `language: 'zh'` 或 `language: 'en'`，优先使用该参数
2. **消息内容检测**: 如果未提供语言参数，系统会自动检测消息内容是否包含中文字符
3. **默认语言**: 如果无法确定，默认使用中文（`zh`）

### 响应字段说明

`ChatResponseDto` 包含以下语言相关字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| `message` | 英文回复（始终提供） | "I found 2 destination recommendations for you." |
| `messageCN` | 中文回复（始终提供） | "我为您找到了2个目的地推荐。" |
| `reply` | 主要回复消息（根据输入语言自动选择） | 中文输入 → 中文回复，英文输入 → 英文回复 |
| `replyCN` | 中文回复（始终提供，与 messageCN 相同） | "我为您找到了2个目的地推荐。" |

### 前端使用建议

**推荐方案**: 优先使用 `reply` 字段

```typescript
// 推荐：使用 reply 字段（自动匹配用户语言）
const displayMessage = response.reply || response.messageCN || response.message;

// 或者根据用户语言偏好选择
const displayMessage = userLanguage === 'zh' 
  ? (response.replyCN || response.messageCN || response.message)
  : (response.reply || response.message);
```

**兼容方案**: 如果 `reply` 字段不存在，根据语言参数选择

```typescript
const displayMessage = language === 'zh' 
  ? response.messageCN 
  : response.message;
```

---

## 🔧 实现细节

### 中文检测算法

系统使用正则表达式检测中文字符：

```typescript
private isChineseMessage(message: string): boolean {
  if (!message || message.length === 0) {
    return false;
  }
  // 检测中文字符（CJK统一汉字、中文标点等）
  const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
  return chineseRegex.test(message);
}
```

### 语言选择逻辑

```typescript
// 1. 检查显式语言参数
if (dto.language === 'zh') {
  return chineseResponse;
}

// 2. 检测消息内容
if (this.isChineseMessage(dto.message)) {
  return chineseResponse;
}

// 3. 默认返回英文
return englishResponse;
```

---

## 📝 使用示例

### 示例 1: 中文输入

**请求**:
```json
{
  "sessionId": "session-id",
  "message": "冰岛",
  "language": "zh"
}
```

**响应**:
```json
{
  "message": "I found 2 destination recommendations for you.",
  "messageCN": "我为您找到了2个目的地推荐。",
  "reply": "我为您找到了2个目的地推荐。",
  "replyCN": "我为您找到了2个目的地推荐。",
  "phase": "RECOMMENDING"
}
```

**前端显示**: `reply` = "我为您找到了2个目的地推荐。"

---

### 示例 2: 英文输入

**请求**:
```json
{
  "sessionId": "session-id",
  "message": "Iceland",
  "language": "en"
}
```

**响应**:
```json
{
  "message": "I found 2 destination recommendations for you.",
  "messageCN": "我为您找到了2个目的地推荐。",
  "reply": "I found 2 destination recommendations for you.",
  "replyCN": "我为您找到了2个目的地推荐。",
  "phase": "RECOMMENDING"
}
```

**前端显示**: `reply` = "I found 2 destination recommendations for you."

---

### 示例 3: 自动检测（未提供 language 参数）

**请求**:
```json
{
  "sessionId": "session-id",
  "message": "冰岛有什么好玩的？"
}
```

**响应**:
```json
{
  "message": "Iceland is a great destination...",
  "messageCN": "冰岛是一个绝佳的旅行目的地...",
  "reply": "冰岛是一个绝佳的旅行目的地...",
  "replyCN": "冰岛是一个绝佳的旅行目的地...",
  "phase": "EXPLORING"
}
```

**前端显示**: `reply` = "冰岛是一个绝佳的旅行目的地..."（自动检测为中文）

---

## ⚠️ 注意事项

1. **向后兼容**: `message` 和 `messageCN` 字段始终提供，确保向后兼容
2. **智能路由**: 智能路由到业务接口时，也会根据语言自动设置 `reply` 字段
3. **LLM 回复**: 通过 LLM 生成的回复，会同时提供中英双语版本
4. **前端适配**: 建议前端优先使用 `reply` 字段，如果不存在则回退到 `messageCN` 或 `message`

---

## 🔄 迁移指南

### 旧版本前端代码

```typescript
// 旧代码：手动选择语言
const displayMessage = language === 'zh' 
  ? response.messageCN 
  : response.message;
```

### 新版本前端代码

```typescript
// 新代码：使用 reply 字段（推荐）
const displayMessage = response.reply || response.messageCN || response.message;

// 或者保持兼容性
const displayMessage = language === 'zh' 
  ? (response.replyCN || response.messageCN)
  : (response.reply || response.message);
```

---

**参考文档**:
- [API 完整文档](./API_DOCUMENTATION_COMPLETE.md)
- [DTO 定义文档](./API_REDESIGN_DTO_DEFINITIONS.md)
