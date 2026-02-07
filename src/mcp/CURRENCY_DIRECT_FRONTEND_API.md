# Currency Exchange Direct API 前端接口文档

**服务名称**: Currency Exchange Direct API  
**Base URL**: `/api/currency`  
**认证**: 需要 JWT Bearer Token（所有接口都需要用户认证）  
**数据源**: ExchangeRate API（免费版本）

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [汇率趋势分析](#汇率趋势分析)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/currency/health \
  -H "Authorization: Bearer {access_token}"
```

**响应**:
```json
{
  "success": true,
  "available": true
}
```

### 2. 获取最新汇率

```bash
curl http://localhost:3000/api/currency/latest?base=USD&symbols=EUR,GBP,JPY \
  -H "Authorization: Bearer {access_token}"
```

### 3. 货币转换

```bash
curl -X POST http://localhost:3000/api/currency/convert \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "from": "USD",
    "to": "EUR"
  }'
```

---

## 📡 API 端点

### 基础端点

#### 1. 检查服务状态

**端点**: `GET /api/currency/health`

**描述**: 检查 Currency Exchange 服务是否可用

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
curl http://localhost:3000/api/currency/health \
  -H "Authorization: Bearer {access_token}"
```

---

#### 2. 获取最新汇率

**端点**: `GET /api/currency/latest`

**描述**: 获取最新汇率，支持指定基础货币和目标货币

**认证**: 需要 Bearer Token

**查询参数**:
- `base` (string, 可选): 基础货币代码，默认 'USD'
- `symbols` (string, 可选): 逗号分隔的目标货币代码，默认返回所有

**响应**:
```typescript
interface LatestRatesResponse {
  success: boolean;
  base: string;
  date: string; // YYYY-MM-DD
  rates: Record<string, number>; // 货币代码 -> 汇率
}
```

**示例**:
```bash
# 获取 USD 到所有货币的汇率
curl "http://localhost:3000/api/currency/latest?base=USD" \
  -H "Authorization: Bearer {access_token}"

# 获取 USD 到指定货币的汇率
curl "http://localhost:3000/api/currency/latest?base=USD&symbols=EUR,GBP,JPY" \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "base": "USD",
  "date": "2026-02-07",
  "rates": {
    "EUR": 0.847,
    "GBP": 0.736,
    "JPY": 157.08,
    "CNY": 6.95
  }
}
```

---

#### 3. 获取历史汇率

**端点**: `GET /api/currency/historical`

**描述**: 获取指定日期的历史汇率

**认证**: 需要 Bearer Token

**查询参数**:
- `date` (string, 必需): 日期（YYYY-MM-DD 格式）
- `base` (string, 可选): 基础货币代码，默认 'USD'
- `symbols` (string, 可选): 逗号分隔的目标货币代码

**响应**:
```typescript
interface HistoricalRatesResponse {
  success: boolean;
  base: string;
  date: string;
  rates: Record<string, number>;
}
```

**示例**:
```bash
curl "http://localhost:3000/api/currency/historical?date=2026-02-01&base=USD&symbols=EUR,GBP" \
  -H "Authorization: Bearer {access_token}"
```

---

#### 4. 货币转换

**端点**: `POST /api/currency/convert`

**描述**: 将一种货币转换为另一种货币

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface ConvertCurrencyRequest {
  amount: number; // 金额
  from: string; // 源货币代码
  to: string; // 目标货币代码
  date?: string; // 历史日期（YYYY-MM-DD，可选）
}
```

**响应**:
```typescript
interface ConvertCurrencyResponse {
  success: boolean;
  amount: number;
  from: string;
  to: string;
  result: number; // 转换后的金额（保留两位小数）
  rate: number; // 使用的汇率
  date: string; // 汇率日期
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/currency/convert \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "from": "USD",
    "to": "EUR"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "amount": 100,
  "from": "USD",
  "to": "EUR",
  "result": 84.70,
  "rate": 0.847,
  "date": "2026-02-07"
}
```

---

#### 5. 批量货币转换

**端点**: `POST /api/currency/convert-multiple`

**描述**: 将一种货币转换为多种货币

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface ConvertMultipleRequest {
  amount: number;
  from: string;
  to: string[]; // 目标货币代码数组
}
```

**响应**:
```typescript
interface ConvertMultipleResponse {
  success: boolean;
  amount: number;
  from: string;
  results: Array<{
    to: string;
    result: number;
    rate: number;
  }>;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/currency/convert-multiple \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "from": "USD",
    "to": ["EUR", "GBP", "JPY", "CNY"]
  }'
```

**响应示例**:
```json
{
  "success": true,
  "amount": 100,
  "from": "USD",
  "results": [
    {
      "to": "EUR",
      "result": 84.70,
      "rate": 0.847
    },
    {
      "to": "GBP",
      "result": 73.60,
      "rate": 0.736
    },
    {
      "to": "JPY",
      "result": 15708.00,
      "rate": 157.08
    },
    {
      "to": "CNY",
      "result": 695.00,
      "rate": 6.95
    }
  ]
}
```

---

#### 6. 获取汇率趋势

**端点**: `GET /api/currency/trend`

**描述**: 获取最近 N 天的汇率趋势数据

**认证**: 需要 Bearer Token

**查询参数**:
- `from` (string, 必需): 源货币代码
- `to` (string, 必需): 目标货币代码
- `days` (number, 可选): 天数，默认 7

