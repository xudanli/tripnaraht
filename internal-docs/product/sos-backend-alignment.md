# SOS 后端对齐 — iOS × Backend SSOT

> **最后更新：** 2026-07-09  
> **联调文档：** [`src/auth/EXECUTE_NATIVE_API.md`](../../src/auth/EXECUTE_NATIVE_API.md) §7.6  
> **实现代码：** `src/mobile/` + `src/trips/services/trip-emergency.service.ts`

---

## 优先级排期

### P0 — 联调 SOS 主链路（本周）

| 项 | 状态 | 说明 |
|---|---|---|
| `POST .../emergency/sos` 契约 | ✅ | type 枚举、`location` 可选、响应含 `sosId` + `contextVersion` |
| Idempotency-Key 重放 | ✅ | 相同 key 返回 `replay: true` |
| SOS 副作用 | ✅ | 通知领队、`attention-queue` type=sos、WS `trip_context_changed` |
| notifications `risk_alert` / `location_update` | ✅ | 类型校验；`includeLocation=true` 时附坐标 |
| type 枚举定稿 | ⚠️ TBD | 见下文「Type 枚举」 |

### P1 — SOS 页面完整能力

| 接口 | 状态 |
|---|---|
| `GET/PUT /api/mobile/users/me/emergency-contacts` | ✅ |
| `GET /api/mobile/trips/{tripId}/emergency-pack` | ✅ |
| `GET /api/mobile/trips/{tripId}/emergency/local-numbers` | ✅ |
| team-status / overview 反映 SOS 成员 | 🔶 部分（team-status 标记 SOS 发起者） |
| SOS → 紧急联系人 | 🔶 已记录 `notifiedEmergencyContacts`（短信待接入） |
| APNs push tokens + 事件推送 | ✅（`MOBILE_APNS_ENABLED` 控制真实发送） |

### P2 — 完整 SOS 生命周期

| 接口 | 状态 |
|---|---|
| `GET .../emergency/sos/active` + `context-snapshot.execution.activeSOS` | ✅ |
| `POST .../emergency/sos/{sosId}/acknowledge`（领队确认） | ✅ |
| `POST .../emergency/sos/{sosId}/resolve` | ✅ |
| `POST/DELETE .../emergency/location-share` | ✅（10s presence 约定） |

---

## Type 枚举

### 后端定稿（P0 实现）

```
medical | lost | accident | vehicle | weather | other
```

| 值 | 中文 | iOS 候选 A | iOS 候选 B |
|---|---|---|---|
| `medical` | 医疗求助 | `injury` | `medical` |
| `lost` | 迷路/失联 | `lost` | `lost` |
| `accident` | 意外受伤 | — | `accident` |
| `vehicle` | 车辆故障 | `vehicle` | — |
| `weather` | 极端天气 | `weather` | — |
| `other` | 其他 | `other` | `other` |

**iOS 映射占位（待后端确认后启用）：**

```swift
// TODO: align when backend confirms enum
enum SOSType: String {
    case medical, lost, accident, vehicle, weather, other
}
```

缺省：请求未传 `type` 时后端默认为 `other`。

---

## 已有接口

### POST `/api/mobile/trips/{tripId}/emergency/sos`

**请求体：**

```json
{
  "type": "medical",
  "location": { "lat": 64.66, "lng": -20.91 },
  "message": "需要医疗协助",
  "shareWithTeam": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | enum | 否 | `medical/lost/accident/vehicle/weather/other`，默认 `other` |
| location | `{ lat, lng }` | 否 | 可为 null / 省略（无 GPS 场景） |
| message | string | 否 | 补充说明 |
| shareWithTeam | boolean | 否 | 默认 `true`；`false` 仅上报后台 |

**响应 `data`：**

```json
{
  "contextVersion": 300012348,
  "sos": {
    "sosId": "uuid",
    "tripId": "trip-uuid",
    "type": "medical",
    "status": "open",
    "location": { "lat": 64.66, "lng": -20.91 },
    "coordinates": { "latitude": 64.66, "longitude": -20.91 },
    "sentAt": "2026-07-08T12:00:00.000Z",
    "message": "需要医疗协助"
  },
  "replay": false
}
```

**SOS 触发副作用（P0）：**

| 通道 | 实现 |
|---|---|
| 通知领队 | ✅ `risk_alert` 写入 `mobileExecution.notifications`，recipientIds = OWNER/EDITOR |
| attention-queue | ✅ `type=sos`，severity=critical，来自 `trip.metadata.lastEmergencySOS` |
| WS push | ✅ `trip_context_changed`，sections: execution/risks/team/notifications |
| 紧急联系人短信 | ❌ P1（需 emergency-contacts API） |
| APNs | ❌ 待推送通道接入 |

---

## 新增接口（P1/P2 规格）

### P1 — 紧急联系人 CRUD

```
GET  /api/mobile/users/me/emergency-contacts
PUT  /api/mobile/users/me/emergency-contacts
```

```json
{
  "contacts": [
    {
      "id": "ec_1",
      "name": "张三",
      "phone": "+86 138xxxx",
      "relationship": "spouse",
      "notifyOnSOS": true,
      "authorized": true
    }
  ]
}
```

备选：扩展现有 `PUT /api/users/profile` → `preferences.other.emergencyContacts`（iOS 目前未解码，独立接口更清晰）。

### P1 — 行程应急资料包（只读）

```
GET /api/mobile/trips/{tripId}/emergency-pack
```

```json
{
  "tripId": "...",
  "tripName": "...",
  "memberCount": 4,
  "leader": { "id": "...", "name": "...", "phone": "..." },
  "medicalNotes": "过敏：青霉素",
  "vehicleInfo": { "plate": "...", "model": "...", "color": "..." },
  "offlinePackAvailable": true,
  "offlinePackVersion": "2026-07-08",
  "localEmergencyNumber": "112"
}
```

### P1 — 目的地当地紧急号码（可选独立）

```
GET /api/mobile/trips/{tripId}/emergency/local-numbers
```

```json
{
  "countryCode": "IS",
  "primary": "112",
  "police": "4441000",
  "ambulance": "112",
  "displayHint": "冰岛统一紧急号码 112"
}
```

### P2 — 活跃 SOS 状态

```
GET /api/mobile/trips/{tripId}/emergency/sos/active
```

或推荐：`context-snapshot.execution.activeSOS` 块（iOS 少一次请求）。

```json
{
  "active": true,
  "sos": {
    "sosId": "sos_xxx",
    "type": "injury",
    "message": "...",
    "location": { "lat": 64.66, "lng": -20.91 },
    "createdAt": "2026-07-08T12:00:00Z",
    "status": "open",
    "acknowledgedBy": { "memberId": "...", "name": "..." }
  }
}
```

### P2 — 解除 / 误触取消

```
POST /api/mobile/trips/{tripId}/emergency/sos/{sosId}/resolve
```

```json
{
  "reason": "false_alarm",
  "comment": "已找到队伍，安全"
}
```

`reason`: `false_alarm` | `resolved` | `cancelled`

---

## 不需要后端新接口

| 能力 | 说明 |
|---|---|
| 蓝牙离线广播 | 客户端 Mesh；恢复网络后走 POST SOS + Outbox |
| Outbox 重放 | 纯 iOS；后端 Idempotency-Key 已支持 |
| 系统拨号 | iOS `tel://`；需 P1 local-numbers 或静态配置 |
| 长按 3 秒 UI | 纯客户端 |

