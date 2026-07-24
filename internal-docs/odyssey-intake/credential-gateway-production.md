# 身份资产授信 — 生产网关对接指南

PRD 3.1.3 · Odyssey Intake · 后端 `CredentialVerificationGateway`

---

## 1. 运行模式

| 环境变量 | 值 | 行为 |
|----------|-----|------|
| `CREDENTIAL_VERIFICATION_MODE` | `stub` | 全部走本地 stub（CI / 纯本地） |
| | `hybrid`（**默认**） | 配置了 URL 的通道走生产 HTTP，其余 stub |
| | `production` | 未配置 URL 的通道直接失败 |

---

## 2. 环境变量清单

```bash
# 全局
CREDENTIAL_VERIFICATION_MODE=hybrid
CREDENTIAL_GATEWAY_API_KEY=your-internal-gateway-key   # Bearer，勿写日志
CREDENTIAL_GATEWAY_HTTP_TIMEOUT_MS=8000
CREDENTIAL_GATEWAY_HTTP_MAX_RETRIES=3

# 学信网合规通道
CREDENTIAL_XUEXIN_GATEWAY_URL=https://compliance-gateway.internal/chsi

# 企业邮箱 OTP
CREDENTIAL_MAIL_GATEWAY_URL=https://compliance-gateway.internal/mail
CREDENTIAL_MAIL_FROM=verify@tripnara.com
CREDENTIAL_EMAIL_OTP_TTL_SECONDS=600

# 脉脉 / LinkedIn OAuth 交换
CREDENTIAL_OAUTH_GATEWAY_URL=https://compliance-gateway.internal/oauth

# 工牌 OCR（可选；未配置时用本地上传 + Google Vision）
CREDENTIAL_BADGE_OCR_GATEWAY_URL=https://compliance-gateway.internal/badge-ocr
CREDENTIAL_BADGE_UPLOAD_TTL_SECONDS=900

# 本地 OCR fallback（hybrid 下 badge 未配外部网关时）
GOOGLE_VISION_API_KEY=...
```

OTP 与工牌暂存依赖 **Redis**（`REDIS_HOST` 等，见 `RedisModule`）。

---

## 3. 合规网关 HTTP 契约

所有请求：`Authorization: Bearer ${CREDENTIAL_GATEWAY_API_KEY}`  
错误体建议：`{ "message": "..." }`  
5xx / 网络错误：后端指数退避最多 3 次；429 读 `Retry-After`。

### 3.1 学信网 — `POST {XUEXIN}/v1/verify`

**Request**

```json
{ "verificationCode": "CHSI_ONLINE_CODE" }
```

**Response（仅白名单字段）**

```json
{
  "degreeLevel": "master",
  "tierTag": "985_211"
}
```

`tierTag`: `985_211` | `qs_top50` | `overseas` | `general`  
**禁止**返回校名、专业、身份证号；验证码原文不落库。

### 3.2 企业邮箱 — `POST {MAIL}/v1/send-otp`

**Request**

```json
{
  "to": "name@tencent.com",
  "from": "verify@tripnara.com",
  "template": "credential_work_email_verify",
  "variables": { "code": "123456", "expiresInMinutes": 10 },
  "ttlSeconds": 600
}
```

**Response**: `{}` 或 `{ "messageId": "..." }`

OTP 校验在 **TripNARA 后端**完成（Redis）；邮件网关只负责发信。

### 3.3 OAuth — `POST {OAUTH}/v1/{provider}/exchange`

`provider`: `maimai` | `linkedin`

**Request**

```json
{ "authToken": "oauth-authorization-code-or-token" }
```

**Response**

```json
{
  "industryTag": "tech",
  "companyTierTag": "tier1_tech",
  "roleLevelTag": "product_director"
}
```

### 3.4 工牌 OCR — `POST {BADGE}/v1/verify`

**Request**

```json
{
  "imageToken": "uuid-from-upload-or-external-storage",
  "userId": "user-uuid",
  "destroyOriginal": true
}
```

**Response**（模糊标签 only）

```json
{
  "industryTag": "manufacturing",
  "companyTierTag": "known_manufacturing",
  "roleLevelTag": "solutions_expert"
}
```

**本地上传路径**（未配外部 OCR 网关时）：

1. `POST /api/odyssey-intake/credentials/profession/badge/upload` → `imageToken`
2. `POST /api/odyssey-intake/credentials/profession/badge/verify` → 本地 Google Vision OCR + 映射，**Redis 原图删除**

---

## 4. 前端对接顺序

| 通道 | 步骤 |
|------|------|
| 学信网 | 用户输入验证码 → `education/verify` |
| 企业邮箱 | `email/send-code` → 用户输入 6 位 → `email/verify` |
| 工牌 | `badge/upload` → `badge/verify` |
| OAuth | 客户端 OAuth 拿 code → `oauth/verify` |

开发环境 `hybrid + 无 URL`：`send-code` 响应含 `devCode`。

---

## 6. 本地 Mock 合规网关（联调）

在未接入真实 CHSI / 邮件 / OAuth 供应商前，可启动内置 Mock：

```bash
# Terminal 1
npm run credential:mock-gateway

# Terminal 2 — .env 追加
CREDENTIAL_VERIFICATION_MODE=hybrid
CREDENTIAL_GATEWAY_API_KEY=dev-mock-key
CREDENTIAL_XUEXIN_GATEWAY_URL=http://127.0.0.1:3099/chsi
CREDENTIAL_MAIL_GATEWAY_URL=http://127.0.0.1:3099/mail
CREDENTIAL_OAUTH_GATEWAY_URL=http://127.0.0.1:3099/oauth
CREDENTIAL_BADGE_OCR_GATEWAY_URL=http://127.0.0.1:3099/badge-ocr
```

验证通道状态：

```bash
curl "$API/api/odyssey-intake/credentials/gateway/status"
```

学信网联调示例：`verificationCode` 以 `985` 开头 → mock 返回 `985_211`。

---

## 7. 验收

- [ ] 生产 `.env` 已配置对应 `CREDENTIAL_*_GATEWAY_URL`
- [ ] Redis 可用（多 Pod OTP / 工牌暂存）
- [ ] 日志无 `CREDENTIAL_GATEWAY_API_KEY`、验证码、原图 base64
- [ ] 外部网关回包无校名/公司全称
- [ ] 前端标签走 `vector_component_watermark`

相关 PRD：[prd-3.1.3-asset-verification-privacy.md](./prd-3.1.3-asset-verification-privacy.md)
