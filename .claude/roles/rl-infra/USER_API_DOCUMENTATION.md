# 用户相关接口文档

> 更新时间: 2026-01-21

本文档详细说明了 TripNARA 平台中所有与用户相关的 API 接口，包括认证、用户信息管理、偏好设置等功能。

---

## 目录

- [一、认证接口 (`/api/auth`)](#一认证接口-apiauth)
  - [1.1 Google OAuth 认证](#11-google-oauth-认证)
  - [1.2 邮箱认证](#12-邮箱认证)
  - [1.3 Token 管理](#13-token-管理)
- [二、用户信息接口 (`/api/users`)](#二用户信息接口-apiusers)
  - [2.1 当前用户信息](#21-当前用户信息)
  - [2.2 用户偏好画像](#22-用户偏好画像)
- [三、管理接口（后台）](#三管理接口后台)
  - [3.1 用户列表管理](#31-用户列表管理)
  - [3.2 用户统计](#32-用户统计)
  - [3.3 用户详情管理](#33-用户详情管理)
- [四、统一响应格式](#四统一响应格式)
- [五、认证机制说明](#五认证机制说明)
- [六、接口分类总结](#六接口分类总结)

---

## 一、认证接口 (`/api/auth`)

### 1.1 Google OAuth 认证

#### 1.1.1 Google OAuth - Code 模式登录

**端点**: `POST /api/auth/google/code`

**说明**: 使用 Google OAuth 授权码进行登录（主方案，推荐）。前端通过 Google Identity Services 获取 authorization code，然后调用此接口交换 TripNARA 会话令牌。

**认证**: 无需认证（公开接口）

**请求体**:
```json
{
  "code": "4/0AX4XfWi..."
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | Google OAuth authorization code |

**响应示例**:
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": "https://lh3.googleusercontent.com/...",
    "emailVerified": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| user.id | string | 用户ID（UUID） |
| user.email | string \| null | 邮箱地址 |
| user.displayName | string \| null | 显示名称 |
| user.avatarUrl | string \| null | 头像URL |
| user.emailVerified | boolean \| null | 邮箱是否已验证 |
| accessToken | string | JWT Access Token（15分钟有效期） |

**注意事项**:
- Refresh Token 会自动设置为 httpOnly cookie（30天有效期）
- 支持 Origin 白名单验证（开发环境：`http://localhost:5173`, `http://localhost:3001` 等；生产环境：`https://tripnara.com`, `https://www.tripnara.com`）
- 如果用户不存在，会自动创建新用户
- 如果用户已存在（通过 `googleSub` 或 `email` 匹配），会更新用户信息

**错误响应**:
- `400 Bad Request`: 无效的授权码或 Origin 不在白名单中
- `500 Internal Server Error`: 服务器内部错误

---

#### 1.1.2 Google OAuth - ID Token 模式登录

**端点**: `POST /api/auth/google/id-token`

**说明**: 使用 Google ID Token 进行快速登录（加速方案，适合 One Tap / Sign-In Button）。前端直接从 Google One Tap 或 Sign-In Button 获取 ID token，然后调用此接口。

**认证**: 无需认证（公开接口）

**请求体**:
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2..."
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| idToken | string | 是 | Google ID Token (JWT) |

**响应示例**: 同 `POST /api/auth/google/code`

**注意事项**:
- 此方案实现简单，适合快速登录场景
- 回访用户转化率高
- 同样支持自动创建/更新用户

**错误响应**:
- `400 Bad Request`: 无效的 ID Token
- `500 Internal Server Error`: 服务器内部错误

---

### 1.2 邮箱认证

#### 1.2.1 发送邮箱验证码

**端点**: `POST /api/auth/email/send-code`

**说明**: 向指定邮箱发送验证码，用于注册或登录。

**认证**: 无需认证（公开接口）

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址 |

**响应示例**:
```json
{
  "message": "验证码已发送，请查收邮件"
}
```

**注意事项**:
- 验证码有效期通常为 5-10 分钟（具体由服务配置决定）
- 有频率限制，避免频繁请求
- 验证码会发送到指定邮箱

**错误响应**:
- `400 Bad Request`: 无效的邮箱地址或请求过于频繁
- `500 Internal Server Error`: 服务器内部错误

---

#### 1.2.2 邮箱注册

**端点**: `POST /api/auth/email/register`

**说明**: 使用邮箱和验证码注册新用户。

**认证**: 无需认证（公开接口）

**请求体**:
```json
{
  "email": "user@example.com",
  "code": "123456",
  "displayName": "John Doe"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址 |
| code | string | 是 | 验证码（通过 `/api/auth/email/send-code` 获取） |
| displayName | string | 否 | 显示名称 |

**响应示例**: 同 `POST /api/auth/google/code`（返回用户信息和 accessToken）

**注意事项**:
- 验证码必须有效且未过期
- 如果邮箱已被注册，会返回错误
- 注册成功后自动登录，返回会话令牌

**错误响应**:
- `400 Bad Request`: 验证码无效或已过期，或邮箱已被注册
- `500 Internal Server Error`: 服务器内部错误

---

#### 1.2.3 邮箱登录

**端点**: `POST /api/auth/email/login`

**说明**: 使用邮箱和验证码登录已存在的用户。

**认证**: 无需认证（公开接口）

**请求体**:
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址（必须是有效的邮箱格式） |
| code | string | 是 | 验证码（通过 `/api/auth/email/send-code` 获取） |

**响应示例**: 同 `POST /api/auth/google/code`（返回用户信息和 accessToken）

**注意事项**:
- 验证码必须有效且未过期
- 如果邮箱未注册，会返回错误，提示先注册
- 登录成功后返回会话令牌

**错误响应**:
- `400 Bad Request`: 验证码无效或已过期，或邮箱未注册
- `500 Internal Server Error`: 服务器内部错误

---

### 1.3 Token 管理

#### 1.3.1 刷新 Access Token

**端点**: `POST /api/auth/refresh`

**说明**: 使用 Refresh Token（从 httpOnly cookie 中读取）刷新 Access Token。实现 Token 旋转机制，提升安全性。

**认证**: 需要 Refresh Token（通过 httpOnly cookie 传递）

**请求体**: 无（Refresh Token 通过 Cookie 传递）

**Cookie**:
| Cookie 名称 | 类型 | 说明 |
|------------|------|------|
| refresh_token | string | Refresh Token（httpOnly，自动发送） |

**响应示例**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| accessToken | string | 新的 JWT Access Token（15分钟有效期） |

**注意事项**:
- Refresh Token 会自动旋转（每次刷新都会生成新的 Refresh Token）
- 新的 Refresh Token 会自动更新到 httpOnly cookie
- Access Token 有效期：15分钟
- Refresh Token 有效期：30天

**错误响应**:
- `401 Unauthorized`: Refresh Token 无效、过期或未找到
- `500 Internal Server Error`: 服务器内部错误

---

#### 1.3.2 退出登录

**端点**: `POST /api/auth/logout`

**说明**: 退出登录并撤销 Refresh Token。

**认证**: 需要 Refresh Token（通过 httpOnly cookie 传递）

**请求体**: 无

**Cookie**: 同 `POST /api/auth/refresh`

**响应示例**:
```json
{
  "message": "Logged out successfully"
}
```

**注意事项**:
- 会撤销当前的 Refresh Token
- 会清除 httpOnly cookie 中的 refresh_token
- Access Token 虽然不会立即失效，但建议前端清除本地存储的 Access Token

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

## 二、用户信息接口 (`/api/users`)

### 2.1 当前用户信息

#### 2.1.1 获取当前用户信息

**端点**: `GET /api/users/me`

**说明**: 获取当前已登录用户的基本信息。

**认证**: 需要 JWT Bearer Token

**请求头**:
```
Authorization: Bearer <accessToken>
```

**请求参数**: 无

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "emailVerified": true,
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "googleSub": "1234567890",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 用户ID（UUID） |
| email | string \| null | 邮箱地址 |
| emailVerified | boolean \| null | 邮箱是否已验证 |
| displayName | string \| null | 显示名称 |
| avatarUrl | string \| null | 头像URL |
| googleSub | string \| null | Google 用户唯一ID（如果通过Google登录） |
| createdAt | string (ISO 8601) | 账户创建时间 |
| updatedAt | string (ISO 8601) | 账户更新时间 |

**错误响应**:
- `401 Unauthorized`: 未认证或 token 无效
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 2.1.2 更新当前用户信息

**端点**: `PUT /api/users/me`

**说明**: 更新当前已登录用户的基本信息（显示名称、头像）。

**认证**: 需要 JWT Bearer Token

**请求头**:
```
Authorization: Bearer <accessToken>
```

**请求体**:
```json
{
  "displayName": "John Doe",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| displayName | string | 否 | 显示名称（最大长度100） |
| avatarUrl | string | 否 | 头像URL（必须是有效的URL格式） |

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "emailVerified": true,
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "googleSub": "1234567890",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**注意事项**:
- 支持部分更新（只传需要更新的字段）
- `displayName` 最大长度为100字符
- `avatarUrl` 必须是有效的URL格式

**错误响应**:
- `400 Bad Request`: 输入数据验证失败（如URL格式无效）
- `401 Unauthorized`: 未认证或 token 无效
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 2.1.3 删除当前用户账户

**端点**: `DELETE /api/users/me`

**说明**: 永久删除当前用户账户及其所有关联数据。**此操作不可撤销！**

**认证**: 需要 JWT Bearer Token

**请求头**:
```
Authorization: Bearer <accessToken>
```

**请求体**:
```json
{
  "confirmText": "确认删除"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| confirmText | string | 是 | 确认文本（必须输入"确认删除"） |

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "deletedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| deleted | boolean | 是否成功删除 |
| userId | string | 被删除的用户ID |
| deletedAt | string (ISO 8601) | 删除时间 |

**注意事项**:
- **危险操作**：此操作会永久删除用户账户及其所有关联数据（行程、偏好设置等）
- 必须提供 `confirmText="确认删除"` 才能执行删除操作
- 删除后无法恢复

**错误响应**:
- `400 Bad Request`: 未确认删除操作（`confirmText` 不等于"确认删除"）
- `401 Unauthorized`: 未认证或 token 无效
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 2.2 用户偏好画像

#### 2.2.1 获取用户偏好画像

**端点**: `GET /api/users/profile`

**说明**: 获取当前用户的偏好画像（如喜欢的景点类型、忌口食物、是否偏好小众景点等）。如果用户没有设置过偏好，返回空画像。

**认证**: 需要 JWT Bearer Token

**请求头**:
```
Authorization: Bearer <accessToken>
```

**请求参数**: 无

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "preferences": {
      "preferredAttractionTypes": ["ATTRACTION", "NATURE", "CULTURE"],
      "dietaryRestrictions": ["VEGETARIAN", "NO_PORK"],
      "preferOffbeatAttractions": false,
      "travelPreferences": {
        "pace": "LEISURE",
        "budget": "MEDIUM",
        "accommodation": "COMFORTABLE"
      },
      "nationality": "CN",
      "residencyCountry": "CN",
      "tags": ["senior", "family_with_children"],
      "other": {
        "accessibility": true,
        "petFriendly": false
      }
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |
| preferences | object \| null | 用户偏好配置（如果未设置则为 null） |
| preferences.preferredAttractionTypes | string[] | 喜欢的景点类型（如：ATTRACTION, NATURE, CULTURE） |
| preferences.dietaryRestrictions | string[] | 饮食禁忌（如：VEGETARIAN, NO_PORK, NO_SEAFOOD） |
| preferences.preferOffbeatAttractions | boolean | 是否偏好小众景点 |
| preferences.travelPreferences | object | 出行偏好 |
| preferences.travelPreferences.pace | string | 节奏（LEISURE, MODERATE, FAST） |
| preferences.travelPreferences.budget | string | 预算（LOW, MEDIUM, HIGH） |
| preferences.travelPreferences.accommodation | string | 住宿（BUDGET, COMFORTABLE, LUXURY） |
| preferences.nationality | string | 国籍（ISO 3166-1 alpha-2） |
| preferences.residencyCountry | string | 居住国（ISO 3166-1 alpha-2） |
| preferences.tags | string[] | 旅行者标签（如：senior, family_with_children, solo） |
| preferences.other | object | 其他偏好（JSON格式，可自定义） |
| createdAt | string (ISO 8601) | 创建时间 |
| updatedAt | string (ISO 8601) | 更新时间 |

**注意事项**:
- 如果用户从未设置过偏好，`preferences` 字段可能为 `null` 或空对象
- 所有偏好字段都是可选的

**错误响应**:
- `401 Unauthorized`: 未认证或 token 无效
- `500 Internal Server Error`: 服务器内部错误

---

#### 2.2.2 更新用户偏好画像

**端点**: `PUT /api/users/profile`

**说明**: 更新或创建用户偏好信息。支持部分更新。

**认证**: 需要 JWT Bearer Token

**请求头**:
```
Authorization: Bearer <accessToken>
```

**请求体**:
```json
{
  "preferences": {
    "preferredAttractionTypes": ["ATTRACTION", "NATURE"],
    "dietaryRestrictions": ["VEGETARIAN"],
    "preferOffbeatAttractions": true,
    "travelPreferences": {
      "pace": "MODERATE",
      "budget": "HIGH",
      "accommodation": "LUXURY"
    },
    "nationality": "US",
    "residencyCountry": "US",
    "tags": ["solo", "adventure"],
    "other": {
      "accessibility": false,
      "petFriendly": true
    }
  }
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| preferences | object | 否 | 用户偏好配置（支持部分更新） |
| preferences.preferredAttractionTypes | string[] | 否 | 喜欢的景点类型 |
| preferences.dietaryRestrictions | string[] | 否 | 饮食禁忌 |
| preferences.preferOffbeatAttractions | boolean | 否 | 是否偏好小众景点 |
| preferences.travelPreferences | object | 否 | 出行偏好 |
| preferences.nationality | string | 否 | 国籍（ISO 3166-1 alpha-2） |
| preferences.residencyCountry | string | 否 | 居住国（ISO 3166-1 alpha-2） |
| preferences.tags | string[] | 否 | 旅行者标签 |
| preferences.other | object | 否 | 其他偏好（JSON格式） |

**响应示例**: 同 `GET /api/users/profile`

**注意事项**:
- 支持部分更新（只传需要更新的字段）
- 如果用户之前没有偏好设置，会创建新的偏好配置
- `preferences` 对象中的所有字段都是可选的

**错误响应**:
- `400 Bad Request`: 输入数据验证失败
- `401 Unauthorized`: 未认证或 token 无效
- `500 Internal Server Error`: 服务器内部错误

---

## 三、管理接口（后台）

> **注意**: 以下接口为后台管理接口，通常需要管理员权限。当前实现中这些接口标记为 `@Public()`，仅用于测试。**生产环境中应添加适当的认证和授权机制。**

### 3.1 用户列表管理

#### 3.1.1 获取用户列表

**端点**: `GET /api/users/admin`

**说明**: 获取用户列表，支持分页、搜索、筛选。

**认证**: 当前为公开接口（生产环境应添加管理员认证）

**请求参数**（Query）:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | number | 否 | 1 | 页码（从1开始） |
| limit | number | 否 | 20 | 每页数量 |
| search | string | 否 | - | 搜索关键词（邮箱、显示名称） |
| emailVerified | boolean | 否 | - | 邮箱验证状态 |

**请求示例**:
```
GET /api/users/admin?page=1&limit=20&search=john&emailVerified=true
```

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "googleSub": "1234567890",
        "email": "user@example.com",
        "emailVerified": true,
        "displayName": "John Doe",
        "avatarUrl": "https://example.com/avatar.jpg",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-02T00:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| users | array | 用户列表 |
| users[].id | string | 用户ID |
| users[].googleSub | string \| null | Google 用户唯一ID |
| users[].email | string \| null | 邮箱地址 |
| users[].emailVerified | boolean \| null | 邮箱是否已验证 |
| users[].displayName | string \| null | 显示名称 |
| users[].avatarUrl | string \| null | 头像URL |
| users[].createdAt | string (ISO 8601) | 创建时间 |
| users[].updatedAt | string (ISO 8601) | 更新时间 |
| total | number | 总用户数 |
| page | number | 当前页码 |
| limit | number | 每页数量 |
| totalPages | number | 总页数 |

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

### 3.2 用户统计

#### 3.2.1 获取用户统计信息

**端点**: `GET /api/users/admin/stats`

**说明**: 获取用户相关的统计数据，包括总用户数、验证状态、新增用户等。

**认证**: 当前为公开接口（生产环境应添加管理员认证）

**请求参数**: 无

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "totalUsers": 1000,
    "verifiedUsers": 850,
    "unverifiedUsers": 150,
    "newUsersToday": 10,
    "newUsersThisWeek": 70,
    "newUsersThisMonth": 300
  }
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| totalUsers | number | 总用户数 |
| verifiedUsers | number | 已验证邮箱的用户数 |
| unverifiedUsers | number | 未验证邮箱的用户数 |
| newUsersToday | number | 今日新增用户数 |
| newUsersThisWeek | number | 本周新增用户数 |
| newUsersThisMonth | number | 本月新增用户数 |

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

### 3.3 用户详情管理

#### 3.3.1 获取用户详情

**端点**: `GET /api/users/admin/:id`

**说明**: 根据用户ID获取用户详细信息。

**认证**: 当前为公开接口（生产环境应添加管理员认证）

**路径参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 用户ID（UUID） |

**请求示例**:
```
GET /api/users/admin/550e8400-e29b-41d4-a716-446655440000
```

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "googleSub": "1234567890",
    "email": "user@example.com",
    "emailVerified": true,
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**错误响应**:
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 3.3.2 获取用户详情（包含关联数据）

**端点**: `GET /api/users/admin/:id/detail`

**说明**: 获取用户详细信息，包括偏好设置、行程统计等关联数据。

**认证**: 当前为公开接口（生产环境应添加管理员认证）

**路径参数**: 同 `GET /api/users/admin/:id`

**请求示例**:
```
GET /api/users/admin/550e8400-e29b-41d4-a716-446655440000/detail
```

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "emailVerified": true,
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "profile": {
      "preferences": {
        "preferredAttractionTypes": ["ATTRACTION", "NATURE"],
        "dietaryRestrictions": ["VEGETARIAN"]
      }
    },
    "tripStats": {
      "totalTrips": 5,
      "activeTrips": 2,
      "completedTrips": 3
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 用户ID |
| email | string \| null | 邮箱地址 |
| emailVerified | boolean \| null | 邮箱是否已验证 |
| displayName | string \| null | 显示名称 |
| avatarUrl | string \| null | 头像URL |
| profile | object \| null | 用户偏好画像 |
| tripStats | object | 行程统计 |
| tripStats.totalTrips | number | 总行程数 |
| tripStats.activeTrips | number | 活跃行程数 |
| tripStats.completedTrips | number | 已完成行程数 |
| createdAt | string (ISO 8601) | 创建时间 |
| updatedAt | string (ISO 8601) | 更新时间 |

**错误响应**:
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 3.3.3 更新用户信息

**端点**: `PUT /api/users/admin/:id`

**说明**: 更新用户信息，包括显示名称、邮箱、邮箱验证状态、头像等。

**认证**: 当前为公开接口（生产环境应添加管理员认证）

**路径参数**: 同 `GET /api/users/admin/:id`

**请求体**:
```json
{
  "displayName": "John Doe Updated",
  "email": "newemail@example.com",
  "emailVerified": true,
  "avatarUrl": "https://example.com/new-avatar.jpg"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| displayName | string | 否 | 显示名称 |
| email | string | 否 | 邮箱地址（必须是有效的邮箱格式） |
| emailVerified | boolean | 否 | 邮箱验证状态 |
| avatarUrl | string | 否 | 头像URL |

**响应示例**: 同 `GET /api/users/admin/:id`

**注意事项**:
- 支持部分更新（只传需要更新的字段）
- `email` 必须是有效的邮箱格式

**错误响应**:
- `400 Bad Request`: 输入数据验证失败（如邮箱格式无效）
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 3.3.4 删除用户

**端点**: `DELETE /api/users/admin/:id`

**说明**: 永久删除指定用户及其所有关联数据。**此操作不可撤销！**

**认证**: 当前为公开接口（生产环境应添加管理员认证）

**路径参数**: 同 `GET /api/users/admin/:id`

**请求示例**:
```
DELETE /api/users/admin/550e8400-e29b-41d4-a716-446655440000
```

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "deletedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**注意事项**:
- **危险操作**：此操作会永久删除用户账户及其所有关联数据
- 删除后无法恢复

**错误响应**:
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

## 四、统一响应格式

所有接口（除认证接口外）都遵循统一的响应格式：

### 成功响应

```json
{
  "success": true,
  "data": {
    // 具体数据
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {
      // 可选的错误详情
    }
  }
}
```

### 错误码说明

| 错误码 | 说明 |
|--------|------|
| `VALIDATION_ERROR` | 输入数据验证失败 |
| `NOT_FOUND` | 资源未找到 |
| `UNAUTHORIZED` | 未认证或 token 无效 |
| `INTERNAL_ERROR` | 服务器内部错误 |

---

## 五、认证机制说明

### 5.1 Token 类型

1. **Access Token (JWT)**
   - 有效期：15分钟
   - 存储位置：前端内存（建议）或 localStorage
   - 用途：每次 API 请求时在 `Authorization` header 中携带
   - 格式：`Authorization: Bearer <accessToken>`

2. **Refresh Token**
   - 有效期：30天
   - 存储位置：httpOnly cookie（服务端自动管理）
   - 用途：刷新 Access Token
   - 安全特性：Token 旋转（每次刷新都会生成新的 Refresh Token）

### 5.2 认证流程

1. **登录流程**:
   ```
   用户登录 → 获取 Access Token + Refresh Token（cookie）
   ```

2. **API 请求流程**:
   ```
   前端请求 → 携带 Access Token → 后端验证 → 返回数据
   ```

3. **Token 刷新流程**:
   ```
   Access Token 过期 → 调用 /api/auth/refresh → 获取新的 Access Token + 新的 Refresh Token（cookie）
   ```

4. **退出登录流程**:
   ```
   调用 /api/auth/logout → 撤销 Refresh Token → 清除 cookie → 前端清除 Access Token
   ```

### 5.3 认证方式

1. **Google OAuth 2.0**
   - Code 模式（推荐）：`POST /api/auth/google/code`
   - ID Token 模式（快速）：`POST /api/auth/google/id-token`

2. **邮箱验证码**
   - 注册：`POST /api/auth/email/register`
   - 登录：`POST /api/auth/email/login`

---

## 六、接口分类总结

### 前端用户系统接口

| 分类 | 端点 | 方法 | 说明 | 认证 |
|------|------|------|------|------|
| **认证** | `/auth/google/code` | POST | Google OAuth Code 登录 | 公开 |
| | `/auth/google/id-token` | POST | Google OAuth ID Token 登录 | 公开 |
| | `/auth/email/send-code` | POST | 发送邮箱验证码 | 公开 |
| | `/auth/email/register` | POST | 邮箱注册 | 公开 |
| | `/auth/email/login` | POST | 邮箱登录 | 公开 |
| | `/auth/refresh` | POST | 刷新 Token | Cookie |
| | `/auth/logout` | POST | 退出登录 | Cookie |
| **用户信息** | `/users/me` | GET | 获取当前用户信息 | JWT |
| | `/users/me` | PUT | 更新当前用户信息 | JWT |
| | `/users/me` | DELETE | 删除当前用户账户 | JWT |
| **用户偏好** | `/users/profile` | GET | 获取用户偏好画像 | JWT |
| | `/users/profile` | PUT | 更新用户偏好画像 | JWT |

### 后台管理系统接口

| 分类 | 端点 | 方法 | 说明 | 认证 |
|------|------|------|------|------|
| **用户管理** | `/users/admin` | GET | 获取用户列表 | 公开* |
| | `/users/admin/stats` | GET | 获取用户统计 | 公开* |
| | `/users/admin/:id` | GET | 获取用户详情 | 公开* |
| | `/users/admin/:id/detail` | GET | 获取用户详情（含关联数据） | 公开* |
| | `/users/admin/:id` | PUT | 更新用户信息 | 公开* |
| | `/users/admin/:id` | DELETE | 删除用户 | 公开* |

> **注意**: 标记为"公开*"的接口当前为测试目的标记为 `@Public()`，生产环境应添加管理员认证和授权。

---

## 七、测试示例

### 7.1 使用 curl 测试

#### Google OAuth Code 登录
```bash
curl -X POST http://localhost:3000/api/auth/google/code \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{
    "code": "4/0AX4XfWi..."
  }'
```

#### 邮箱注册
```bash
# 1. 发送验证码
curl -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'

# 2. 注册
curl -X POST http://localhost:3000/api/auth/email/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "code": "123456",
    "displayName": "John Doe"
  }'
```

#### 获取当前用户信息
```bash
curl -X GET http://localhost:3000/api/users/me \
  -H "Authorization: Bearer <accessToken>"
```

#### 更新用户偏好
```bash
curl -X PUT http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": {
      "preferredAttractionTypes": ["ATTRACTION", "NATURE"],
      "dietaryRestrictions": ["VEGETARIAN"],
      "preferOffbeatAttractions": true
    }
  }'
```

### 7.2 使用 JavaScript/TypeScript 测试

```typescript
// 登录示例
async function login() {
  const response = await fetch('http://localhost:3000/api/auth/google/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173',
    },
    body: JSON.stringify({
      code: '4/0AX4XfWi...',
    }),
  });
  
  const data = await response.json();
  // data.user: 用户信息
  // data.accessToken: Access Token
  // Refresh Token 自动设置为 httpOnly cookie
}

// 获取当前用户信息
async function getCurrentUser(accessToken: string) {
  const response = await fetch('http://localhost:3000/api/users/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  const result = await response.json();
  // result.success: true/false
  // result.data: 用户信息
}

// 刷新 Token
async function refreshToken() {
  const response = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    credentials: 'include', // 重要：包含 cookie
  });
  
  const data = await response.json();
  // data.accessToken: 新的 Access Token
  // 新的 Refresh Token 自动更新到 cookie
}
```

---

## 八、常见问题

### Q1: Access Token 过期后如何处理？

**A**: Access Token 过期后，前端应调用 `/api/auth/refresh` 接口刷新 Token。Refresh Token 会自动从 httpOnly cookie 中读取，无需手动传递。

### Q2: 为什么 Refresh Token 使用 httpOnly cookie？

**A**: httpOnly cookie 可以防止 JavaScript 访问，降低 XSS 攻击风险。Refresh Token 是长期有效的令牌，需要更高的安全性。

### Q3: 如何判断用户是否已登录？

**A**: 可以调用 `GET /api/users/me` 接口，如果返回 `401 Unauthorized`，说明用户未登录或 Token 已过期。

### Q4: 邮箱验证码的有效期是多长？

**A**: 验证码有效期通常为 5-10 分钟（具体由服务配置决定）。验证码使用后即失效。

### Q5: 删除用户账户后，关联数据会如何处理？

**A**: 删除用户账户会同时删除所有关联数据，包括：
- 用户偏好设置
- 用户行程
- 其他关联数据

**此操作不可撤销，请谨慎操作！**

---

## 九、更新日志

- **2026-01-21**: 初始版本，包含所有用户相关接口文档

---

## 十、相关文档

- [RAG & LLM 管理接口文档](./RAG_LLM_ADMIN_API_DOCUMENTATION.md)
- [Context API 文档](./CONTEXT_API_DOCUMENTATION.md)
- [前端后端 API 映射](./FRONTEND_BACKEND_API_MAPPING.md)
