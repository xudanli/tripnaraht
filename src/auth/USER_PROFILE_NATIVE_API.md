# 用户资料 — App Native 对接文档（第二阶段）

> **前置：** 第一阶段会话闭环已完成（见 [`SESSION_NATIVE_API.md`](./SESSION_NATIVE_API.md)）  
> **Global prefix：** `/api`  
> **本阶段目标：** 编辑基本资料、读写旅行偏好画像  
> **响应格式：** 统一 `{ success, data, error }`（与 auth 裸 JSON 不同）  
> **最后更新：** 2026-07-08

---

## 0. 本阶段接口一览

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| P0 | GET | `/api/users/me` | 读基本资料（第一阶段已对接，本阶段复用） |
| P0 | PUT | `/api/users/me` | 改昵称、头像 URL |
| P0 | POST | `/api/users/me/avatar` | 上传头像（multipart，自动写 avatarUrl） |
| P0 | GET | `/api/users/profile` | 读旅行偏好画像 |
| P0 | PUT | `/api/users/profile` | 写旅行偏好画像 |
| P2 | DELETE | `/api/users/me` | 注销账户（设置页，可选） |

**Base URL（真机联调）：** `http://192.168.8.153:8080/api`

**通用请求头：**

```
Authorization: Bearer <accessToken>
Content-Type: application/json   # PUT 时需要
```

---

## 1. 整体流程

```
进入「我的」/ Onboarding
    │
    ├─ GET /users/me          → 展示头像、昵称、邮箱
    │
    ├─ PUT /users/me          → 用户改昵称
    │
    ├─ POST /users/me/avatar → 上传头像（推荐，一步完成）
    │   或 PUT /users/me { avatarUrl } → 已有 URL 时手动更新
    │
    ├─ GET /users/profile     → 读偏好（节奏、预算、饮食禁忌等）
    │
    └─ PUT /users/profile     → 保存偏好（注册引导 / 设置页）
```

### 1.1 数据分层

| 存储 | 接口 | 典型字段 |
|------|------|----------|
| **User 基本资料** | `/users/me` | email、displayName、avatarUrl |
| **UserProfile 偏好** | `/users/profile` | 景点类型、饮食、节奏、预算、国籍 |

邮箱地址**不可**通过本阶段接口修改（由邮箱 OTP 登录体系管理）。

---

## 2. GET /api/users/me

> 详见 [`SESSION_NATIVE_API.md` §2](./SESSION_NATIVE_API.md#2-get-apiusersme)。登录后拉取用户信息，本阶段直接复用。

**典型用途：** 「我的」页展示、本地缓存 userId / displayName。

---

## 3. PUT /api/users/me

更新当前用户**基本资料**（昵称、头像 URL）。

### 3.1 请求

```
PUT /api/users/me
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "displayName": "张三",
  "avatarUrl": "https://cdn.example.com/avatars/user.jpg"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| displayName | string | 否 | 显示名称，最长 100 字符 |
| avatarUrl | string | 否 | 头像 URL，须为合法 URL |

**部分更新：** 只传需要修改的字段即可；未传字段保持不变。

### 3.2 成功响应 200

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "emailVerified": true,
    "displayName": "张三",
    "avatarUrl": "https://cdn.example.com/avatars/user.jpg",
    "googleSub": null,
    "createdAt": "2026-01-15T08:00:00.000Z",
    "updatedAt": "2026-07-08T11:00:00.000Z"
  }
}
```

响应 `data` 结构与 `GET /users/me` 相同。

### 3.3 错误响应

| 条件 | success | error.code | 说明 |
|------|---------|------------|------|
| 未登录 | false | `UNAUTHORIZED` | 需 refresh 或回登录 |
| 用户不存在 | false | `NOT_FOUND` | 极少见 |
| avatarUrl 非法 | false | `VALIDATION_ERROR` | URL 格式校验失败 |
| 服务端异常 | false | `INTERNAL_ERROR` | 稍后重试 |

### 3.4 POST /api/users/me/avatar（推荐）

上传图片到 OSS，并**自动更新**当前用户的 `avatarUrl`。Native 改头像应优先用此接口，无需先调通用上传再 PUT。

#### 3.4.1 请求

```
POST /api/users/me/avatar
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | 头像图片，JPEG / PNG / WebP / GIF，最大 **5MB** |

存储路径：`avatars/{userId}/{uuid}.{ext}`。若旧头像也是本服务 OSS 的 `avatars/` 路径，上传成功后会尝试删除旧文件。

**前置条件：** 服务端需配置阿里云 OSS（见 [`../upload/UPLOAD_API.md`](../upload/UPLOAD_API.md)）。可用 `GET /api/upload/status` 检查 `available: true`。

#### 3.4.2 成功响应 200

```json
{
  "success": true,
  "data": {
    "url": "https://your-cdn.example.com/avatars/550e8400-e29b-41d4-a716-446655440000/a1b2c3.jpg",
    "key": "avatars/550e8400-e29b-41d4-a716-446655440000/a1b2c3.jpg",
    "size": 102400,
    "mimeType": "image/jpeg",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "emailVerified": true,
      "displayName": "张三",
      "avatarUrl": "https://your-cdn.example.com/avatars/550e8400-e29b-41d4-a716-446655440000/a1b2c3.jpg",
      "googleSub": null,
      "createdAt": "2026-01-15T08:00:00.000Z",
      "updatedAt": "2026-07-08T12:00:00.000Z"
    }
  }
}
```

UI 可直接用 `data.user.avatarUrl` 或 `data.url` 刷新头像；二者相同。

#### 3.4.3 错误响应

| 条件 | success | error.code | 说明 |
|------|---------|------------|------|
| 未登录 | false | `UNAUTHORIZED` | 需 refresh 或回登录 |
| 未选文件 / 格式不对 / 超过 5MB | false | `VALIDATION_ERROR` | 检查 multipart 字段名 `file` |
| OSS 未配置 | false | `VALIDATION_ERROR` | `图片上传服务未配置，请联系管理员` |
| 用户不存在 | false | `NOT_FOUND` | 极少见 |
| 上传失败 | false | `VALIDATION_ERROR` 或 `INTERNAL_ERROR` | 网络或 OSS 异常 |

#### 3.4.4 Swift 示例（multipart）

```swift
struct AvatarUploadData: Decodable {
    let url: String
    let key: String
    let size: Int
    let mimeType: String
    let user: CurrentUser
}

