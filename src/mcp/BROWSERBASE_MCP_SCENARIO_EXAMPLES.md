# Browserbase MCP 场景化接口使用示例

## 📋 文档说明

**目标受众**: 产品经理、开发团队  
**文档目的**: 通过实际业务场景展示接口使用方法  
**文档版本**: v1.0

---

## 🎯 场景 1: 抓取 Booking.com 酒店价格和评分

### 业务需求

用户想要获取某个酒店的最新价格和评分信息，用于行程规划。

### 接口调用流程

#### 步骤 1: 创建浏览器会话

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/session/create \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.booking.com",
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  }'
```

**响应**:
```json
{
  "success": true,
  "data": {
    "sessionId": "session-abc123",
    "url": "https://browserbase.com/sessions/abc123"
  }
}
```

**业务说明**: 启动一个云端浏览器，准备访问 Booking.com

---

#### 步骤 2: 导航到酒店页面

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/navigate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-abc123",
    "url": "https://www.booking.com/hotel/example.html",
    "waitUntil": "load"
  }'
```

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Navigation completed"
  }
}
```

**业务说明**: 打开目标酒店页面，等待页面完全加载

---

#### 步骤 3: 提取价格和评分信息

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-abc123",
    "script": "(() => { const price = document.querySelector(\".prco-val\")?.textContent || \"\"; const rating = document.querySelector(\".bui-review-score__badge\")?.textContent || \"\"; const reviews = document.querySelector(\".bui-review-score__text\")?.textContent || \"\"; return { price: price.trim(), rating: rating.trim(), reviews: reviews.trim() }; })();"
  }'
```

**响应**:
```json
{
  "success": true,
  "data": {
    "result": {
      "price": "$150/night",
      "rating": "8.5",
      "reviews": "1,234 reviews"
    }
  }
}
```

**业务说明**: 从页面中提取价格、评分和评价数量信息

---

#### 步骤 4: 截图保存页面快照

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-abc123",
    "fullPage": false,
    "quality": 90
  }'
```

**响应**:
```json
{
  "success": true,
  "data": {
    "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "base64": "iVBORw0KGgoAAAANS..."
  }
}
```

**业务说明**: 保存页面截图作为证据，可用于后续对比或展示

---

### 完整代码示例

```typescript
// 完整的酒店信息抓取流程
async function scrapeHotelInfo(hotelUrl: string) {
  // 1. 创建会话
  const sessionResponse = await fetch('/api/browserbase-mcp/session/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.booking.com',
      viewport: { width: 1920, height: 1080 }
    })
  });
  const { sessionId } = (await sessionResponse.json()).data;

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

  // 3. 提取信息
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
  
  const evaluateResponse = await fetch('/api/browserbase-mcp/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, script: extractScript })
  });
  const hotelInfo = (await evaluateResponse.json()).data.result;

  // 4. 截图
  const screenshotResponse = await fetch('/api/browserbase-mcp/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, fullPage: false, quality: 90 })
  });
  const screenshot = (await screenshotResponse.json()).data.image;

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

## 🎯 场景 2: Airbnb 房源信息抓取

### 业务需求

抓取 Airbnb 房源的基本信息、价格、评分和设施列表。

### 接口调用流程

```typescript
async function scrapeAirbnbListing(listingUrl: string) {
  // 1. 创建会话
  const session = await createSession(listingUrl);
  
  // 2. 提取房源信息
  const extractScript = `
    (() => {
      const title = document.querySelector("h1")?.textContent || "";
      const price = document.querySelector("[data-testid='price']")?.textContent || "";
      const rating = document.querySelector("[data-testid='rating']")?.textContent || "";
      const reviews = document.querySelector("[data-testid='reviews']")?.textContent || "";
      const amenities = Array.from(document.querySelectorAll(".amenity")).map(el => el.textContent);
      
      return {
        title: title.trim(),
        price: price.trim(),
        rating: rating.trim(),
        reviews: reviews.trim(),
        amenities: amenities.filter(Boolean)
      };
    })();
  `;
  
  const info = await evaluate(session.sessionId, extractScript);
  const screenshot = await takeScreenshot(session.sessionId, { fullPage: true });
  
  return { ...info.result, screenshot };
}
```

---

## 🎯 场景 3: 表单自动填写和提交

### 业务需求

自动化填写景点门票预订表单并提交。

### 接口调用流程