---

## 后端确认模板

**tripId 样例：** `___________________________`

### §已有接口

- [x] `POST .../emergency/sos` 已部署且可联调
- [ ] type 枚举最终版确认：`medical/lost/accident/vehicle/weather/other`
- [x] location 可为 null
- [x] 响应含 contextVersion + sos.sosId + Idempotency-Key 重放
- [x] SOS 触发：通知领队 [Y] 紧急联系人 [Y*] attention-queue [Y] WS [Y] APNs [Y†]

> *紧急联系人：已记录 `notifiedEmergencyContacts`；短信待通道接入。  
> †APNs：需 iOS 注册 `POST .../push-tokens` + 服务端 `MOBILE_APNS_ENABLED=true`。

### §已有接口扩展

- [x] notifications 支持 `risk_alert` / `location_update`
- [x] `includeLocation=true` 时服务端附坐标
- [x] attention-queue 支持 `type=sos`

### §新增接口（请勾选范围）

- [x] P1 GET/PUT `/users/me/emergency-contacts`
- [x] P1 GET `/trips/{id}/emergency-pack`
- [x] P1 GET `/trips/{id}/emergency/local-numbers`
- [x] P2 GET `/trips/{id}/emergency/sos/active` OR `snapshot.execution.activeSOS`
- [x] P2 POST `/trips/{id}/emergency/sos/{id}/resolve`
- [x] P2 POST/DELETE `/trips/{id}/emergency/location-share`（10s presence + `mode=emergency`）

**阻塞项：** ___________  
**预计可联调日期：** ___________

---

## iOS 侧下一步

1. 等后端确认 type 枚举 → 改 iOS 映射表
2. 若后端选 `context-snapshot.activeSOS` → 接读模型并在 SOS 页展示状态
3. P0 联调：Outbox + Idempotency-Key + POST SOS + WS 刷新
4. 登录后 `POST .../push-tokens` 注册 device token；点开 push 用 `tripId` + `contextVersion` 跳转行程

---

## APNs 真机验证清单

### iOS / Xcode

- [ ] **Push Notifications** capability 已开启
- [ ] Bundle ID 与后端 `APNS_BUNDLE_ID` 完全一致
- [ ] Debug 包使用 Development provisioning（走 sandbox APNs）

### 后端环境（Debug 真机）

```bash
MOBILE_APNS_ENABLED=true
APNS_USE_SANDBOX=true          # Debug 必须 true；TestFlight/App Store 设 false
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_BUNDLE_ID=com.your.app    # 与 Xcode 一致
APNS_KEY_PATH=/path/to/AuthKey_XXXX.p8
```

### 联调步骤

| # | 操作 | 预期 |
|---|------|------|
| 1 | 真机登录 App | — |
| 2 | `POST /api/mobile/users/me/push-tokens` | `{ "success": true, "data": { "registered": true } }` |
| 3 | 另一账号（领队）对该行程 **POST SOS** | 发起者设备或领队设备收到锁屏/横幅推送 |
| 4 | **POST notifications** `type=risk_alert` | 接收方收到推送，`eventType=risk_alert` |
| 5 | 点开推送 | 进入对应 `tripId` 行程页；`contextVersion` 过期则拉 snapshot |

### Payload 抽检（Xcode / 后端日志）

```json
{
  "tripId": "<uuid>",
  "contextVersion": 300012346,
  "eventType": "sos",
  "changedSections": ["execution", "risks", "team"]
}
```

### 未启用 APNs 时

`MOBILE_APNS_ENABLED!=true` → 后端仅 **dry-run 日志**（`[APNs dry-run]`），真机不会收到推送；联调前务必打开。
