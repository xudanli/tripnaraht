# 会话闭环 — App Native 对接文档（第一阶段）

> **前置：** 邮箱登录已通（见 [`EMAIL_AUTH_NATIVE_API.md`](./EMAIL_AUTH_NATIVE_API.md)）  
> **Global prefix：** `/api`  
> **本阶段目标：** Token 续期、退出登录、拉取当前用户信息  
> **最后更新：** 2026-07-08

---

## 0. 本阶段接口一览

| 优先级 | 方法 | 路径 | 认证 | 响应格式 |
|--------|------|------|------|----------|
| P0 | GET | `/api/users/me` | Bearer | `{ success, data }` |
| P0 | POST | `/api/auth/refresh` | Cookie `refresh_token` | 裸 JSON |
| P0 | POST | `/api/auth/logout` | Cookie `refresh_token` | 裸 JSON |

**Base URL（真机联调）：** `http://192.168.8.153:8080/api`

---

## 1. 整体流程

```
登录成功
  ├─ 存 Keychain：accessToken、refresh_token（从 Set-Cookie 解析）
  │
  ├─ GET /users/me（带 Bearer）→ 验证会话、渲染用户资料
  │
  ├─ 业务 API 401
  │     └─ POST /auth/refresh（带 Cookie）→ 新 accessToken + 新 refresh_token
  │           └─ 重试原请求
  │
  └─ 用户点退出
        └─ POST /auth/logout → 清 Keychain → 回登录页
```

### 1.1 Token 规格（复习）

| Token | 有效期（默认） | 传递方式 |
|-------|----------------|----------|
| accessToken | 48h | `Authorization: Bearer <token>` |
| refresh_token | 30 天 | `Cookie: refresh_token=<token>` |

**Token 旋转：** 每次 `/auth/refresh` 成功后，旧 refresh_token 作废，必须保存响应头 `Set-Cookie` 里的新值。

### 1.2 响应格式差异（重要）

| 模块 | 格式 | 示例 |
|------|------|------|
| `/api/auth/*` | **裸 JSON** | `{ "accessToken": "..." }` |
| `/api/users/*` | **统一包装** | `{ "success": true, "data": { ... } }` |

Native 客户端需两套解析逻辑，或统一封装 `decodeAuthResponse` / `decodeStandardResponse`。

---

## 2. GET /api/users/me

获取当前登录用户基本信息。**登录后第一个建议对接的业务接口**，用于验证 Bearer Token 是否生效。

### 2.1 请求

```
GET /api/users/me
Authorization: Bearer <accessToken>
```

无 Request Body。

### 2.2 成功响应 200

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "emailVerified": true,
    "displayName": "张三",
    "avatarUrl": null,
    "googleSub": null,
    "createdAt": "2026-01-15T08:00:00.000Z",
    "updatedAt": "2026-07-08T10:00:00.000Z"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| data.id | string | 用户 UUID |
| data.email | string \| null | 邮箱 |
| data.emailVerified | boolean \| null | 邮箱是否已验证 |
| data.displayName | string \| null | 显示名称 |
| data.avatarUrl | string \| null | 头像 URL |
| data.googleSub | string \| null | Google 登录时有值；邮箱注册为 `null` |
| data.createdAt | string (ISO 8601) | 注册时间 |
| data.updatedAt | string (ISO 8601) | 最后更新时间 |

### 2.3 错误响应

**未带 Token 或 Token 无效**（HTTP 200，业务层失败）：

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "未认证或 token 无效"
  }
}
```

> 注意：`/users/me` 标记为 `@Public()`，Guard 不会因无 Token 直接返回 HTTP 401，而是进入 handler 后返回 `success: false`。客户端应判断 `success === false && error.code === "UNAUTHORIZED"`。

**用户不存在**（HTTP 200）：

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "用户不存在: <userId>"
  }
}
```

### 2.4 Native 处理建议

