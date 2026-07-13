# 邮箱登录 — App Native 对接文档

> **适用客户端：** iOS / Android / Capacitor 套壳  
> **Global prefix：** `/api`  
> **Swagger Tag：** `auth`（`/api-docs`）  
> **鉴权方式：** 登录后 `Authorization: Bearer <accessToken>`  
> **最后更新：** 2026-07-08

---

## 0. 快速概览

邮箱登录采用 **OTP 验证码**（无密码），流程与 Web 一致：

```
输入邮箱 → POST /auth/email/send-code
输入 6 位验证码 → POST /auth/email/login（已注册）
                 或 POST /auth/email/register（新用户，可选 displayName）
保存 accessToken + refresh_token → 后续 API 带 Bearer
accessToken 过期 → POST /auth/refresh（带 Cookie）
退出 → POST /auth/logout
```

| 能力 | 端点 | 认证 |
|------|------|------|
| 发送验证码 | `POST /api/auth/email/send-code` | 公开 |
| 注册 | `POST /api/auth/email/register` | 公开 |
| 登录 | `POST /api/auth/email/login` | 公开 |
| 刷新 Token | `POST /api/auth/refresh` | refresh_token Cookie |
| 退出 | `POST /api/auth/logout` | refresh_token Cookie |

**Base URL 示例：**

| 环境 | Base URL |
|------|----------|
| 模拟器 + Cursor 端口转发 | `http://127.0.0.1:3000/api` |
| **真机 + Devbox（当前联调）** | **`http://192.168.8.153:8080/api`** |
| 生产 | `https://tripnara.com/api` |

---

## 1. Native 端 Token 约定（必读）

Web 端 refresh token 走 **httpOnly Cookie**；Native **不会自动管理 Cookie**，需自行持久化。

### 1.1 登录/注册响应

**Body（JSON）：**

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "displayName": "张三",
    "avatarUrl": null,
    "emailVerified": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response Header（需解析）：**

```
Set-Cookie: refresh_token=<opaque-token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000
```

| 字段 | 存储建议 | 用途 |
|------|----------|------|
| `accessToken` | Keychain / Keystore / SecureStorage | 每次业务 API：`Authorization: Bearer …` |
| `refresh_token`（从 `Set-Cookie` 解析） | 同上，与 accessToken 分开存 | 调用 `/auth/refresh`、`/auth/logout` |
| `user` | 普通持久化或内存 | 展示昵称、头像等 |

> **注意：** 响应 body **不包含** `refreshToken` 字段；必须从 `Set-Cookie` 头提取 `refresh_token` 的值。

### 1.2 Access Token 规格

- 算法：JWT（HS256，`JWT_SECRET` 签名）
- 默认有效期：**48h**（`JWT_ACCESS_TOKEN_EXPIRES_IN`，可配置）
- Payload 主要字段：`sub`（userId）、`email`、可选 `roles`

### 1.3 Refresh Token 规格

- 默认有效期：**30 天**（`JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS`）
- **Token 旋转：** 每次 `/auth/refresh` 成功会下发新的 `refresh_token`，旧 token 作废；Native 必须覆盖本地存储

### 1.4 业务 API 请求头

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

401 时：用本地 `refresh_token` 调 `/auth/refresh`，拿到新 `accessToken` 后重试原请求。

### 1.5 Refresh / Logout 请求头

Native 需**手动带 Cookie**（不要用 WebView cookie jar 假设）：

```
Cookie: refresh_token=<stored-refresh-token>
```

---

## 2. 验证码规则

| 规则 | 值 |
|------|-----|
| 长度 | 6 位数字 |
| 有效期 | **10 分钟** |
| 重发冷却 | 同一邮箱 **60 秒** 内不可重复发送 |
| 一次性 | 验证成功后标记已使用，不可复用 |

**开发/联调（仅 `NODE_ENV !== production`）：** 固定验证码 `888888` 可通过校验，无需真实邮件。

---

## 3. 接口详情

### 3.1 发送验证码

`POST /api/auth/email/send-code`

**Request**

