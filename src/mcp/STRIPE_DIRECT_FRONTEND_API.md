# Stripe Direct API 前端接口文档

**服务名称**: Stripe Direct API  
**Base URL**: `/api/stripe`  
**认证**: 需要 JWT Bearer Token（所有接口都需要用户认证）

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [安全说明](#安全说明)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/stripe/health \
  -H "Authorization: Bearer {access_token}"
```

**响应**:
```json
{
  "success": true,
  "available": true
}
```

### 2. 获取连接状态

```bash
curl http://localhost:3000/api/stripe/connection-status \
  -H "Authorization: Bearer {access_token}"
```

### 3. 创建支付意图

```bash
curl -X POST http://localhost:3000/api/stripe/payment-intent \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "currency": "usd",
    "metadata": {
      "tripId": "trip_123"
    }
  }'
```

---

## 📡 API 端点

### 基础端点

#### 1. 检查服务状态

**端点**: `GET /api/stripe/health`

**描述**: 检查 Stripe 服务是否可用

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
curl http://localhost:3000/api/stripe/health \
  -H "Authorization: Bearer {access_token}"
```

---

#### 2. 获取连接状态

**端点**: `GET /api/stripe/connection-status`

**描述**: 获取当前用户的 Stripe 连接状态

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**响应**:
```typescript
interface ConnectionStatusResponse {
  success: boolean;
  connected: boolean;
  stripeAccountId?: string;
  stripeCustomerId?: string;
  isActive: boolean;
}
```

**示例**:
```bash
curl http://localhost:3000/api/stripe/connection-status \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "connected": true,
  "stripeCustomerId": "cus_1234567890",
  "isActive": true
}
```

---

### 支付端点

#### 3. 创建支付意图

**端点**: `POST /api/stripe/payment-intent`

**描述**: 创建新的支付意图（Payment Intent）

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface CreatePaymentIntentRequest {
  amount: number;              // 支付金额（单位：分），例如 1000 = $10.00
  currency?: string;           // 货币代码（默认: "usd"）
  metadata?: Record<string, string>;  // 附加元数据（例如 tripId, bookingId）
  paymentMethodId?: string;    // 支付方式 ID（可选）
}
```

**响应**:
```typescript
interface CreatePaymentIntentResponse {
  success: boolean;
  paymentIntent: {
    id: string;                 // Payment Intent ID
    clientSecret: string;       // Client Secret（用于前端确认支付）
    status: string;            // 状态：requires_payment_method, requires_confirmation, requires_action, processing, succeeded, canceled
    amount: number;            // 金额（分）
    currency: string;          // 货币代码
  };
}
```

**状态说明**:
- `requires_payment_method`: 需要支付方式
- `requires_confirmation`: 需要确认
- `requires_action`: 需要用户操作（3D Secure 等）
- `processing`: 处理中
- `succeeded`: 成功
- `canceled`: 已取消

**示例**:
```bash
curl -X POST http://localhost:3000/api/stripe/payment-intent \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "currency": "usd",
    "metadata": {
      "tripId": "trip_123",
      "bookingId": "booking_456"
    }
  }'
```

**响应示例**:
```json
{
  "success": true,
  "paymentIntent": {
    "id": "pi_1234567890",
    "clientSecret": "pi_1234567890_secret_abc123",
    "status": "requires_payment_method",
    "amount": 10000,
    "currency": "usd"
  }
}
```

---

#### 4. 确认支付意图

**端点**: `POST /api/stripe/payment-intent/:id/confirm`

**描述**: 确认支付意图，完成支付流程

**认证**: 需要 Bearer Token

**路径参数**:
- `id` (string, required) - Payment Intent ID

**请求体**:
```typescript
interface ConfirmPaymentIntentRequest {
  paymentMethodId?: string;    // 支付方式 ID（可选）
}
```

**响应**:
```typescript
interface ConfirmPaymentIntentResponse {
  success: boolean;
  paymentIntent: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  };
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/stripe/payment-intent/pi_1234567890/confirm \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentMethodId": "pm_1234567890"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "paymentIntent": {
    "id": "pi_1234567890",
    "status": "succeeded",
    "amount": 10000,
    "currency": "usd"
  }
}
```

---

#### 5. 获取支付意图状态

**端点**: `GET /api/stripe/payment-intent/:id`

**描述**: 获取支付意图的当前状态

**认证**: 需要 Bearer Token

**路径参数**:
- `id` (string, required) - Payment Intent ID

**响应**:
```typescript
interface GetPaymentIntentResponse {
  success: boolean;
  paymentIntent: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  };
}
```

**示例**:
```bash
curl http://localhost:3000/api/stripe/payment-intent/pi_1234567890 \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "paymentIntent": {
    "id": "pi_1234567890",
    "status": "succeeded",
    "amount": 10000,
    "currency": "usd",
    "metadata": {
      "tripId": "trip_123",
      "bookingId": "booking_456"
    }
  }
}
```

---

#### 6. 处理退款

**端点**: `POST /api/stripe/refund`

**描述**: 为已完成的支付创建退款

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface RefundRequest {
  paymentIntentId: string;     // Payment Intent ID
  amount?: number;              // 退款金额（单位：分），不提供则全额退款
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';  // 退款原因
}
```

