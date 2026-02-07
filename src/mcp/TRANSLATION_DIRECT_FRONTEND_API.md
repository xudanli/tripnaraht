# Translation Direct API 前端接口文档

**服务名称**: Translation Direct API  
**Base URL**: `/api/translation`  
**认证**: 需要 JWT Bearer Token（所有接口都需要用户认证）  
**数据源**: Google Cloud Translation API

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [用户设置功能](#用户设置功能)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/translation/health \
  -H "Authorization: Bearer {access_token}"
```

**响应**:
```json
{
  "success": true,
  "available": true
}
```

### 2. 翻译文本

```bash
curl -X POST http://localhost:3000/api/translation/translate \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, world!",
    "target": "zh"
  }'
```

### 3. 智能翻译（基于用户设置）

```bash
curl -X POST http://localhost:3000/api/translation/smart-translate \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Good morning",
    "targetLanguage": "ja"
  }'
```

---

## 📡 API 端点

### 基础端点

#### 1. 检查服务状态

**端点**: `GET /api/translation/health`

**描述**: 检查 Translation 服务是否可用

**认证**: 需要 Bearer Token

**响应**:
```typescript
interface HealthResponse {
  success: boolean;
  available: boolean;
}
```

**示例**:
```bash
curl http://localhost:3000/api/translation/health \
  -H "Authorization: Bearer {access_token}"
```

---

#### 2. 翻译文本

**端点**: `POST /api/translation/translate`

**描述**: 翻译单个文本或文本数组

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface TranslationRequest {
  text: string | string[];  // 单个文本或文本数组
  target: string;           // 目标语言代码（如 'en', 'zh', 'ja'）
  source?: string;          // 源语言代码（可选，不提供则自动检测）
  format?: 'text' | 'html'; // 文本格式（默认: 'text'）
}
```

**响应**:
```typescript
// 单个文本翻译
interface TranslationResponse {
  success: boolean;
  result: {
    translatedText: string;
    detectedSourceLanguage?: string;
    originalText: string;
  };
}

// 批量翻译
interface BatchTranslationResponse {
  success: boolean;
  result: Array<{
    translatedText: string;
    detectedSourceLanguage?: string;
    originalText: string;
  }>;
}
```

**示例**:

单个文本翻译:
```bash
curl -X POST http://localhost:3000/api/translation/translate \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, world!",
    "target": "zh"
  }'
```

批量翻译:
```bash
curl -X POST http://localhost:3000/api/translation/translate \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": ["Good morning", "How are you?", "Thank you"],
    "target": "ja"
  }'
```

指定源语言:
```bash
curl -X POST http://localhost:3000/api/translation/translate \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bonjour le monde",
    "source": "fr",
    "target": "en"
  }'
```

---

#### 3. 检测语言

**端点**: `POST /api/translation/detect`

**描述**: 检测文本的语言

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface DetectLanguageRequest {
  text: string;
}
```

**响应**:
```typescript
interface DetectLanguageResponse {
  success: boolean;
  language: string;      // 语言代码（如 'en', 'zh', 'fr'）
  confidence: number;    // 置信度（0-1）
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/translation/detect \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bonjour le monde"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "language": "fr",
  "confidence": 0.99
}
```

---

#### 4. 获取支持的语言列表

**端点**: `GET /api/translation/languages`

**描述**: 获取支持的语言列表

**认证**: 需要 Bearer Token

**查询参数**:
- `target` (可选): 目标语言代码，用于获取语言名称（如 'zh' 表示获取中文名称）

**响应**:
```typescript
interface SupportedLanguagesResponse {
  success: boolean;
  languages: Array<{
    language: string;  // 语言代码
    name: string;      // 语言名称（如果提供了 target 参数）
  }>;
  count: number;
}
```

**示例**:

获取所有语言（英文名称）:
```bash
curl http://localhost:3000/api/translation/languages \
  -H "Authorization: Bearer {access_token}"