```swift
struct StandardResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: APIErrorBody?
}

struct APIErrorBody: Decodable {
    let code: String
    let message: String
}

struct CurrentUser: Decodable {
    let id: String
    let email: String?
    let emailVerified: Bool?
    let displayName: String?
    let avatarUrl: String?
    let googleSub: String?
    let createdAt: String
    let updatedAt: String
}

func fetchMe(accessToken: String) async throws -> CurrentUser {
    var req = URLRequest(url: APIConfig.url("users/me"))
    req.httpMethod = "GET"
    req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

    let (data, _) = try await URLSession.shared.data(for: req)
    let wrapped = try JSONDecoder().decode(StandardResponse<CurrentUser>.self, from: data)

    guard wrapped.success, let user = wrapped.data else {
        if wrapped.error?.code == "UNAUTHORIZED" {
            throw SessionError.unauthorized  // 触发 refresh 或回登录
        }
        throw SessionError.api(wrapped.error?.message ?? "unknown")
    }
    return user
}
```

---

## 3. POST /api/auth/refresh

使用 refresh_token 换取新的 accessToken。accessToken 过期或即将过期时调用。

### 3.1 请求

```
POST /api/auth/refresh
Cookie: refresh_token=<stored-refresh-token>
```

无 Request Body。

### 3.2 成功响应 200

**Body：**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Header（必须处理）：**

```
Set-Cookie: refresh_token=<new-token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=...
```

| 字段 | 说明 |
|------|------|
| accessToken | 新的 JWT，替换 Keychain 中的旧值 |
| Set-Cookie | 新的 refresh_token，**覆盖** Keychain 旧值 |

### 3.3 错误响应 401

```json
{
  "statusCode": 401,
  "message": ["Refresh token not found"],
  "timestamp": "2026-07-08T10:00:00.000Z",
  "path": "/api/auth/refresh",
  "method": "POST"
}
```

或：

```json
{
  "statusCode": 401,
  "message": ["Invalid or expired refresh token"],
  ...
}
```

**Native 处理：** 清除本地会话，跳转登录页。

### 3.4 自动刷新伪代码

```swift
func refreshSession(refreshToken: String) async throws -> (accessToken: String, newRefreshToken: String) {
    var req = URLRequest(url: APIConfig.url("auth/refresh"))
    req.httpMethod = "POST"
    req.setValue("refresh_token=\(refreshToken)", forHTTPHeaderField: "Cookie")

    let (data, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        throw SessionError.refreshFailed
    }

    struct RefreshBody: Decodable { let accessToken: String }
    let body = try JSONDecoder().decode(RefreshBody.self, from: data)

    guard let setCookie = http.value(forHTTPHeaderField: "Set-Cookie"),
          let newRefresh = parseRefreshToken(from: setCookie) else {
        throw SessionError.missingRefreshCookie
    }

    return (body.accessToken, newRefresh)
}

/// 401 拦截：先 refresh，再重试一次
func authorizedRequest(_ build: (String) -> URLRequest) async throws -> (Data, URLResponse) {
    var accessToken = try Keychain.loadAccessToken()
    var (data, resp) = try await URLSession.shared.data(for: build(accessToken))

    if (resp as? HTTPURLResponse)?.statusCode == 401 {
        let refreshToken = try Keychain.loadRefreshToken()
        let renewed = try await refreshSession(refreshToken: refreshToken)
        try Keychain.save(accessToken: renewed.accessToken, refreshToken: renewed.newRefreshToken)
        (data, resp) = try await URLSession.shared.data(for: build(renewed.accessToken))
    }
    return (data, resp)
}
```

> `/users/me` 在 Token 无效时返回 HTTP 200 + `success:false`，不会触发上面基于 401 的拦截。建议对 `UNAUTHORIZED` 同样走 refresh 流程。

---

## 4. POST /api/auth/logout

撤销 refresh_token 并清除服务端会话。

### 4.1 请求

```
POST /api/auth/logout
Cookie: refresh_token=<stored-refresh-token>
```

