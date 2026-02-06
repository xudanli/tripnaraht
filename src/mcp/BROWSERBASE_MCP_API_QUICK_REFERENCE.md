# Browserbase MCP API 快速参考

## 📋 快速导航

**Base URL**: `/api/browserbase-mcp`  
**完整文档**: `BROWSERBASE_MCP_FRONTEND_API.md`

---

## 🚀 核心接口（5个）

### 1. 创建浏览器会话

```typescript
POST /api/browserbase-mcp/session/create

// 请求
{
  url?: string;                    // 初始 URL（可选）
  userAgent?: string;              // User Agent（可选）
  viewport?: {                     // 视口设置（可选）
    width?: number;                 // 默认 1920
    height?: number;                // 默认 1080
  };
}

// 响应
{
  success: true,
  data: {
    sessionId: string;             // 会话 ID
    url?: string;                   // 会话 URL
  }
}
```

**使用示例**:
```typescript
const res = await fetch('/api/browserbase-mcp/session/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com' })
});
const { sessionId } = (await res.json()).data;
```

---

### 2. 导航到页面

```typescript
POST /api/browserbase-mcp/navigate

// 请求
{
  sessionId: string;               // 会话 ID（必需）
  url: string;                     // 目标 URL（必需）
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';  // 等待条件（可选）
}

// 响应
{
  success: true,
  data: {
    success: boolean;
    message?: string;
  }
}
```

**使用示例**:
```typescript
await fetch('/api/browserbase-mcp/navigate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    url: 'https://www.booking.com/hotel/example',
    waitUntil: 'load'
  })
});
```

---

### 3. 执行 JavaScript（提取信息）

```typescript
POST /api/browserbase-mcp/evaluate

// 请求
{
  sessionId: string;               // 会话 ID（必需）
  script: string;                   // JavaScript 代码（必需）
}

// 响应
{
  success: true,
  data: {
    result: any;                    // JavaScript 执行结果
  }
}
```

**使用示例**:
```typescript
const script = `
  (() => {
    const price = document.querySelector(".price")?.textContent || "";
    const rating = document.querySelector(".rating")?.textContent || "";
    return { price: price.trim(), rating: rating.trim() };
  })();
`;

const res = await fetch('/api/browserbase-mcp/evaluate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, script })
});
const data = (await res.json()).data.result;
```

---

### 4. 页面截图

```typescript
POST /api/browserbase-mcp/screenshot

// 请求
{
  sessionId: string;               // 会话 ID（必需）
  fullPage?: boolean;              // 是否全页截图（默认 false）
  quality?: number;                 // 图片质量 0-100（默认 90）
}

// 响应
{
  success: true,
  data: {
    image: string;                  // Base64 图片数据
    base64?: string;               // Base64 编码（如果有）
  }
}
```

**使用示例**:
```typescript
const res = await fetch('/api/browserbase-mcp/screenshot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, fullPage: true, quality: 90 })
});
const { image } = (await res.json()).data;

// 在页面中显示
const img = document.createElement('img');
img.src = `data:image/png;base64,${image}`;
document.body.appendChild(img);
```

---

### 5. 点击元素

```typescript
POST /api/browserbase-mcp/click

// 请求
{
  sessionId: string;               // 会话 ID（必需）
  selector: string;                 // CSS 选择器（必需）
  waitForNavigation?: boolean;      // 是否等待导航（默认 false）
}

// 响应
{
  success: true,
  data: {
    success: boolean;
    message?: string;
  }
}
```

**使用示例**:
```typescript
await fetch('/api/browserbase-mcp/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    selector: 'button#submit',
    waitForNavigation: true
  })
});
```

---

## 🔐 授权接口（2个）

### 6. 获取授权 URL

```typescript
GET /api/browserbase-mcp/auth/url

// 响应
{
  success: true,
  data: {
    authorizationUrl: string;       // OAuth 授权 URL
    connectionId: string;           // 连接 ID
  }
}
```

**使用示例**:
```typescript
const res = await fetch('/api/browserbase-mcp/auth/url');
const { authorizationUrl, connectionId } = (await res.json()).data;
// 用户需要访问 authorizationUrl 完成授权
// 授权完成后，保存 connectionId 到环境变量
```

