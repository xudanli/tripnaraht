# Stripe 配置指南

## 📋 Stripe API Key 说明

### Key 类型

Stripe 提供两种类型的 API Key：

#### 1. **Secret Key (私钥)** - `sk_test_...` 或 `sk_live_...`

**用途**: 服务器端 API 调用  
**位置**: 后端 `.env` 文件  
**安全**: ⚠️ **绝不要暴露给前端**

```bash
# 测试环境
STRIPE_SECRET_KEY=sk_test_51Sy24WAM...

# 生产环境
STRIPE_SECRET_KEY=sk_live_...
```

#### 2. **Publishable Key (公钥)** - `pk_test_...` 或 `pk_live_...`

**用途**: 前端 Stripe.js 集成  
**位置**: 前端环境变量或配置  
**安全**: ✅ 可以安全地暴露给前端

```bash
# 测试环境
STRIPE_PUBLISHABLE_KEY=pk_test_51Sy24WAM...

# 生产环境
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## 🔧 配置步骤

### 1. 后端配置（`.env`）

```bash
# Stripe Secret Key（后端使用）
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET_KEY_HERE

# Stripe Publishable Key（前端使用，可选，如果前端需要）
STRIPE_PUBLISHABLE_KEY=pk_test_51Sy24WAM...

# 加密密钥（用于加密 OAuth tokens）
# ⚠️ 生产环境必须更改！使用强随机字符串（至少 32 字符）
STRIPE_ENCRYPTION_KEY=your-secure-encryption-key-32-chars
```

### 2. 前端配置（如果需要使用 Stripe.js）

```typescript
// 前端环境变量或配置
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51Sy24WAM...';

// 初始化 Stripe
import { loadStripe } from '@stripe/stripe-js';
const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
```

---

## 🔐 安全注意事项

### ✅ 正确做法

1. **Secret Key 只在后端使用**
   - 存储在 `.env` 文件中
   - 不要提交到 Git
   - 不要发送给前端

2. **Publishable Key 可以暴露**
   - 可以放在前端代码中
   - 可以放在环境变量中
   - 可以公开访问

3. **加密密钥**
   - 生产环境必须设置强加密密钥
   - 至少 32 字符
   - 使用随机字符串生成器

### ❌ 错误做法

1. ❌ 将 Secret Key 放在前端代码中
2. ❌ 将 Secret Key 提交到 Git
3. ❌ 使用默认的加密密钥（`your-secure-encryption-key-32-chars`）

---

## 🧪 测试环境 vs 生产环境

### 测试环境（Test Mode）

```bash
# Secret Key
STRIPE_SECRET_KEY=sk_test_...

# Publishable Key
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**特点**:
- ✅ 不会产生真实费用
- ✅ 可以测试所有功能
- ✅ 数据不会影响生产环境

### 生产环境（Live Mode）

```bash
# Secret Key
STRIPE_SECRET_KEY=sk_live_...

# Publishable Key
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**特点**:
- ⚠️ 会产生真实费用
- ⚠️ 处理真实支付
- ⚠️ 需要激活 Stripe 账户

---

## 📝 当前配置检查

根据您的 `.env` 文件：

✅ **已配置**:
- `STRIPE_SECRET_KEY` - Secret Key（正确）

⚠️ **需要配置**:
- `STRIPE_PUBLISHABLE_KEY` - Publishable Key（如果前端需要使用 Stripe.js）
- `STRIPE_ENCRYPTION_KEY` - 加密密钥（当前是占位符，需要更改）

---

## 🚀 下一步

1. **添加 Publishable Key**（如果前端需要）:
   ```bash
   STRIPE_PUBLISHABLE_KEY=pk_test_51Sy24WAM...
   ```

2. **更改加密密钥**（生产环境必须）:
   ```bash
   # 生成强随机密钥（32+ 字符）
   STRIPE_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

3. **测试配置**:
   ```bash
   # 检查服务状态
   curl http://localhost:3000/api/stripe/health \
     -H "Authorization: Bearer {token}"
   ```

---

## 📚 相关文档

- [Stripe Direct API 文档](./STRIPE_DIRECT_API.md)
- [Stripe Direct 前端 API 文档](./STRIPE_DIRECT_FRONTEND_API.md)
- [Stripe 官方文档](https://stripe.com/docs/api)

---

**最后更新**: 2026-02-07
