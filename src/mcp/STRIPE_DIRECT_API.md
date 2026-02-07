# Stripe Direct API 集成文档

## 📋 概述

本文档说明如何直接使用 Stripe API 进行支付处理，**不依赖 Smithery MCP 服务**。

### 设计理念

- ✅ **直接使用 Stripe 官方 SDK** - 更稳定、更可靠
- ✅ **用户级别认证** - 每个用户的 Stripe 连接信息存储在数据库中
- ✅ **状态持久化** - 支付意图和状态存储在数据库中
- ✅ **安全性** - OAuth tokens 加密存储

---

## 🗄️ 数据库模型

### StripeConnection

存储用户的 Stripe 连接信息：

```prisma
model StripeConnection {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @map("user_id") @db.Uuid
  stripeAccountId   String?  @map("stripe_account_id") @db.Text // Stripe Connect account ID
  stripeCustomerId  String?  @map("stripe_customer_id") @db.Text // Stripe Customer ID
  accessToken       String?  @map("access_token") @db.Text // Encrypted OAuth access token
  refreshToken      String?  @map("refresh_token") @db.Text // Encrypted OAuth refresh token
  tokenExpiresAt    DateTime? @map("token_expires_at")
  isActive          Boolean  @default(true) @map("is_active")
  metadata          Json?
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  
  User User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId]) // One Stripe connection per user
}
```

### PaymentIntent

存储支付意图和状态：

```prisma
model PaymentIntent {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @map("user_id") @db.Uuid
  stripePaymentIntentId String @unique @map("stripe_payment_intent_id") @db.Text
  amount            Int      // Amount in cents
  currency          String   @default("usd") @db.VarChar(3)
  status            String   @db.VarChar(50) // created, processing, succeeded, failed, canceled
  metadata          Json?
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  
  User User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 🔧 配置

### 环境变量

```bash
# Stripe Secret Key（必需）
STRIPE_SECRET_KEY=sk_test_...

# Stripe Connect Client ID（如果使用 Connect 平台模式）
STRIPE_CONNECT_CLIENT_ID=ca_...

# 加密密钥（用于加密 OAuth tokens，生产环境必须更改）
STRIPE_ENCRYPTION_KEY=your-secure-encryption-key-32-chars
```

### 数据库迁移

```bash
# 生成迁移
npx prisma migrate dev --name add_stripe_integration

# 应用迁移
npx prisma migrate deploy
```

---

## 🚀 API 端点

### 1. 检查服务状态

```http
GET /api/stripe/health
Authorization: Bearer {access_token}
```

**响应**:
```json
{
  "success": true,
  "available": true
}
```

---

### 2. 获取连接状态

```http
GET /api/stripe/connection-status
Authorization: Bearer {access_token}
```

**响应**:
```json
{
  "success": true,
  "connected": true,
  "stripeCustomerId": "cus_...",
  "isActive": true
}
```

---

### 3. 创建支付意图

```http
POST /api/stripe/payment-intent
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "amount": 1000,  // $10.00 (in cents)
  "currency": "usd",
  "metadata": {
    "tripId": "trip_123",
    "bookingId": "booking_456"
  }
}
```

**响应**:
```json
{
  "success": true,
  "paymentIntent": {
    "id": "pi_...",
    "clientSecret": "pi_..._secret_...",
    "status": "requires_payment_method",
    "amount": 1000,
    "currency": "usd"
  }
}
```

---

### 4. 确认支付意图

```http
POST /api/stripe/payment-intent/:id/confirm
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "paymentMethodId": "pm_..."  // Optional
}
```

**响应**:
```json
{
  "success": true,
  "paymentIntent": {
    "id": "pi_...",
    "status": "succeeded",
    "amount": 1000,
    "currency": "usd"
  }
}
```

---

### 5. 获取支付意图状态

```http
GET /api/stripe/payment-intent/:id
Authorization: Bearer {access_token}
```

**响应**:
```json
{
  "success": true,
  "paymentIntent": {
    "id": "pi_...",
    "status": "succeeded",
    "amount": 1000,
    "currency": "usd",
    "metadata": {
      "tripId": "trip_123"
    }
  }
}
```

---

### 6. 处理退款

```http
POST /api/stripe/refund
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "paymentIntentId": "pi_...",
  "amount": 500,  // Optional, partial refund
  "reason": "requested_by_customer"  // Optional
}
```

**响应**:
```json
{
  "success": true,
  "refund": {
    "id": "re_...",
    "amount": 500,
    "currency": "usd",
    "status": "succeeded"
  }
}
```

---

### 7. 获取支付历史

```http
GET /api/stripe/payment-history?limit=10&startingAfter=...
Authorization: Bearer {access_token}
```

**响应**:
```json
{
  "success": true,
  "paymentIntents": [
    {
      "id": "pi_...",
      "status": "succeeded",
      "amount": 1000,
      "currency": "usd",
      "created": 1234567890,
      "metadata": {
        "tripId": "trip_123"
      }
    }
  ]
}
```

---

### 8. 初始化 Stripe Connect OAuth（平台模式）

```http
GET /api/stripe/connect/oauth/initiate?redirectUri=https://example.com/callback
Authorization: Bearer {access_token}
```

**响应**:
```json
{
  "success": true,
  "authUrl": "https://connect.stripe.com/oauth/authorize?..."
}
```

---

### 9. 完成 Stripe Connect OAuth

```http
POST /api/stripe/connect/oauth/callback
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "code": "...",
  "state": "..."
}
```

**响应**:
```json
{
  "success": true,
  "message": "Stripe Connect OAuth completed successfully"
}
```

---

## 🛠️ MCP 工具集成

Stripe Direct Service 已集成到 MCP Skills Server，提供以下工具：

### stripe.createPaymentIntent

创建支付意图。

**参数**:
- `userId` (string, required) - 用户 ID
- `amount` (number, required) - 支付金额（单位：分）
- `currency` (string, optional) - 货币代码（默认: usd）
- `metadata` (object, optional) - 附加元数据

**返回**: 支付意图信息（包含 clientSecret）

---

### stripe.confirmPaymentIntent

确认支付意图。

**参数**:
- `paymentIntentId` (string, required) - 支付意图 ID
- `paymentMethodId` (string, optional) - 支付方式 ID

**返回**: 更新后的支付意图状态

---

### stripe.getPaymentIntent

获取支付意图状态。

**参数**:
- `paymentIntentId` (string, required) - 支付意图 ID

**返回**: 支付意图详细信息

---

### stripe.refundPayment

处理退款。

**参数**:
- `paymentIntentId` (string, required) - 支付意图 ID
- `amount` (number, optional) - 退款金额（单位：分，不提供则全额退款）
- `reason` (string, optional) - 退款原因

**返回**: 退款信息

---

## 🔐 安全考虑

### 1. Token 加密

OAuth tokens 使用 AES-256-CBC 加密存储：

```typescript
// 加密
const encrypted = encrypt(accessToken);

