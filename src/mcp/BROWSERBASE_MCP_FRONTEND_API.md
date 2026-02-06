# Browserbase MCP 前端 API 文档

**服务名称**: Browserbase MCP Server  
**Base URL**: `/api/browserbase-mcp`  
**服务 URL**: `https://server.smithery.ai/@browserbasehq/mcp-browserbase`  
**认证**: 当前无需认证（生产环境可能需要）

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [注意事项](#注意事项)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/browserbase-mcp/health
```

**响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "browserbase-mcp"
  }
}
```

### 2. 列出可用工具

```bash
curl http://localhost:3000/api/browserbase-mcp/tools
```

### 3. 创建浏览器会话

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/session/create \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com"
  }'
```

---

## 📡 API 端点

### 1. 检查服务状态

**端点**: `GET /api/browserbase-mcp/health`

**描述**: 检查 Browserbase MCP 服务是否可用

**响应**:
```typescript
interface HealthResponse {
  success: boolean;
  data: {
    available: boolean;
    service: string;
  };
}
```

---

### 2. 列出所有可用工具

**端点**: `GET /api/browserbase-mcp/tools`

**描述**: 获取 Browserbase MCP 服务器提供的所有工具列表

**响应**:
```typescript
interface ToolsResponse {
  success: boolean;
  data: {
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: any;
    }>;
  };
}
```

---

### 3. 创建浏览器会话

**端点**: `POST /api/browserbase-mcp/session/create`

**描述**: 创建一个新的 Browserbase 浏览器会话

**请求体**:
```typescript
interface CreateSessionDto {
  url?: string;                    // 初始 URL（可选）
  userAgent?: string;              // User Agent（可选）
  viewport?: {                     // 视口设置（可选）
    width?: number;                 // 宽度（默认 1920）
    height?: number;                // 高度（默认 1080）
  };
}
```

**响应**:
```typescript
interface CreateSessionResponse {
  success: boolean;
  data: {
    sessionId: string;             // 会话 ID
    url?: string;                   // 会话 URL（如果有）
  };
}
```

**示例**:
```typescript
const createSession = async (url?: string) => {
  const response = await fetch('/api/browserbase-mcp/session/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data.sessionId;
  } else {
    throw new Error(result.error?.message || '创建会话失败');
  }
};

// 使用
const sessionId = await createSession('https://example.com');
console.log(`会话 ID: ${sessionId}`);
```

---

### 4. 导航到 URL

**端点**: `POST /api/browserbase-mcp/navigate`

**描述**: 在浏览器会话中导航到指定 URL

**请求体**:
```typescript
interface NavigateDto {
  sessionId: string;                // 会话 ID
  url: string;                      // 目标 URL
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';  // 等待条件（可选）
}
```

**响应**:
```typescript
interface NavigateResponse {
  success: boolean;
  data: {
    success: boolean;
    message?: string;
  };
}
```

**示例**:
```typescript
const navigate = async (sessionId: string, url: string) => {
  const response = await fetch('/api/browserbase-mcp/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, url, waitUntil: 'load' }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '导航失败');
  }
};
```

---

### 5. 截图

**端点**: `POST /api/browserbase-mcp/screenshot`

**描述**: 对浏览器会话进行截图

**请求体**:
```typescript
interface ScreenshotDto {
  sessionId: string;                // 会话 ID
  fullPage?: boolean;              // 是否全页截图（默认 false）
  quality?: number;                 // 图片质量 0-100（默认 90）
}
```

**响应**:
```typescript
interface ScreenshotResponse {
  success: boolean;
  data: {
    image: string;                  // 图片数据（base64 或 URL）
    base64?: string;               // Base64 编码的图片（如果有）
  };
}
```

**示例**:
```typescript
const screenshot = async (sessionId: string, fullPage = false) => {
  const response = await fetch('/api/browserbase-mcp/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, fullPage, quality: 90 }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data.image; // Base64 图片数据
  } else {
    throw new Error(result.error?.message || '截图失败');
  }
};