无 Request Body。accessToken 可带可不带（服务端主要撤销 refresh_token）。

### 4.2 成功响应 200

```json
{
  "message": "Logged out successfully"
}
```

服务端同时清除 `refresh_token` cookie。

### 4.3 Native 处理

无论 HTTP 是否成功，本地都应：

1. 删除 Keychain 中的 `accessToken`、`refresh_token`
2. 清空内存中的 `user` 缓存
3. 导航回登录页

```swift
func logout(refreshToken: String?) async {
    if let rt = refreshToken {
        var req = URLRequest(url: APIConfig.url("auth/logout"))
        req.httpMethod = "POST"
        req.setValue("refresh_token=\(rt)", forHTTPHeaderField: "Cookie")
        _ = try? await URLSession.shared.data(for: req)
    }
    Keychain.clearSession()
}
```

---

## 5. 登录后会话初始化（推荐顺序）

```swift
// 1. 邮箱登录/register 成功后
let loginResponse = ... // { user, accessToken } + Set-Cookie
Keychain.save(accessToken: loginResponse.accessToken, refreshToken: parsedRefreshToken)
UserDefaults.standard.set(loginResponse.user.id, forKey: "userId")

// 2. 立即拉 me（可选：与 login 返回的 user 交叉验证）
let me = try await fetchMe(accessToken: loginResponse.accessToken)

// 3. 进入首页
navigateToHome(user: me)
```

---

## 6. curl 联调

```bash
BASE=http://192.168.8.153:8080/api

# 假设已登录，手上有 accessToken 和 refresh_token

# 1. 获取当前用户
curl -s "$BASE/users/me" \
  -H "Authorization: Bearer <accessToken>" | jq

# 2. 刷新 Token
curl -s -i -X POST "$BASE/auth/refresh" \
  -H "Cookie: refresh_token=<refresh_token>"
# 记下新 accessToken 和 Set-Cookie

# 3. 退出
curl -s -X POST "$BASE/auth/logout" \
  -H "Cookie: refresh_token=<refresh_token>"
```

---

## 7. 错误码速查

| 场景 | HTTP | 识别方式 | Native 动作 |
|------|------|----------|-------------|
| accessToken 有效 | 200 | `users/me` → `success: true` | 正常展示 |
| 无 Token / accessToken 无效 | 200 | `success: false`, `code: UNAUTHORIZED` | 尝试 refresh |
| refresh_token 缺失/过期 | 401 | `auth/refresh` Nest 格式 | 清会话 → 登录页 |
| 用户被删 | 200 | `code: NOT_FOUND` | 清会话 → 登录页 |
| 网络错误 | — | URLSession 抛错 | 提示重试 |

---

## 8. 下一阶段预告

会话闭环完成后，进入 **第二阶段（用户资料）** 和 **第三阶段（行程列表）**：

| 阶段 | 接口 | 文档 |
|------|------|------|
| 二 | `PUT /api/users/me`、`GET/PUT /api/users/profile` | [`USER_PROFILE_NATIVE_API.md`](./USER_PROFILE_NATIVE_API.md) |
| 三 | `GET /api/trips/list`、`GET /api/trips/:id` | [`TRIPS_NATIVE_API.md`](./TRIPS_NATIVE_API.md) |
| 五 | `/api/mobile/trips/:id/*` 行中执行 | [`EXECUTE_NATIVE_API.md`](./EXECUTE_NATIVE_API.md) |

---

## 9. 相关文件

| 文件 | 说明 |
|------|------|
| [`EMAIL_AUTH_NATIVE_API.md`](./EMAIL_AUTH_NATIVE_API.md) | 邮箱登录（第 0 阶段） |
| `src/auth/auth.controller.ts` | refresh / logout 实现 |
| `src/users/users.controller.ts` | `/users/me` 实现 |
| `src/auth/services/token.service.ts` | Token 签发与旋转 |
| `src/common/dto/standard-response.dto.ts` | `{ success, data, error }` 格式 |