```typescript
async function autoFillForm(formUrl: string, formData: {
  name: string;
  email: string;
  phone: string;
  date: string;
}) {
  // 1. 创建会话并导航到表单页面
  const session = await createSession(formUrl);
  await navigate(session.sessionId, formUrl);
  
  // 2. 填写表单字段
  const fillScript = `
    (() => {
      document.querySelector("#name").value = "${formData.name}";
      document.querySelector("#email").value = "${formData.email}";
      document.querySelector("#phone").value = "${formData.phone}";
      document.querySelector("#date").value = "${formData.date}";
      
      // 触发输入事件
      ["name", "email", "phone", "date"].forEach(id => {
        const input = document.querySelector("#" + id);
        input?.dispatchEvent(new Event('input', { bubbles: true }));
        input?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      
      return { filled: true };
    })();
  `;
  
  await evaluate(session.sessionId, fillScript);
  
  // 3. 点击提交按钮
  await click(session.sessionId, 'button[type="submit"]', { waitForNavigation: true });
  
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
  
  const result = await evaluate(session.sessionId, verifyScript);
  return result.result;
}
```

---

## 🎯 场景 4: 多步骤操作流程

### 业务需求

模拟完整的酒店搜索-筛选-查看详情流程。

### 接口调用流程

```typescript
async function searchAndFilterHotels(searchParams: {
  location: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const session = await createSession('https://www.booking.com');
  
  // 步骤 1: 搜索酒店
  await navigate(session.sessionId, 'https://www.booking.com/search');
  
  const searchScript = `
    (() => {
      document.querySelector("#ss").value = "${searchParams.location}";
      document.querySelector("#checkin_monthday").value = "${searchParams.checkIn}";
      document.querySelector("#checkout_monthday").value = "${searchParams.checkOut}";
      document.querySelector("#group_adults").value = "${searchParams.guests}";
      document.querySelector("button[type='submit']").click();
      return { searched: true };
    })();
  `;
  await evaluate(session.sessionId, searchScript);
  
  // 步骤 2: 等待搜索结果加载
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 步骤 3: 筛选结果（例如：按评分筛选）
  await click(session.sessionId, 'input[data-id="review_score:50"]');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 步骤 4: 点击第一个结果
  await click(session.sessionId, '.sr_item:first-child a', { waitForNavigation: true });
  
  // 步骤 5: 提取详情页信息
  const detailScript = `
    (() => {
      const name = document.querySelector("h2.hp__hotel-name")?.textContent || "";
      const price = document.querySelector(".prco-val")?.textContent || "";
      const rating = document.querySelector(".bui-review-score__badge")?.textContent || "";
      return { name: name.trim(), price: price.trim(), rating: rating.trim() };
    })();
  `;
  
  const details = await evaluate(session.sessionId, detailScript);
  const screenshot = await takeScreenshot(session.sessionId, { fullPage: true });
  
  return {
    ...details.result,
    screenshot
  };
}
```

---

## 📊 场景对比表

| 场景 | 接口数量 | 平均耗时 | 复杂度 | 业务价值 |
|------|---------|---------|--------|---------|
| **场景 1: 酒店价格抓取** | 4个 | ~8秒 | ⭐⭐ | ⭐⭐⭐ |
| **场景 2: 房源信息抓取** | 4个 | ~10秒 | ⭐⭐ | ⭐⭐⭐ |
| **场景 3: 表单自动填写** | 4个 | ~6秒 | ⭐⭐⭐ | ⭐⭐⭐ |
| **场景 4: 多步骤流程** | 6+个 | ~15秒 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 💡 最佳实践

### 1. 错误处理

```typescript
async function safeScrape(url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await scrapeHotelInfo(url);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 2. 批量处理

```typescript
async function batchScrape(urls: string[]) {
  const results = await Promise.all(
    urls.map(url => scrapeHotelInfo(url))
  );
  return results;
}
```

### 3. 缓存策略

```typescript
const cache = new Map();

async function cachedScrape(url: string) {
  if (cache.has(url)) {
    return cache.get(url);
  }
  
  const result = await scrapeHotelInfo(url);
  cache.set(url, result);
  return result;
}
```

---

## 🔍 产品经理评估要点

### 1. 接口易用性

**评估**: ⭐⭐⭐⭐

- ✅ 接口设计直观，易于理解
- ✅ 参数清晰，有默认值
- ✅ 错误信息明确

### 2. 业务覆盖度

**评估**: ⭐⭐⭐⭐

- ✅ 覆盖核心业务场景
- ✅ 支持复杂操作流程
- ⚠️ 部分高级功能需组合使用

### 3. 性能表现

**评估**: ⭐⭐⭐

- ✅ 单次操作响应时间合理
- ⚠️ 批量处理需优化
- ⚠️ 并发能力待验证

### 4. 成本效益

**评估**: ⭐⭐⭐⭐

- ✅ 按需付费，成本可控
- ✅ 显著提升效率
- ⚠️ 需监控使用量

---

**文档版本**: v1.0  
**创建日期**: 2026-02-06