```json
{
  "email": "user@example.com"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址 |

**Response 200**

```json
{
  "message": "验证码已发送，请查收邮件"
}
```

**常见错误 400**

| message | 含义 | Native 处理 |
|---------|------|-------------|
| `无效的邮箱地址` | 格式不合法 | 提示用户修正邮箱 |
| `验证码发送过于频繁，请稍后再试` | 60s 内重复发送 | 倒计时后重试 |
| `邮件服务未配置，请联系管理员` | 服务端 SMTP 未配置 | 联系后端 |
| `发送验证码失败: …` | SMTP 发送失败 | 稍后重试 |

---

### 3.2 邮箱注册

`POST /api/auth/email/register`

**Request**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "displayName": "张三"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱 |
| code | string | 是 | 邮件中的 6 位验证码 |
| displayName | string | 否 | 昵称 |

**Response 200**

同 [§1.1](#11-登录注册响应)，含 `user`、`accessToken`，以及 `Set-Cookie: refresh_token=…`。

**常见错误 400**

| message | 含义 |
|---------|------|
| `验证码无效或已过期` | code 错误或超过 10 分钟 |
| `该邮箱已被注册` | 应改走登录接口 |

---

### 3.3 邮箱登录

`POST /api/auth/email/login`

**Request**

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 须为合法邮箱格式（`@IsEmail`） |
| code | string | 是 | 6 位验证码 |

**Response 200**

同注册，返回 `user` + `accessToken` + `Set-Cookie`。

**常见错误 400**

| message | 含义 | Native 处理 |
|---------|------|-------------|
| `验证码无效或已过期` | code 无效 | 重新获取验证码 |
| `该邮箱未注册，请先注册` | 无账号 | 跳转注册页，可带 `displayName` |

---

### 3.4 刷新 Access Token

`POST /api/auth/refresh`

**Request Body：** 无

**Request Header：**

```
Cookie: refresh_token=<stored-value>
```

**Response 200**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response Header：** 新的 `Set-Cookie: refresh_token=…`（必须更新本地存储）

**错误 401**

```json
{
  "statusCode": 401,
  "message": ["Refresh token not found"],
  "timestamp": "2026-07-08T10:00:00.000Z",
  "path": "/api/auth/refresh",
  "method": "POST"
}
```

或 `Invalid or expired refresh token` → 清除本地会话，回到登录页。

---

### 3.5 退出登录

`POST /api/auth/logout`

**Request Header：**

```
Cookie: refresh_token=<stored-value>
```

**Response 200**

```json
{
  "message": "Logged out successfully"
}
```

服务端会撤销 refresh token 并清除 cookie；Native 应同时删除本地 `accessToken`、`refresh_token`、`user`。

---

## 4. 推荐 UI 流程

### 4.1 统一 OTP 页（登录 + 注册合一）

```
1. 用户输入 email → send-code
2. 用户输入 6 位 code
3. POST /auth/email/login
   ├─ 200 → 存 token，进首页
   └─ 400「该邮箱未注册」→ 可选填昵称 → POST /auth/email/register
```

### 4.2 Token 自动刷新（伪代码）

```typescript
async function apiFetch(path: string, init: RequestInit = {}) {
  let accessToken = await secureStore.get('accessToken');

  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401) {
    const refreshToken = await secureStore.get('refresh_token');
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${refreshToken}` },
    });
    if (!refreshRes.ok) throw new AuthError('SESSION_EXPIRED');

    const { accessToken: newAccess } = await refreshRes.json();
    const newRefresh = parseRefreshTokenFromSetCookie(refreshRes.headers.get('set-cookie'));
    await secureStore.set('accessToken', newAccess);
    if (newRefresh) await secureStore.set('refresh_token', newRefresh);

    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${newAccess}`,
        'Content-Type': 'application/json',
      },
    });
  }
  return res;
}
```

---

## 5. 错误响应格式

Auth 模块使用 NestJS 标准格式（**非** `{ success, data }` 包装）：

```json
{
  "statusCode": 400,
  "message": ["验证码无效或已过期"],
  "timestamp": "2026-07-08T10:00:00.000Z",
  "path": "/api/auth/email/login",
  "method": "POST"
}
```

校验失败时 `message` 可能为字符串数组；客户端应取 `message[0]` 或 join 展示。

---

## 6. curl 联调示例

```bash
BASE=http://localhost:3000/api
EMAIL=user@example.com

# 1. 发送验证码
curl -s -X POST "$BASE/auth/email/send-code" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}"

# 2. 登录（dev 可用 888888）
curl -s -i -X POST "$BASE/auth/email/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"code\":\"888888\"}"
# 记下响应头 Set-Cookie 中的 refresh_token，以及 body 中的 accessToken

# 3. 刷新
curl -s -i -X POST "$BASE/auth/refresh" \
  -H "Cookie: refresh_token=<paste>"

# 4. 带 Bearer 调用户接口
curl -s "$BASE/users/me" \
  -H "Authorization: Bearer <accessToken>"
