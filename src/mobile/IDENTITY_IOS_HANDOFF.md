# 个人资料（含国籍）· iOS P0 Handoff

> **读者**：iOS  
> **范围**：账号基础信息 + 个人资料（国籍 / 常住地区 / 手机等）  
> **产品前提**：无 Web 前端；国籍等字段须由 iOS 写入  
> **信封**：`{ "success": true, "data": {...}, "requestId": "...", "serverTime": "..." }`  
> **更新**：2026-08-13

配套：[`PERSONAL_CENTER_IOS_API.md`](./PERSONAL_CENTER_IOS_API.md) · DTO SSOT：`dto/mobile-identity.dto.ts`

---

## 0. 本阶段做什么 / 不做什么

| 做 | 不做（后续 P0 块） |
|----|-------------------|
| 「我的」展示昵称头像邮箱 | 旅行画像 / 驾驶员 / 证件 |
| 「个人资料」编辑页 | 紧急联系人（可同页，但非本 handoff 阻塞） |
| 国籍 / 常住地区 / 语言选择器 | 旧 Web `PUT /users/profile` 偏好问卷 |

**国籍唯一写入路径**：`PATCH /api/mobile/users/me/identity`  
（服务端会双写到旧 `preferences.nationality`，Admin / 准备度可读。）

---

## 1. 接口清单

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| P0 | GET | `/api/users/me` | 「我的」缓存 userId / 昵称 / 头像 / 邮箱 |
| P0 | PUT | `/api/users/me` | 仅改昵称或已有 avatarUrl（可选） |
| P0 | POST | `/api/users/me/avatar` | 上传头像（推荐） |
| P0 | GET | `/api/mobile/users/me/identity` | 个人资料整页数据 |
| P0 | PATCH | `/api/mobile/users/me/identity` | 保存资料（含国籍） |
| P0 | PUT | `/api/mobile/users/me/identity` | 与 PATCH 同语义 |
| P0 | GET | `/api/mobile/users/me/identity/options` | 一次拉国籍+地区+语言选项 |
| P0 | GET | `/api/mobile/users/me/identity/nationalities?q=` | 国籍搜索 |
| P0 | GET | `/api/mobile/users/me/identity/residency-regions?countryCode=` | 按国过滤常住地区 |

鉴权：`Authorization: Bearer <accessToken>`

---

## 2. 页面与调用节奏

```
「我的」
  └─ GET /api/users/me

「个人资料」进入
  ├─ GET /api/mobile/users/me/identity
  └─ GET /api/mobile/users/me/identity/options   // 可缓存

改国籍
  └─ 搜索：GET .../identity/nationalities?q=中
  └─ 保存：PATCH .../identity  { "nationality": "CN" }
       或  { "nationality": { "code": "CN" } }

改常住地区（先选国籍/国家）
  └─ GET .../identity/residency-regions?countryCode=CN
  └─ PATCH .../identity  { "residencyRegion": "CN-SH" }

改头像
  └─ POST /api/users/me/avatar  (multipart file)
  └─ 或 PATCH identity { "avatarUrl": "https://..." }

保存其它字段（部分更新）
  └─ PATCH .../identity  { "phone": "...", "displayName": "..." }
```

---

## 3. 响应 / 请求契约

### 3.1 GET identity → `data`

```json
{
  "displayName": "张三",
  "avatarUrl": "https://cdn.example.com/a.jpg",
  "email": "user@example.com",
  "phone": "+8613800138000",
  "legalFullName": "张三",
  "dateOfBirth": "1990-01-02",
  "nationality": "CN",
  "nationalityLabelZh": "中国",
  "nationalityLabelEn": "China",
  "residencyRegion": "CN-SH",
  "residencyRegionLabelZh": "上海",
  "residencyRegionLabelEn": "Shanghai",
  "preferredLanguage": "zh-Hans",
  "visibility": {
    "legalFullName": "self_only",
    "dateOfBirth": "self_only",
    "phone": "self_only"
  },
  "updatedAt": "2026-08-13T12:00:00.000Z"
}
```

| 字段 | 类型 | UI |
|------|------|-----|
| displayName | string? | 昵称 |
| avatarUrl | string? | 头像 |
| email | string? | **只读**（登录体系） |
| phone | string? | 手机 |
| legalFullName | string? | 法定姓名 |
| dateOfBirth | string? | `YYYY-MM-DD` |
| nationality | string? | ISO alpha-2，展示用 `nationalityLabelZh` |
| residencyRegion | string? | ISO 3166-2（如 `CN-SH`）或国家码 |
| preferredLanguage | string? | BCP-47，如 `zh-Hans` |
| visibility.* | enum | `self_only` \| `organizer` \| `team` |