```

获取所有语言（中文名称）:
```bash
curl "http://localhost:3000/api/translation/languages?target=zh" \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "languages": [
    { "language": "en", "name": "英语" },
    { "language": "zh", "name": "中文" },
    { "language": "ja", "name": "日语" },
    ...
  ],
  "count": 100
}
```

---

### 用户设置端点

#### 5. 获取用户翻译设置

**端点**: `GET /api/translation/settings`

**描述**: 获取当前用户的翻译设置

**认证**: 需要 Bearer Token（自动从 token 中获取用户 ID）

**响应**:
```typescript
interface UserTranslationSettingsResponse {
  success: boolean;
  settings: {
    defaultTargetLanguage: string;  // 默认目标语言（如 'en'）
    preferredLanguages: string[];   // 偏好语言列表
    autoDetect: boolean;            // 是否自动检测源语言
  };
}
```

**示例**:
```bash
curl http://localhost:3000/api/translation/settings \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "settings": {
    "defaultTargetLanguage": "en",
    "preferredLanguages": ["en", "zh", "ja"],
    "autoDetect": true
  }
}
```

---

#### 6. 保存用户翻译设置

**端点**: `POST /api/translation/settings`

**描述**: 保存当前用户的翻译设置

**认证**: 需要 Bearer Token（自动从 token 中获取用户 ID）

**请求体**:
```typescript
interface SaveTranslationSettingsRequest {
  defaultTargetLanguage?: string;  // 默认目标语言
  preferredLanguages?: string[];   // 偏好语言列表
  autoDetect?: boolean;            // 是否自动检测源语言
}
```

**响应**:
```typescript
interface SaveTranslationSettingsResponse {
  success: boolean;
  message: string;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/translation/settings \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "defaultTargetLanguage": "zh",
    "preferredLanguages": ["zh", "en", "ja"],
    "autoDetect": true
  }'
```

---

#### 7. 智能翻译（基于用户设置）

**端点**: `POST /api/translation/smart-translate`

**描述**: 智能翻译，自动使用用户的默认目标语言和自动检测设置

**认证**: 需要 Bearer Token（自动从 token 中获取用户 ID）

**请求体**:
```typescript
interface SmartTranslateRequest {
  text: string;
  targetLanguage?: string;  // 可选，不提供则使用用户默认设置
}
```

**响应**:
```typescript
interface SmartTranslateResponse {
  success: boolean;
  translatedText: string;
  detectedSourceLanguage?: string;
  originalText: string;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/translation/smart-translate \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Good morning",
    "targetLanguage": "ja"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "translatedText": "おはようございます",
  "detectedSourceLanguage": "en",
  "originalText": "Good morning"
}
```

---

## 📊 数据模型

### TranslationResult

```typescript
interface TranslationResult {
  translatedText: string;           // 翻译后的文本
  detectedSourceLanguage?: string;   // 检测到的源语言代码
  originalText: string;             // 原始文本
}
```

### TranslationSettings

```typescript
interface TranslationSettings {
  defaultTargetLanguage: string;  // 默认目标语言代码
  preferredLanguages: string[];   // 偏好语言代码列表
  autoDetect: boolean;            // 是否自动检测源语言
}
```

---

## ⚠️ 错误处理

所有接口在发生错误时都会返回以下格式：

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;      // 错误代码（如 'TRANSLATION_ERROR'）
    message: string;   // 错误消息
  };
}
```

**常见错误**:

1. **服务不可用** (`TRANSLATION_ERROR`)
   - 原因: Google Translate API Key 未配置或无效
   - HTTP 状态码: 500

2. **无效的语言代码** (`TRANSLATION_ERROR`)
   - 原因: 提供的语言代码不支持
   - HTTP 状态码: 500

3. **认证失败** (`UNAUTHORIZED`)
   - 原因: JWT Token 无效或过期
   - HTTP 状态码: 401

---

## 💡 使用示例

### 示例 1: 翻译用户输入

```typescript
async function translateUserInput(text: string, targetLang: string) {
  const response = await fetch('/api/translation/translate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      target: targetLang,
    }),
  });

  const data = await response.json();
  if (data.success) {
    return data.result.translatedText;
  } else {
    throw new Error(data.error.message);
  }
}

// 使用
const translated = await translateUserInput('Hello', 'zh');
console.log(translated); // "你好"
```