func uploadAvatar(accessToken: String, imageData: Data, filename: String = "avatar.jpg", mimeType: String = "image/jpeg") async throws -> AvatarUploadData {
    let boundary = UUID().uuidString
    var req = URLRequest(url: APIConfig.url("users/me/avatar"))
    req.httpMethod = "POST"
    req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

    var body = Data()
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
    body.append(imageData)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
    req.httpBody = body

    let (data, _) = try await URLSession.shared.data(for: req)
    let wrapped = try JSONDecoder().decode(StandardResponse<AvatarUploadData>.self, from: data)
    guard wrapped.success, let result = wrapped.data else {
        throw APIError.from(wrapped.error)
    }
    return result
}
```

#### 3.4.5 cURL 示例

```bash
curl -X POST "http://192.168.8.153:8080/api/users/me/avatar" \
  -H "Authorization: Bearer <accessToken>" \
  -F "file=@/path/to/avatar.jpg"
```

### 3.5 仅用 URL 更新头像（可选）

`PUT /api/users/me` 仍支持直接传 **avatarUrl 字符串**（例如第三方 OAuth 头像、已托管的 CDN 地址），不包含 multipart：

```
PUT /users/me { "avatarUrl": "<url>" }
```

### 3.6 Swift 示例（PUT 昵称 / URL）

```swift
struct UpdateMeRequest: Encodable {
    var displayName: String?
    var avatarUrl: String?
}

