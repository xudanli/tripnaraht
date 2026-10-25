# 个人中心接口（iOS · P0）

> 前缀：`/api/mobile/users/me/...`  
> 鉴权：`Authorization: Bearer <token>`（与紧急联系人一致：软鉴权，未登录时 `success: false`）  
> 信封：`{ "success": true, "data": {...}, "requestId": "...", "serverTime": "..." }`  
> 更新：2026-08-13

跨行程可复用能力。行程级驾驶安排见 [ICELAND_SELF_DRIVE_IOS_API.md](../trips/iceland-self-drive/ICELAND_SELF_DRIVE_IOS_API.md) 的 `driving-settings`。

**个人资料（含国籍）专项对接** → [`IDENTITY_IOS_HANDOFF.md`](./IDENTITY_IOS_HANDOFF.md)（无 Web；国籍须由 iOS 写 identity）。

---

## 总览

| 方法 | 路径 | 用途 |
|------|------|------|
| GET/PATCH/PUT | `/api/mobile/users/me/identity` | 个人资料（含国籍等敏感字段） |
| GET | `/api/mobile/users/me/identity/options` | 国籍 / 常住地区 / 语言选项包 |
| GET | `/api/mobile/users/me/identity/nationalities?q=` | 国籍搜索 |
| GET | `/api/mobile/users/me/identity/residency-regions?countryCode=` | 常住地区（可按国过滤） |
| GET/PATCH | `/api/mobile/users/me/travel-portrait` | 旅行画像 |
| GET/PATCH | `/api/mobile/users/me/driver-profile` | 驾驶员资料（无评分） |
| GET | `/api/mobile/users/me/driver-profile/summary` | 状态卡 |
| GET/POST | `/api/mobile/users/me/documents` | 证件列表 / 上传 |
| GET/DELETE | `/api/mobile/users/me/documents/{documentId}` | 本人查看（签名 URL）/ 删除 |
| GET | `/api/mobile/trips/{tripId}/members/{memberId}/credential-status` | 组织者只读完成态 |

已有保持：`/api/users/me`、`/api/users/me/avatar`、emergency-contacts、fitness、contact。

---

## identity

> **完整字段级契约、Swift 模型、DoD**：见 [`IDENTITY_IOS_HANDOFF.md`](./IDENTITY_IOS_HANDOFF.md)。

### GET `/api/mobile/users/me/identity`

返回 `displayName` / `avatarUrl` / `email`（来自 User）+ `phone` / `legalFullName` / `dateOfBirth` / `nationality`（含 `nationalityLabelZh/En`）/ `residencyRegion`（含 label）/ `preferredLanguage` / `visibility`。

`visibility.*`：`self_only` \| `organizer` \| `team`（默认敏感字段 `self_only`）。

旧 Web 写入的 `preferences.nationality` / `residencyCountry` 会作为 fallback 读出。

### PATCH/PUT `/api/mobile/users/me/identity`

部分更新。保存 `nationality` 时**双写**到 `preferences.nationality`（Admin / 准备度可读）。  
昵称/头像也可继续走 `PUT /api/users/me` / `POST /api/users/me/avatar`。

**不要**再用 `PUT /api/users/profile` 写国籍（iOS-only 路径以 identity 为准）。

---

## travel-portrait

跨行程默认值；创建冰岛自驾时投影到 `driving-settings`。

字段分组：`pace` / `accessibility` / `drivingDefaults` / `fitnessProfileRef`（仅指针，体能仍用 `/api/v1/fitness/*`）。

枚举：

| 字段 | 取值 |
|------|------|
| `travelPace` | `relaxed` \| `balanced` \| `packed` |
| `restFrequency` | `low` \| `normal` \| `high` |
| `mobilityLimitation` | `none` \| `mild` \| `moderate` \| `severe` |
| `nightDrivingAcceptance` | `ok` \| `limited` \| `avoid` |
| `gravelAcceptance` | `low` \| `moderate` \| `high` |
| `priority` | `safety` \| `experience` |

---

## driver-profile

**禁止**返回驾驶评分。

### GET/PATCH `/api/mobile/users/me/driver-profile`

`qualification` / `experience` / `longTermPrefs`。

### GET `/api/mobile/users/me/driver-profile/summary`

```json
{
  "qualificationStatus": "valid",
  "licenseExpiresOn": "2028-06-20",
  "experienceYears": 7,
  "snowLabel": "一般",
  "nightDrivingLabel": "尽量避免",
  "completionRatio": 0.6
}
```

`qualificationStatus`：`incomplete` \| `valid` \| `expiring_soon` \| `expired`。

---

## documents

隐私：仅本人可读原图/号码；列表不含完整证件号（最多 `numberLast4`）。

`type`：`drivers_license` \| `international_permit` \| `license_translation` \| `passport` \| `visa` \| `travel_insurance` \| `medical_note`

### POST multipart

| 字段 | 说明 |
|------|------|
| `type` | 证件类型 |
| `file` | ≤ 10MB；jpeg/png/webp/pdf |
| `expiresOn` | 可选 `YYYY-MM-DD` |
| `notes` | 可选 |

GET 详情含 `signedUrl`（TTL ≤ 10 分钟）。**禁止**写入行程公开 payload。

### 组织者：`GET /api/mobile/trips/{tripId}/members/{memberId}/credential-status`

仅 OWNER/EDITOR。只返回 `type` + `status`（无图无号）。  
`additional_driver_registration` 从行程 `driving-settings.drivers` 投影。

---

## 创建行程默认投影

服务端在 `POST /api/iceland-self-drive/trips` 时读取创建者 `travel-portrait` + `driver-profile`，写入初始：

- `members`（儿童/老人/晕车）
- `routePreference`（pace / rest / gravel / night / F-road / 日驾时长）
- `drivers.dailyDrivingLimitHours`

不自动写 `isSelected` / `role`。GET `driving-settings` 时对 candidates 的 null 经验字段用用户级默认填充（不覆盖已有行程值）。

---

## 错误码

| code | 场景 |
|------|------|
| `VALIDATION_ERROR` | 枚举/日期非法 |
| `FORBIDDEN` | 非组织者读 credential-status / 他人证件 |
| `PAYLOAD_TOO_LARGE` | 证件 > 10MB |
| `UNSUPPORTED_MEDIA_TYPE` | MIME 不允许 |
| `NOT_FOUND` | 证件不存在 |
| `UNAUTHORIZED` | 未登录 |

---

## iOS 调用节奏

```
个人中心 → GET users/me + GET driver-profile/summary
个人资料 → GET identity + emergency-contacts
旅行画像 → GET travel-portrait + GET /api/v1/fitness/profile
驾驶员   → GET driver-profile + summary
证件库   → GET documents；上传 POST documents
```