未填字段为 `null`。

### 3.2 PATCH identity 请求体（部分更新）

```json
{
  "displayName": "张三",
  "phone": "+8613800138000",
  "legalFullName": "张三",
  "dateOfBirth": "1990-01-02",
  "nationality": "CN",
  "residencyRegion": "CN-SH",
  "preferredLanguage": "zh-Hans",
  "visibility": { "phone": "organizer" }
}
```

选择器也可直接丢对象（服务端抽 `code` / `isoCode`）：

```json
{ "nationality": { "code": "CN", "nameZh": "中国" } }
{ "residencyRegion": { "code": "CN-SH" } }
```

别名：`nationalityCode` / `countryCode` → nationality；`residencyRegionCode` → residencyRegion。

成功响应 `data` 与 GET 相同。

### 3.3 GET identity/options → `data`

```json
{
  "nationalities": [{ "code": "CN", "nameZh": "中国", "nameEn": "China" }],
  "residencyRegions": [{ "code": "CN-SH", "nameZh": "上海", "nameEn": "Shanghai", "countryCode": "CN" }],
  "preferredLanguages": [{ "code": "zh-Hans", "nameZh": "简体中文", "nameEn": "Simplified Chinese" }]
}
```

`nationalities` 已置顶常用护照国（CN/HK/…）。长列表搜索用 `nationalities?q=`。

### 3.4 GET residency-regions?countryCode=CN → `data`

```json
{
  "countryCode": "CN",
  "items": [{ "code": "CN-SH", "nameZh": "上海", "nameEn": "Shanghai", "countryCode": "CN" }]
}
```

---

## 4. Swift 模型（示意）

```swift
struct MobileEnvelope<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let requestId: String?
    let serverTime: String?
}

struct IdentityVisibility: Codable {
    var legalFullName: String  // self_only | organizer | team
    var dateOfBirth: String
    var phone: String
}

struct MobileIdentity: Codable {
    var displayName: String?
    var avatarUrl: String?
    var email: String?
    var phone: String?
    var legalFullName: String?
    var dateOfBirth: String?
    var nationality: String?
    var nationalityLabelZh: String?
    var nationalityLabelEn: String?
    var residencyRegion: String?
    var residencyRegionLabelZh: String?
    var residencyRegionLabelEn: String?
    var preferredLanguage: String?
    var visibility: IdentityVisibility
    var updatedAt: String
}

struct IdentityCodeLabel: Codable, Identifiable {
    var id: String { code }
    let code: String
    let nameZh: String
    let nameEn: String
    let countryCode: String?
}

struct IdentityOptions: Codable {
    let nationalities: [IdentityCodeLabel]
    let residencyRegions: [IdentityCodeLabel]
    let preferredLanguages: [IdentityCodeLabel]
}
```

---

## 5. 错误码

| success | code | 场景 |
|---------|------|------|
| false | `UNAUTHORIZED` | 未登录 |
| false | `VALIDATION_ERROR` | 生日格式非法、国籍/地区码非法、visibility 非法 |
| false | `INTERNAL_ERROR` | 服务端异常 |

非法 `nationality` 提示：须为 ISO 3166-1 alpha-2（如 `CN`），或传 `{ "code": "CN" }`。

---

## 6. iOS DoD（本 P0）

- [ ] 「我的」展示 `GET /users/me` 的昵称 / 头像 / 邮箱
- [ ] 「个人资料」进页拉 `GET identity`，空字段可编辑
- [ ] 国籍选择器：options 或 `nationalities?q=`；保存后回显 `nationalityLabelZh`
- [ ] 常住地区：按国籍/国家拉 `residency-regions`；保存 `CN-SH` 这类码
- [ ] 语言选择器：用 options 的 `preferredLanguages`
- [ ] 头像：优先 `POST /users/me/avatar`
- [ ] 邮箱只读；不调旧 `PUT /users/profile` 写国籍
- [ ] 保存成功后本地刷新 identity；Admin `GET /api/users/admin` 能看到 `identity.nationality`

---

## 7. curl 联调

```bash
BASE=http://localhost:3000/api
TOKEN=<accessToken>

curl -s "$BASE/mobile/users/me/identity" -H "Authorization: Bearer $TOKEN" | jq

curl -s "$BASE/mobile/users/me/identity/options" -H "Authorization: Bearer $TOKEN" | jq

curl -s -X PATCH "$BASE/mobile/users/me/identity" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "TripNARA 用户",
    "nationality": "CN",
    "residencyRegion": "CN-SH",
    "preferredLanguage": "zh-Hans",
    "phone": "+8613800138000"
  }' | jq
```