// 使用：在 img 标签中显示
const imageData = await screenshot(sessionId);
const img = document.createElement('img');
img.src = `data:image/png;base64,${imageData}`;
document.body.appendChild(img);
```

---

### 6. 点击元素

**端点**: `POST /api/browserbase-mcp/click`

**描述**: 在浏览器会话中点击指定元素

**请求体**:
```typescript
interface ClickDto {
  sessionId: string;                // 会话 ID
  selector: string;                 // CSS 选择器
  waitForNavigation?: boolean;      // 是否等待导航（默认 false）
}
```

**响应**:
```typescript
interface ClickResponse {
  success: boolean;
  data: {
    success: boolean;
    message?: string;
  };
}
```

**示例**:
```typescript
const click = async (sessionId: string, selector: string) => {
  const response = await fetch('/api/browserbase-mcp/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, selector }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '点击失败');
  }
};

// 使用
await click(sessionId, 'button#submit');
```

---

### 7. 执行 JavaScript

**端点**: `POST /api/browserbase-mcp/evaluate`

**描述**: 在浏览器会话中执行 JavaScript 代码

**请求体**:
```typescript
interface EvaluateDto {
  sessionId: string;                // 会话 ID
  script: string;                   // JavaScript 代码
}
```

**响应**:
```typescript
interface EvaluateResponse {
  success: boolean;
  data: {
    result: any;                     // JavaScript 执行结果
  };
}
```

**示例**:
```typescript
const evaluate = async (sessionId: string, script: string) => {
  const response = await fetch('/api/browserbase-mcp/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, script }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data.result;
  } else {
    throw new Error(result.error?.message || '执行失败');
  }
};

// 使用：获取页面标题
const title = await evaluate(sessionId, 'document.title');
console.log(`页面标题: ${title}`);

// 使用：获取页面内容
const content = await evaluate(sessionId, 'document.body.innerText');
console.log(`页面内容: ${content}`);
```

---

## 📊 数据模型

### Session

```typescript
interface Session {
  sessionId: string;                // 会话 ID
  url?: string;                     // 会话 URL
}
```

---

## ⚠️ 错误处理

### 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

### 常见错误

1. **服务不可用**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "Browserbase MCP service is not available."
     }
   }
   ```

2. **会话不存在**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "Session not found"
     }
   }
   ```

3. **选择器未找到**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "Element not found: button#submit"
     }
   }
   ```

---

## 🔐 授权管理接口

### 8. 获取授权 URL

**端点**: `GET /api/browserbase-mcp/auth/url`

**描述**: 获取 OAuth 授权 URL 和新的 connectionId

**响应**:
```typescript
interface AuthUrlResponse {
  success: boolean;
  data: {
    authorizationUrl: string;        // OAuth 授权 URL
    connectionId: string;           // 连接 ID（用于后续连接）
  };
}
```

**示例**:
```typescript
const getAuthUrl = async () => {
  const response = await fetch('/api/browserbase-mcp/auth/url');
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '获取授权 URL 失败');
  }
};

// 使用
const { authorizationUrl, connectionId } = await getAuthUrl();
console.log('请访问:', authorizationUrl);
console.log('ConnectionId:', connectionId);
```

**业务说明**: 
- 首次使用或授权过期时，需要获取授权 URL
- 用户访问授权 URL 完成 OAuth 授权
- 授权完成后，将 `connectionId` 保存到环境变量 `BROWSERBASE_MCP_CONNECTION_ID`

---

### 9. 验证授权状态

**端点**: `POST /api/browserbase-mcp/auth/verify`

**描述**: 验证指定的 connectionId 是否已完成授权

**请求体**:
```typescript
interface VerifyAuthDto {
  connectionId: string;              // 要验证的连接 ID
}
```

**响应**:
```typescript
interface VerifyAuthResponse {
  success: boolean;
  data: {
    isAuthorized: boolean;           // 是否已授权
    message?: string;                // 状态消息
  };
}
```

**示例**:
```typescript
const verifyAuth = async (connectionId: string) => {
  const response = await fetch('/api/browserbase-mcp/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '验证失败');
  }
};

// 使用
const authStatus = await verifyAuth('gazelle-CVG5');
if (authStatus.isAuthorized) {
  console.log('授权状态: 已授权');
} else {
  console.log('授权状态: 未授权', authStatus.message);
}
```

---

## 💡 使用示例

### 完整业务场景示例

#### 场景 1: 抓取酒店价格和评分