**响应**:
```typescript
interface RefundResponse {
  success: boolean;
  refund: {
    id: string;                 // Refund ID
    amount: number;             // 退款金额（分）
    currency: string;           // 货币代码
    status: string;             // 状态：pending, succeeded, failed, canceled
  };
}
```

**示例**:
```bash
# 全额退款
curl -X POST http://localhost:3000/api/stripe/refund \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentIntentId": "pi_1234567890",
    "reason": "requested_by_customer"
  }'

# 部分退款
curl -X POST http://localhost:3000/api/stripe/refund \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentIntentId": "pi_1234567890",
    "amount": 5000,
    "reason": "requested_by_customer"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "refund": {
    "id": "re_1234567890",
    "amount": 10000,
    "currency": "usd",
    "status": "succeeded"
  }
}
```

---

#### 7. 获取支付历史

**端点**: `GET /api/stripe/payment-history`

**描述**: 获取当前用户的支付历史记录

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**查询参数**:
- `limit` (number, optional) - 返回数量限制（默认: 10）
- `startingAfter` (string, optional) - 分页游标（Payment Intent ID）

**响应**:
```typescript
interface PaymentHistoryResponse {
  success: boolean;
  paymentIntents: Array<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    created: number;            // Unix timestamp
    metadata: Record<string, string>;
  }>;
}
```

**示例**:
```bash
# 获取最近 10 条记录
curl http://localhost:3000/api/stripe/payment-history?limit=10 \
  -H "Authorization: Bearer {access_token}"

# 分页获取
curl http://localhost:3000/api/stripe/payment-history?limit=10&startingAfter=pi_1234567890 \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "paymentIntents": [
    {
      "id": "pi_1234567890",
      "status": "succeeded",
      "amount": 10000,
      "currency": "usd",
      "created": 1704067200,
      "metadata": {
        "tripId": "trip_123"
      }
    }
  ]
}
```

---

### Stripe Connect OAuth 端点（平台模式）

#### 8. 初始化 Stripe Connect OAuth

**端点**: `GET /api/stripe/connect/oauth/initiate`

**描述**: 初始化 Stripe Connect OAuth 流程，获取授权 URL

**认证**: 需要 Bearer Token

**查询参数**:
- `redirectUri` (string, required) - OAuth 回调 URL

**响应**:
```typescript
interface InitiateOAuthResponse {
  success: boolean;
  authUrl: string;              // Stripe Connect OAuth 授权 URL
}
```

**示例**:
```bash
curl "http://localhost:3000/api/stripe/connect/oauth/initiate?redirectUri=https://example.com/callback" \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "authUrl": "https://connect.stripe.com/oauth/authorize?response_type=code&client_id=ca_...&scope=read_write&redirect_uri=https://example.com/callback&state=..."
}
```

---

#### 9. 完成 Stripe Connect OAuth

**端点**: `POST /api/stripe/connect/oauth/callback`