---

### 7. 验证授权状态

```typescript
POST /api/browserbase-mcp/auth/verify

// 请求
{
  connectionId: string;             // 连接 ID（必需）
}

// 响应
{
  success: true,
  data: {
    isAuthorized: boolean;           // 是否已授权
    message?: string;                // 状态消息
  }
}
```

**使用示例**:
```typescript
const res = await fetch('/api/browserbase-mcp/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ connectionId: 'gazelle-CVG5' })
});
const { isAuthorized } = (await res.json()).data;
```

---

## 🔍 辅助接口（2个）

### 8. 服务健康检查

```typescript
GET /api/browserbase-mcp/health

// 响应
{
  success: true,
  data: {
    available: boolean;
    service: string;
  }
}
```

---

### 9. 列出可用工具

```typescript
GET /api/browserbase-mcp/tools

// 响应
{
  success: true,
  data: {
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: any;
    }>;
  }
}
```

---

## 🎯 常见场景代码模板

### 模板 1: 抓取页面信息

```typescript
async function scrapePageInfo(url: string) {
  // 1. 创建会话
  const sessionRes = await fetch('/api/browserbase-mcp/session/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const { sessionId } = (await sessionRes.json()).data;

  // 2. 导航（如果需要）
  await fetch('/api/browserbase-mcp/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, url, waitUntil: 'load' })
  });

  // 3. 提取信息
  const extractScript = `(() => { /* 你的提取逻辑 */ })();`;
  const evalRes = await fetch('/api/browserbase-mcp/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, script: extractScript })
  });
  const info = (await evalRes.json()).data.result;

  // 4. 截图（可选）
  const screenshotRes = await fetch('/api/browserbase-mcp/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, fullPage: false })
  });
  const screenshot = (await screenshotRes.json()).data.image;

  return { ...info, screenshot };
}
```

---

### 模板 2: 表单填写和提交

```typescript
async function fillAndSubmitForm(formUrl: string, data: any) {
  // 1. 创建会话
  const sessionRes = await fetch('/api/browserbase-mcp/session/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: formUrl })
  });
  const { sessionId } = (await sessionRes.json()).data;

  // 2. 导航到表单页面
  await fetch('/api/browserbase-mcp/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, url: formUrl, waitUntil: 'load' })
  });

  // 3. 填写表单
  const fillScript = `
    (() => {
      // 填写逻辑
      document.querySelector("#field1").value = "${data.field1}";
      // ...
      return { filled: true };
    })();
  `;
  await fetch('/api/browserbase-mcp/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, script: fillScript })
  });

  // 4. 点击提交
  await fetch('/api/browserbase-mcp/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      selector: 'button[type="submit"]',
      waitForNavigation: true
    })
  });
}
```

---

## ⚠️ 错误处理

### 统一错误格式

```typescript
{
  success: false,
  error: {
    code: string;                   // 错误代码
    message: string;                // 错误消息
  }
}
```

### 常见错误代码

- `INTERNAL_ERROR` - 服务器内部错误
- `BAD_REQUEST` - 请求参数错误

### 错误处理示例

```typescript
async function safeCall(endpoint: string, options: RequestInit) {
  try {
    const res = await fetch(endpoint, options);
    const result = await res.json();
    
    if (!result.success) {
      throw new Error(result.error?.message || '操作失败');
    }
    
    return result.data;
  } catch (error) {
    console.error('API 调用失败:', error);
    throw error;
  }
}
```

---

## 📊 响应时间参考

| 操作 | 平均响应时间 |
|------|------------|
| 创建会话 | ~2秒 |
| 页面导航 | ~3-5秒 |
| 执行 JavaScript | ~1-2秒 |
| 页面截图 | ~2-3秒 |
| 点击元素 | ~1-2秒 |

---

## 🔗 相关文档

- **完整文档**: `BROWSERBASE_MCP_FRONTEND_API.md`
- **场景示例**: `BROWSERBASE_MCP_SCENARIO_EXAMPLES.md`
- **产品文档**: `BROWSERBASE_MCP_PRODUCT_API_DOC.md`

---

**文档版本**: v1.0  
**最后更新**: 2026-02-06