```typescript
/**
 * 完整的酒店信息抓取流程
 */
async function scrapeHotelInfo(hotelUrl: string) {
  // 1. 创建会话
  const sessionRes = await fetch('/api/browserbase-mcp/session/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.booking.com',
      viewport: { width: 1920, height: 1080 }
    })
  });
  const { sessionId } = (await sessionRes.json()).data;

  // 2. 导航到酒店页面
  await fetch('/api/browserbase-mcp/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      url: hotelUrl,
      waitUntil: 'load'
    })
  });

  // 3. 提取价格和评分
  const extractScript = `
    (() => {
      const price = document.querySelector(".prco-val")?.textContent || "";
      const rating = document.querySelector(".bui-review-score__badge")?.textContent || "";
      const reviews = document.querySelector(".bui-review-score__text")?.textContent || "";
      return {
        price: price.trim(),
        rating: rating.trim(),
        reviews: reviews.trim()
      };
    })();
  `;
  
  const evaluateRes = await fetch('/api/browserbase-mcp/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, script: extractScript })
  });
  const hotelInfo = (await evaluateRes.json()).data.result;

  // 4. 截图保存
  const screenshotRes = await fetch('/api/browserbase-mcp/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, fullPage: false, quality: 90 })
  });
  const screenshot = (await screenshotRes.json()).data.image;

  return {
    ...hotelInfo,
    screenshot
  };
}

// 使用
const hotelInfo = await scrapeHotelInfo('https://www.booking.com/hotel/example.html');
console.log('酒店信息:', hotelInfo);
```

---

#### 场景 2: 表单自动填写和提交