### 示例 2: 批量翻译多个文本

```typescript
async function translateMultiple(texts: string[], targetLang: string) {
  const response = await fetch('/api/translation/translate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: texts,  // 传入数组
      target: targetLang,
    }),
  });

  const data = await response.json();
  if (data.success) {
    return data.result;  // 返回数组
  } else {
    throw new Error(data.error.message);
  }
}

// 使用
const translations = await translateMultiple(
  ['Good morning', 'How are you?', 'Thank you'],
  'ja'
);
translations.forEach((result, index) => {
  console.log(`${index + 1}. ${result.translatedText}`);
});
```

### 示例 3: 检测语言并翻译

```typescript
async function detectAndTranslate(text: string, targetLang: string) {
  // 1. 检测语言
  const detectResponse = await fetch('/api/translation/detect', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  const detectData = await detectResponse.json();
  const sourceLang = detectData.language;

  // 2. 翻译（如果源语言和目标语言不同）
  if (sourceLang !== targetLang) {
    const translateResponse = await fetch('/api/translation/translate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        source: sourceLang,
        target: targetLang,
      }),
    });

    const translateData = await translateResponse.json();
    return {
      originalLanguage: sourceLang,
      translatedText: translateData.result.translatedText,
    };
  } else {
    return {
      originalLanguage: sourceLang,
      translatedText: text,  // 无需翻译
    };
  }
}
```

### 示例 4: 使用用户设置进行智能翻译

```typescript
async function smartTranslate(text: string, targetLang?: string) {
  const response = await fetch('/api/translation/smart-translate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      targetLanguage: targetLang,  // 可选，不提供则使用用户默认设置
    }),
  });

  const data = await response.json();
  if (data.success) {
    return {
      translatedText: data.translatedText,
      detectedLanguage: data.detectedSourceLanguage,
    };
  } else {
    throw new Error(data.error.message);
  }
}

// 使用（使用用户默认设置）
const result1 = await smartTranslate('Hello');
console.log(result1.translatedText);

// 使用（指定目标语言）
const result2 = await smartTranslate('Hello', 'ja');
console.log(result2.translatedText);
```

### 示例 5: 管理用户翻译设置

```typescript
// 获取设置
async function getUserSettings() {
  const response = await fetch('/api/translation/settings', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  return data.settings;
}

// 保存设置
async function saveUserSettings(settings: {
  defaultTargetLanguage?: string;
  preferredLanguages?: string[];
  autoDetect?: boolean;
}) {
  const response = await fetch('/api/translation/settings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });

  const data = await response.json();
  return data.success;
}

// 使用
const settings = await getUserSettings();
console.log('当前设置:', settings);

await saveUserSettings({
  defaultTargetLanguage: 'zh',
  preferredLanguages: ['zh', 'en', 'ja'],
  autoDetect: true,
});
```

---

## 🔧 用户设置功能

Translation Direct API 支持用户级别的翻译设置，包括：

1. **默认目标语言**: 用户偏好的目标语言
2. **偏好语言列表**: 用户常用的语言列表
3. **自动检测**: 是否自动检测源语言

这些设置可以通过 `/api/translation/settings` 端点管理，并在使用 `/api/translation/smart-translate` 时自动应用。

---

## 📝 注意事项

1. **API Key 配置**: 需要配置 `GOOGLE_TRANSLATE_API_KEY` 或 `GOOGLE_MAPS_API_KEY` 环境变量
2. **语言代码**: 使用 ISO 639-1 语言代码（如 'en', 'zh', 'ja'）
3. **批量翻译**: 支持一次翻译多个文本，但建议单次不超过 100 条
4. **自动检测**: 如果不提供源语言，API 会自动检测，但可能影响准确性
5. **HTML 格式**: 支持翻译 HTML 格式的文本，使用 `format: 'html'` 参数

---

## 🔗 相关文档

- [Google Cloud Translation API 文档](https://cloud.google.com/translate/docs)
- [支持的语言列表](https://cloud.google.com/translate/docs/languages)
- [MCP API 文档索引](../MCP_API_DOCUMENTATION_INDEX.md)