```

---

## 7. 与 Google 登录的关系

- 同一 `User` 表：Google 账号与邮箱账号可通过 **相同 email** 合并（Google 登录时会 bind `googleSub`）。
- 邮箱注册用户 `googleSub` 为 `null`，`emailVerified` 注册成功后为 `true`。
- Native 若同时支持 Google Sign-In，可复用同一套 `accessToken` / `refresh_token` 会话机制（Google 端点见 `src/auth/README.md`）。

---

## 8. 待后端增强（可选）

当前 refresh token **仅**通过 Cookie 下发，Native 需解析 `Set-Cookie`。若希望简化客户端，可后续增加：

- 响应 body 增加 `refreshToken` 字段（与 cookie 双写），或
- `POST /auth/refresh` 支持 body `{ "refreshToken": "…" }`

对接前请与后端确认是否已落地；**现阶段以 Cookie 方案为准**。

---

## 9. Devbox 真机联调（无公网）

后台跑在 Devbox 内网，真机无法直连 `10.107.x.x`。通过 **Cursor 转发 3000 → Mac 本机**，再用 **socat 暴露局域网**：

```
iPhone (WiFi) → http://192.168.8.153:8080/api
    → Mac socat :8080 → 127.0.0.1:3000 (Cursor 隧道) → Devbox :3000
```

### 9.1 Mac 端（联调前每次启动）

```bash
# 1. Cursor Ports 面板保持 3000 转发开启
# 2. 验证隧道
curl http://127.0.0.1:3000/api-docs

# 3. 暴露给局域网（保持运行）
socat TCP-LISTEN:8080,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:3000

# 4. 验证真机可达地址
curl http://192.168.8.153:8080/api-docs
```

iPhone 与 Mac 须在同一 WiFi；Mac 防火墙放行 **8080** 入站。

### 9.2 Swift `APIConfig`

```swift
enum APIConfig {
    #if DEBUG
    /// 真机联调：Mac 局域网 IP + socat 8080→3000
    static let baseURL = URL(string: "http://192.168.8.153:8080/api")!
    #else
    static let baseURL = URL(string: "https://tripnara.com/api")!
    #endif

    static func url(_ path: String) -> URL {
        baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }
}
```

**邮箱登录调用示例：**

```swift
// POST .../auth/email/send-code
var req = URLRequest(url: APIConfig.url("auth/email/send-code"))
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
req.httpBody = try JSONSerialization.data(withJSONObject: ["email": email])

// POST .../auth/email/login（dev 验证码 888888）
var login = URLRequest(url: APIConfig.url("auth/email/login"))
login.httpMethod = "POST"
login.setValue("application/json", forHTTPHeaderField: "Content-Type")
login.httpBody = try JSONSerialization.data(withJSONObject: [
    "email": email,
    "code": code
])
```

### 9.3 Info.plist（ATS）

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

### 9.4 真机自测

1. iPhone Safari 打开 `http://192.168.8.153:8080/api-docs`
2. App 内发验证码 / 登录（dev 可用 `888888`）

Mac IP 变更时（换 WiFi），更新 `APIConfig` 中的 IP 并重启 socat。

---

## 10. 相关文件

| 文件 | 说明 |
|------|------|
| [`SESSION_NATIVE_API.md`](./SESSION_NATIVE_API.md) | **第一阶段：会话闭环**（me / refresh / logout） |
| [`USER_PROFILE_NATIVE_API.md`](./USER_PROFILE_NATIVE_API.md) | **第二阶段：用户资料**（me 更新 / profile） |
| [`TRIPS_NATIVE_API.md`](./TRIPS_NATIVE_API.md) | **第三阶段：行程 list / detail / 表单创建** |
| [`TRIP_CREATE_ENTRIES_NATIVE_API.md`](./TRIP_CREATE_ENTRIES_NATIVE_API.md) | **Web 四入口创建行程（①–④）** |
| `src/auth/auth.controller.ts` | 路由实现 |
| `src/auth/dto/google-auth.dto.ts` | 请求/响应 DTO |
| `src/auth/services/email-verification.service.ts` | 验证码发送与校验 |
| `src/auth/README.md` | 完整 Auth 模块说明（含 Google） |
| `.claude/roles/rl-infra/USER_API_DOCUMENTATION.md` | 用户域全量 API |

---

## 附录：真机 curl（经 Mac 转发）

```bash
BASE=http://192.168.8.153:8080/api
EMAIL=user@example.com

curl -X POST "$BASE/auth/email/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"code\":\"888888\"}"
```