**描述**: 完成 Stripe Connect OAuth 流程，保存连接信息

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface CompleteOAuthRequest {
  code: string;                 // OAuth 授权码
  state: string;                // OAuth state 参数（用于验证）
}
```

**响应**:
```typescript
interface CompleteOAuthResponse {
  success: boolean;
  message: string;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/stripe/connect/oauth/callback \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "ac_1234567890",
    "state": "state_1234567890"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "message": "Stripe Connect OAuth completed successfully"
}
```

---

## 📊 数据模型

### PaymentIntent 状态

```typescript
type PaymentIntentStatus = 
  | 'requires_payment_method'   // 需要支付方式
  | 'requires_confirmation'     // 需要确认
  | 'requires_action'           // 需要用户操作（3D Secure）
  | 'processing'               // 处理中
  | 'succeeded'                 // 成功
  | 'canceled';                 // 已取消
```

### Refund 状态

```typescript
type RefundStatus = 
  | 'pending'                   // 待处理
  | 'succeeded'                 // 成功
  | 'failed'                     // 失败
  | 'canceled';                  // 已取消
```

---

## ⚠️ 错误处理

### 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;               // 错误代码
    message: string;            // 错误消息
  };
}
```

### 常见错误代码

| 错误代码 | HTTP 状态码 | 描述 |
|---------|------------|------|
| `STRIPE_ERROR` | 500 | Stripe API 错误 |
| `UNAUTHORIZED` | 401 | 未认证或 token 无效 |
| `BAD_REQUEST` | 400 | 请求参数错误 |
| `NOT_FOUND` | 404 | 资源不存在 |

### 错误示例

```json
{
  "success": false,
  "error": {
    "code": "STRIPE_ERROR",
    "message": "No such payment_intent: 'pi_invalid'"
  }
}
```

---

## 💡 使用示例

### 完整支付流程

```typescript
// 1. 创建支付意图
const createPaymentIntent = async (amount: number, metadata: Record<string, string>) => {
  const response = await fetch('/api/stripe/payment-intent', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency: 'usd',
      metadata,
    }),
  });
  
  const data = await response.json();
  return data.paymentIntent;
};

// 2. 使用 Stripe.js 确认支付（前端）
const confirmPayment = async (clientSecret: string, paymentMethodId: string) => {
  const stripe = await loadStripe('pk_test_...');
  const result = await stripe.confirmCardPayment(clientSecret, {
    payment_method: paymentMethodId,
  });
  
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  return result.paymentIntent;
};

// 3. 或者使用后端 API 确认支付
const confirmPaymentIntent = async (paymentIntentId: string, paymentMethodId?: string) => {
  const response = await fetch(`/api/stripe/payment-intent/${paymentIntentId}/confirm`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentMethodId }),
  });
  
  const data = await response.json();
  return data.paymentIntent;
};

// 4. 查询支付状态
const getPaymentStatus = async (paymentIntentId: string) => {
  const response = await fetch(`/api/stripe/payment-intent/${paymentIntentId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  const data = await response.json();
  return data.paymentIntent;
};
```

---

## 🔐 安全说明

### 认证

- 所有接口都需要 JWT Bearer Token
- Token 中必须包含有效的 `userId`
- 用户只能访问自己的支付信息

### 数据加密

- OAuth tokens 使用 AES-256-CBC 加密存储
- 生产环境必须设置强加密密钥 `STRIPE_ENCRYPTION_KEY`

### 最佳实践

1. **前端**: 使用 Stripe.js 处理支付方式收集和确认
2. **后端**: 使用 Payment Intent API 管理支付状态
3. **Webhook**: 配置 Stripe Webhook 监听支付状态变更
4. **错误处理**: 始终处理支付失败的情况
5. **日志记录**: 记录所有支付操作（建议）

---

## 📚 完整 API 端点列表

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/stripe/health` | 检查服务状态 | ✅ |
| GET | `/api/stripe/connection-status` | 获取连接状态 | ✅ |
| POST | `/api/stripe/payment-intent` | 创建支付意图 | ✅ |
| POST | `/api/stripe/payment-intent/:id/confirm` | 确认支付意图 | ✅ |
| GET | `/api/stripe/payment-intent/:id` | 获取支付意图状态 | ✅ |
| POST | `/api/stripe/refund` | 处理退款 | ✅ |
| GET | `/api/stripe/payment-history` | 获取支付历史 | ✅ |
| GET | `/api/stripe/connect/oauth/initiate` | 初始化 OAuth | ✅ |
| POST | `/api/stripe/connect/oauth/callback` | 完成 OAuth | ✅ |

---

**最后更新**: 2026-02-07  
**版本**: 1.0.0  
**状态**: ✅ 生产可用