func updateMe(accessToken: String, body: UpdateMeRequest) async throws -> CurrentUser {
    var req = URLRequest(url: APIConfig.url("users/me"))
    req.httpMethod = "PUT"
    req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONEncoder().encode(body)

    let (data, _) = try await URLSession.shared.data(for: req)
    let wrapped = try JSONDecoder().decode(StandardResponse<CurrentUser>.self, from: data)
    guard wrapped.success, let user = wrapped.data else {
        throw APIError.from(wrapped.error)
    }
    return user
}
```

---

## 4. GET /api/users/profile

获取当前用户的**旅行偏好画像**。用于 Onboarding、设置页、规划个性化。

### 4.1 请求

```
GET /api/users/profile
Authorization: Bearer <accessToken>
```

无 Request Body。

### 4.2 成功响应 200

**已有偏好：**

```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "preferences": {
      "preferredAttractionTypes": ["ATTRACTION", "NATURE", "CULTURE"],
      "dietaryRestrictions": ["VEGETARIAN"],
      "preferOffbeatAttractions": true,
      "travelPreferences": {
        "pace": "LEISURE",
        "budget": "MEDIUM",
        "accommodation": "COMFORTABLE",
        "travelMode": "PUBLIC_TRANSIT"
      },
      "nationality": "CN",
      "residencyCountry": "CN",
      "tags": ["family_with_children"],
      "other": {
        "accessibility": true,
        "petFriendly": false
      }
    },
    "createdAt": "2026-01-15T08:00:00.000Z",
    "updatedAt": "2026-07-01T09:00:00.000Z"
  }
}
```

**从未设置过偏好：**

```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "preferences": null,
    "createdAt": "2026-07-08T11:00:00.000Z",
    "updatedAt": "2026-07-08T11:00:00.000Z"
  }
}
```

> 新用户 `preferences` 可能为 `null` 或缺失，UI 应展示默认值，并引导 `PUT /users/profile`。

### 4.3 preferences 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| preferredAttractionTypes | string[] | 喜欢的景点类型 |
| dietaryRestrictions | string[] | 饮食禁忌 |
| preferOffbeatAttractions | boolean | 是否偏好小众景点 |
| travelPreferences.pace | string | 节奏：`LEISURE` \| `MODERATE` \| `FAST` |
| travelPreferences.budget | string | 预算：`LOW` \| `MEDIUM` \| `HIGH` |
| travelPreferences.accommodation | string | 住宿：`BUDGET` \| `COMFORTABLE` \| `LUXURY` |
| travelPreferences.travelMode | string | 出行：`DRIVING` \| `PUBLIC_TRANSIT` \| `MIXED` |
| nationality | string | 国籍 ISO 3166-1 alpha-2，如 `CN` |
| residencyCountry | string | 居住国 ISO 3166-1 alpha-2 |
| tags | string[] | 旅行者标签，如 `solo`、`family_with_children`、`senior` |
| other | object | 扩展 JSON，自定义键值 |

**常用枚举参考：**

| 类别 | 可选值 |
|------|--------|
| 景点类型 | `ATTRACTION`, `NATURE`, `CULTURE`, … |
| 饮食禁忌 | `VEGETARIAN`, `NO_PORK`, `NO_SEAFOOD`, … |

### 4.4 错误响应

| 条件 | error.code |
|------|------------|
| 未登录 | `UNAUTHORIZED` |
| 服务端异常 | `INTERNAL_ERROR` |

---

## 5. PUT /api/users/profile

创建或更新用户偏好画像。

### 5.1 请求

```
PUT /api/users/profile
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "preferences": {
    "preferredAttractionTypes": ["NATURE", "CULTURE"],
    "dietaryRestrictions": ["VEGETARIAN"],
    "preferOffbeatAttractions": false,
    "travelPreferences": {
      "pace": "MODERATE",
      "budget": "MEDIUM",
      "accommodation": "COMFORTABLE",
      "travelMode": "MIXED"
    },
    "nationality": "CN",
    "residencyCountry": "CN",
    "tags": ["solo"],
    "other": {
      "accessibility": false
    }
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| preferences | object | 否 | 偏好配置；不传则行为取决于服务端 |

### 5.2 ⚠️ 整包替换（Native 必读）

服务端对 `preferences` 做 **整对象替换**，不是字段级 merge。

```
错误做法：只 PUT { "preferences": { "travelPreferences": { "pace": "FAST" } } }
         → 其他已保存字段（饮食、tags 等）会丢失

正确做法：GET /profile → 本地 merge 修改项 → PUT 完整 preferences
```

**推荐保存流程：**

```swift
var prefs = (try await getProfile()).preferences ?? UserPreferences.defaults()
prefs.travelPreferences?.pace = "MODERATE"
try await updateProfile(preferences: prefs)
```

### 5.3 成功响应 200

与 `GET /api/users/profile` 的 `data` 结构相同。

```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "preferences": { "...": "..." },
    "createdAt": "2026-01-15T08:00:00.000Z",
    "updatedAt": "2026-07-08T11:05:00.000Z"
  }
}
```

首写时会 **upsert** 创建 `UserProfile` 记录。

### 5.4 错误响应

| 条件 | error.code | 说明 |
|------|------------|------|
| 未登录 | `UNAUTHORIZED` | |
| 字段校验失败 | `VALIDATION_ERROR` | 如 preferences 非 object |
| 服务端异常 | `INTERNAL_ERROR` | |

---

## 6. DELETE /api/users/me（P2，可选）

永久删除当前账户，**不可撤销**。

### 6.1 请求

```
DELETE /api/users/me
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "confirmText": "确认删除"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| confirmText | string | 建议必填 | 须为 `"确认删除"` |

### 6.2 成功响应 200

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "deletedAt": "2026-07-08T11:10:00.000Z"
  }
}
```

成功后：本地清 Keychain → 调 `POST /auth/logout`（可选）→ 回登录页。

### 6.3 错误响应

| 条件 | error.code |
|------|------------|
| 未确认 | `VALIDATION_ERROR` |
| 未登录 | `UNAUTHORIZED` |

---

## 7. Swift 数据模型参考

```swift
struct UserPreferences: Codable {
    var preferredAttractionTypes: [String]?
    var dietaryRestrictions: [String]?
    var preferOffbeatAttractions: Bool?
    var travelPreferences: TravelPreferences?
    var nationality: String?
    var residencyCountry: String?
    var tags: [String]?
    var other: [String: JSONValue]?  // 或用 [String: Any] + 自定义 Codable

    static func defaults() -> UserPreferences {
        UserPreferences(
            travelPreferences: TravelPreferences(pace: "MODERATE", budget: "MEDIUM",
                                                 accommodation: "COMFORTABLE", travelMode: "MIXED")
        )
    }
}

struct TravelPreferences: Codable {
    var pace: String?
    var budget: String?
    var accommodation: String?
    var travelMode: String?
}

struct UserProfile: Codable {
    let userId: String
    let preferences: UserPreferences?
    let createdAt: String
    let updatedAt: String
}
```

---

## 8. Onboarding 推荐 UI 流程

```
注册/登录成功
    ↓
GET /users/me（已有昵称？跳过一步）
    ↓
PUT /users/me { displayName }（可选）
    ↓
GET /users/profile
    ├─ preferences 为空 → 展示偏好问卷
    └─ 已有 → 跳过或允许修改
    ↓
PUT /users/profile { preferences: 完整对象 }
    ↓
进入首页（第三阶段：GET /trips/list）
```

---

## 9. curl 联调

```bash
BASE=http://192.168.8.153:8080/api
TOKEN=<accessToken>

# 1. 更新昵称
curl -s -X PUT "$BASE/users/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"TripNARA 用户"}' | jq

# 2. 读偏好
curl -s "$BASE/users/profile" \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. 写偏好
curl -s -X PUT "$BASE/users/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": {
      "travelPreferences": { "pace": "LEISURE", "budget": "MEDIUM" },
      "nationality": "CN"
    }
  }' | jq
```

---

## 10. 错误码速查

| 场景 | 识别 | Native 动作 |
|------|------|-------------|
| Token 失效 | `success: false`, `code: UNAUTHORIZED` | refresh → 重试 |
| 校验失败 | `code: VALIDATION_ERROR` | 展示 `error.message` |
| 保存偏好丢字段 | 未先 GET 再 merge | 修复客户端 merge 逻辑 |
| 网络失败 | URLSession 错误 | 提示重试 |

---

## 11. 下一阶段预告

| 阶段 | 接口 | 说明 |
|------|------|------|
| **三** | `GET /api/trips/list` | 行程列表首页 |
| 三 | `GET /api/trips/:id` | 行程详情 |
| 三 | `POST /api/trips` | Hub ④ 表单创建 |

详见 [`TRIPS_NATIVE_API.md`](./TRIPS_NATIVE_API.md)、[`TRIP_CREATE_ENTRIES_NATIVE_API.md`](./TRIP_CREATE_ENTRIES_NATIVE_API.md)（Web 四入口）。

---

## 12. 相关文件

| 文件 | 说明 |
|------|------|
| [`SESSION_NATIVE_API.md`](./SESSION_NATIVE_API.md) | 第一阶段：会话闭环 |
| [`EMAIL_AUTH_NATIVE_API.md`](./EMAIL_AUTH_NATIVE_API.md) | 第 0 阶段：邮箱登录 |
| `src/users/users.controller.ts` | 路由实现 |
| `src/users/dto/user-profile.dto.ts` | 偏好 DTO |
| `src/users/dto/current-user.dto.ts` | 基本资料 DTO |
| `USER_PREFERENCES_API_DOCUMENTATION.md` | 偏好字段全量说明（含规划助手等扩展接口） |