**响应**:
```typescript
interface RateTrendResponse {
  success: boolean;
  from: string;
  to: string;
  trends: Array<{
    date: string; // YYYY-MM-DD
    rate: number;
  }>;
}
```

**示例**:
```bash
curl "http://localhost:3000/api/currency/trend?from=USD&to=EUR&days=7" \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "from": "USD",
  "to": "EUR",
  "trends": [
    {
      "date": "2026-02-01",
      "rate": 0.845
    },
    {
      "date": "2026-02-02",
      "rate": 0.846
    },
    {
      "date": "2026-02-03",
      "rate": 0.847
    }
  ]
}
```

---

#### 7. 获取支持的货币列表

**端点**: `GET /api/currency/supported`

**描述**: 获取支持的货币代码列表

**认证**: 需要 Bearer Token

**响应**:
```typescript
interface SupportedCurrenciesResponse {
  success: boolean;
  currencies: string[];
  count: number;
}
```

**示例**:
```bash
curl http://localhost:3000/api/currency/supported \
  -H "Authorization: Bearer {access_token}"
```

---

#### 8. 获取用户货币设置

**端点**: `GET /api/currency/settings`

**描述**: 获取当前用户的货币偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**响应**:
```typescript
interface UserCurrencySettingsResponse {
  success: boolean;
  settings: {
    defaultCurrency: string;
    preferredCurrencies: string[];
  };
}
```

**示例**:
```bash
curl http://localhost:3000/api/currency/settings \
  -H "Authorization: Bearer {access_token}"
```

---

#### 9. 保存用户货币设置

**端点**: `POST /api/currency/settings`

**描述**: 保存或更新用户的货币偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**请求体**:
```typescript
interface SaveCurrencySettingsRequest {
  defaultCurrency?: string;
  preferredCurrencies?: string[];
}
```

**响应**:
```typescript
interface SaveCurrencySettingsResponse {
  success: boolean;
  message: string;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/currency/settings \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "defaultCurrency": "USD",
    "preferredCurrencies": ["EUR", "GBP", "JPY"]
  }'
```

---

## 📊 数据模型

### ExchangeRateResponse

```typescript
interface ExchangeRateResponse {
  base: string; // 基础货币代码
  date: string; // 日期（YYYY-MM-DD）
  rates: Record<string, number>; // 货币代码 -> 汇率
}
```

### CurrencyConversionResult

```typescript
interface CurrencyConversionResult {
  amount: number; // 原始金额
  from: string; // 源货币代码
  to: string; // 目标货币代码
  result: number; // 转换后的金额
  rate: number; // 使用的汇率
  date: string; // 汇率日期
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

### 常见错误代码

| 错误代码 | HTTP 状态码 | 描述 |
|---------|-----------|------|
| `CURRENCY_ERROR` | 500 | 通用错误 |
| `INVALID_PARAMS` | 400 | 无效的参数 |
| `UNAUTHORIZED` | 401 | 未认证 |

### 错误示例

```json
{
  "success": false,
  "error": {
    "code": "CURRENCY_ERROR",
    "message": "Exchange rate not found for USD to XXX"
  }
}
```

---

## 💡 使用示例

### TypeScript 示例

```typescript
// 获取最新汇率
async function getLatestRates(accessToken: string, base: string = 'USD') {
  const response = await fetch(
    `http://localhost:3000/api/currency/latest?base=${base}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  return data.rates;
}

// 货币转换
async function convertCurrency(
  accessToken: string,
  amount: number,
  from: string,
  to: string
) {
  const response = await fetch('http://localhost:3000/api/currency/convert', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      from,
      to,
    }),
  });

  const data = await response.json();
  return data.result;
}

// 获取汇率趋势
async function getRateTrend(
  accessToken: string,
  from: string,
  to: string,
  days: number = 7
) {
  const response = await fetch(
    `http://localhost:3000/api/currency/trend?from=${from}&to=${to}&days=${days}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  return data.trends;
}
```

---

## 📈 汇率趋势分析

### 使用场景

1. **价格对比**: 在不同货币之间对比价格
2. **预算规划**: 多币种行程的预算规划
3. **汇率趋势**: 分析汇率变化趋势，选择最佳兑换时机
4. **成本优化**: 基于汇率趋势优化支付策略

### 示例：多币种价格对比

```typescript
// 将 100 USD 转换为多种货币进行对比
const amount = 100;
const from = 'USD';
const to = ['EUR', 'GBP', 'JPY', 'CNY'];

const response = await fetch('http://localhost:3000/api/currency/convert-multiple', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ amount, from, to }),
});

const data = await response.json();
// data.results 包含所有转换结果，可以用于价格对比
```

---

## 🔒 安全说明

1. **认证**: 所有接口都需要 JWT Bearer Token 认证
2. **用户隔离**: 用户设置是用户级别的，不会泄露其他用户信息
3. **API 限制**: ExchangeRate API 免费版本有请求频率限制（每天一次）

---

## 📚 相关文档

- [ExchangeRate API 文档](https://exchangerate-api.com/docs/free)
- [Currency Direct API 集成文档](./CURRENCY_DIRECT_API.md)（待创建）
- [MCP API 文档索引](./MCP_API_DOCUMENTATION_INDEX.md)

---

**最后更新**: 2026-02-07