// 解密
const decrypted = decrypt(encrypted);
```

**重要**: 生产环境必须设置强加密密钥 `STRIPE_ENCRYPTION_KEY`。

---

### 2. 用户隔离

每个用户的 Stripe 连接信息独立存储，确保：
- 用户只能访问自己的支付信息
- 支付操作需要用户认证（JWT）
- 数据库级联删除保护数据一致性

---

### 3. 状态验证

支付状态变更时：
- 从 Stripe API 获取最新状态
- 更新数据库记录
- 记录操作日志（建议）

---

## 📊 使用场景

### 场景 1: 标准支付流程

```typescript
// 1. 创建支付意图
const paymentIntent = await stripeService.createPaymentIntent({
  userId: user.id,
  amount: 10000, // $100.00
  metadata: { tripId: 'trip_123' },
});

// 2. 前端使用 clientSecret 完成支付
// (使用 Stripe.js)

// 3. 确认支付
const confirmed = await stripeService.confirmPaymentIntent(
  paymentIntent.id,
  paymentMethodId,
);

// 4. 检查状态
const status = await stripeService.getPaymentIntent(paymentIntent.id);
```

---

### 场景 2: 退款处理

```typescript
// 全额退款
const refund = await stripeService.refundPayment(paymentIntentId);

// 部分退款
const partialRefund = await stripeService.refundPayment(
  paymentIntentId,
  5000, // $50.00
  'requested_by_customer',
);
```

---

### 场景 3: 支付历史查询

```typescript
const history = await stripeService.getPaymentHistory(userId, 10);
```

---

## 🔄 与 Stripe MCP 的区别

| 特性 | Stripe Direct API | Stripe MCP |
|------|------------------|------------|
| **实现方式** | 直接使用 Stripe SDK | 通过 Smithery MCP 服务 |
| **认证存储** | 数据库（用户级别） | 文件系统（~/.tripnara-mcp/） |
| **状态存储** | 数据库（PaymentIntent 表） | 无 |
| **用户隔离** | ✅ 是 | ⚠️ 服务级别 |
| **安全性** | ✅ 高（加密存储） | ⚠️ 中（文件存储） |
| **推荐使用** | ✅ 生产环境 | ⚠️ 开发/测试 |

---

## 📝 注意事项

1. **加密密钥**: 生产环境必须设置强加密密钥
2. **数据库迁移**: 部署前确保运行迁移
3. **错误处理**: 支付操作失败时，确保有适当的错误处理和用户提示
4. **Webhook**: 建议配置 Stripe Webhook 监听支付状态变更
5. **测试模式**: 开发环境使用 `sk_test_...`，生产环境使用 `sk_live_...`

---

## 🔗 相关资源

- [Stripe API 文档](https://stripe.com/docs/api)
- [Stripe Connect 文档](https://stripe.com/docs/connect)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)

---

**最后更新**: 2026-02-07