```typescript
/**
 * 自动化表单填写和提交
 */
async function autoFillAndSubmit(formUrl: string, formData: {
  name: string;
  email: string;
  phone: string;
}) {
  // 1. 创建会话并导航
  const sessionRes = await fetch('/api/browserbase-mcp/session/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: formUrl })
  });
  const { sessionId } = (await sessionRes.json()).data;

  await fetch('/api/browserbase-mcp/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, url: formUrl, waitUntil: 'load' })
  });

  // 2. 填写表单
  const fillScript = `
    (() => {
      document.querySelector("#name").value = "${formData.name}";
      document.querySelector("#email").value = "${formData.email}";
      document.querySelector("#phone").value = "${formData.phone}";
      
      // 触发输入事件
      ["name", "email", "phone"].forEach(id => {
        const input = document.querySelector("#" + id);
        input?.dispatchEvent(new Event('input', { bubbles: true }));
        input?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      
      return { filled: true };
    })();
  `;
  
  await fetch('/api/browserbase-mcp/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, script: fillScript })
  });

  // 3. 点击提交按钮
  await fetch('/api/browserbase-mcp/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      selector: 'button[type="submit"]',
      waitForNavigation: true
    })
  });

  // 4. 验证提交结果
  const verifyScript = `
    (() => {
      const successMessage = document.querySelector(".success-message");
      return {
        submitted: !!successMessage,
        message: successMessage?.textContent || ""
      };
    })();
  `;
  
  const verifyRes = await fetch('/api/browserbase-mcp/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, script: verifyScript })
  });
  
  return (await verifyRes.json()).data.result;
}
```

---

### React Hook 示例

```typescript
import { useState } from 'react';

export const useBrowserbase = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const createSession = async (url?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/browserbase-mcp/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      const result = await response.json();
      if (result.success) {
        setSessionId(result.data.sessionId);
        return result.data.sessionId;
      } else {
        throw new Error(result.error?.message || '创建会话失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const navigate = async (url: string) => {
    if (!sessionId) throw new Error('No active session');
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/browserbase-mcp/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, url }),
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error?.message || '导航失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const screenshot = async (fullPage = false) => {
    if (!sessionId) throw new Error('No active session');
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/browserbase-mcp/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, fullPage }),
      });
      
      const result = await response.json();
      if (result.success) {
        return result.data.image;
      } else {
        throw new Error(result.error?.message || '截图失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    sessionId,
    loading,
    error,
    createSession,
    navigate,
    screenshot,
  };
};
```

### 使用 Hook

```typescript
const BrowserComponent = () => {
  const { sessionId, loading, error, createSession, navigate, screenshot } = useBrowserbase();
  const [image, setImage] = useState<string | null>(null);

  const handleStart = async () => {
    try {
      await createSession('https://example.com');
      await navigate('https://example.com');
      const img = await screenshot();
      setImage(img);
    } catch (err) {
      console.error('操作失败:', err);
    }
  };

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  return (
    <div>
      <button onClick={handleStart}>开始浏览器会话</button>
      {image && <img src={`data:image/png;base64,${image}`} alt="Screenshot" />}
    </div>
  );
};
```

---

## ⚠️ 注意事项

### 1. 配置要求

- **Browserbase API Key**: 需要在服务器端配置 `BROWSERBASE_API_KEY`
- **Browserbase Project ID**: 需要在服务器端配置 `BROWSERBASE_PROJECT_ID`
- **服务 URL**: 默认使用 `https://server.smithery.ai/@browserbasehq/mcp-browserbase`

**如何申请 API Key**: 请参考 `BROWSERBASE_MCP_SETUP_GUIDE.md` 文档

### 2. 会话管理

- **会话生命周期**: 会话在创建后保持活跃，直到显式关闭或超时
- **会话复用**: 可以复用同一个会话 ID 进行多次操作
- **并发限制**: 注意 Browserbase 账户的并发会话限制

### 3. 性能考虑

- **截图大小**: 全页截图可能很大，注意传输和存储
- **等待时间**: 使用 `waitUntil` 参数控制页面加载等待时间
- **超时设置**: 长时间操作可能需要增加超时时间

### 4. 安全考虑

- **URL 验证**: 确保只访问可信的 URL
- **脚本执行**: 执行 JavaScript 时要小心，避免执行恶意代码
- **会话隔离**: 不同用户应该使用不同的会话

### 5. 错误处理

- **网络错误**: 处理网络连接失败的情况
- **会话错误**: 处理会话不存在或已过期的情况
- **超时**: 设置合理的超时时间

---

## 📋 接口清单

### 核心功能接口

| 接口 | 方法 | 描述 | 优先级 |
|------|------|------|--------|
| `/session/create` | POST | 创建浏览器会话 | ⭐⭐⭐⭐⭐ |
| `/navigate` | POST | 导航到页面 | ⭐⭐⭐⭐⭐ |
| `/evaluate` | POST | 执行 JavaScript 提取信息 | ⭐⭐⭐⭐⭐ |
| `/screenshot` | POST | 页面截图 | ⭐⭐⭐⭐ |
| `/click` | POST | 点击页面元素 | ⭐⭐⭐ |

### 辅助接口

| 接口 | 方法 | 描述 | 优先级 |
|------|------|------|--------|
| `/health` | GET | 服务健康检查 | ⭐⭐⭐ |
| `/tools` | GET | 列出可用工具 | ⭐⭐ |
| `/auth/url` | GET | 获取授权 URL | ⭐⭐ |
| `/auth/verify` | POST | 验证授权状态 | ⭐⭐ |

---

## 🎯 业务场景快速参考

### 场景 1: 旅游网站内容抓取

**接口调用顺序**:
```
POST /session/create → POST /navigate → POST /evaluate → POST /screenshot
```

**典型用例**: 抓取 Booking.com 酒店价格、Airbnb 房源信息

---

### 场景 2: 表单自动填写和提交

**接口调用顺序**:
```
POST /session/create → POST /navigate → POST /evaluate → POST /click
```

**典型用例**: 自动填写预订表单、提交门票订单

---

### 场景 3: 页面内容验证和截图

**接口调用顺序**:
```
POST /session/create → POST /navigate → POST /evaluate → POST /screenshot
```

**典型用例**: 验证景点开放时间、保存页面快照作为证据

---

## 🔗 相关文档

### 产品文档（产品经理）
- **产品评估摘要**: `BROWSERBASE_MCP_PRODUCT_SUMMARY.md` ⭐⭐⭐⭐⭐
- **产品接口文档**: `BROWSERBASE_MCP_PRODUCT_API_DOC.md` ⭐⭐⭐⭐
- **场景化示例**: `BROWSERBASE_MCP_SCENARIO_EXAMPLES.md` ⭐⭐⭐⭐
- **文档索引**: `BROWSERBASE_MCP_DOCS_INDEX.md`

### 技术文档
- **设置指南**: `BROWSERBASE_MCP_SETUP_GUIDE.md` - API Key 申请指南 ⭐
- **测试文档**: `scripts/README-BROWSERBASE-MCP-TEST.md`
- **测试场景**: `BROWSERBASE_MCP_PRODUCT_TEST_SCENARIOS.md`

### 外部资源
- **Browserbase 官方文档**: https://docs.browserbase.com
- **Smithery 服务器页面**: https://smithery.ai/server/@browserbasehq/mcp-browserbase

---

**最后更新**: 2026-02-06  
**文档版本**: v2.0（已更新授权接口和场景示例）
