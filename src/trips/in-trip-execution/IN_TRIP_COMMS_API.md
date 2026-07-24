# 行中团队对讲（In-Trip Comms）— 后端接口建议（P2）

> **优先级：** P2 起，**非 MVP / Execute 阻塞**  
> **Global prefix：** `/api`  
> **响应格式：** `{ success: boolean, data?: T, error?: { code, message } }`  
> **鉴权：** 生产 Bearer Token + 行程成员；开发 `anonymous-dev-user`  
> **前置：** `IN_TRIP_EXECUTION_ENABLED=true`，行程 `TRAVELING`（与 execution-advisory / pulse 一致）  
> **Swagger Tag（建议）：** `trip-in-trip-comms`

---

## 0. 与现有模块关系

| 能力 | 已有参考 | 本模块定位 |
|------|----------|------------|
| 离线写队列 | `POST .../in-trip/offline/sync`（`clientSeq` 幂等） | 消息同步复用相同「客户端序号 + 服务端去重」思路 |
| 拆队位置 | `POST .../split/sessions/:id/location` | 全团 peers 位置独立通道，不绑定 split session |
| 语音 STT | `POST .../wish/voice/transcribe`（Whisper/Mock） | transcribe 复用 `VoiceService`，不落愿望草稿 |
| Execute 导航 | `GET /trips/:id/state` → `nextStop` 坐标 | peers 距离以**当前用户位置**或 **nextStop** 为参照 |

**实现状态：** P2.0 + **P2.2** 已落地（sync / history / peers / heartbeat / **transcribe** / **summary**）。P2.1 WebSocket 待实现。

**Migration：**

```bash
npx prisma db execute --schema prisma/schema.prisma \
  --file prisma/migrations/add_in_trip_comms.sql
npx prisma generate
```

**联调：** `npm run test:in-trip-comms`

### 0.1 真机蓝牙对讲 vs 后端边界（套壳 MVP）

**原则：后端 P2 只做有网后的 `comms/sync`（及 peers/history），不挡 Capacitor 套壳真机验证。** 近场按住对讲（PTT）走原生/BLE，与 REST 解耦。

| 层级 | 职责 | 套壳 MVP 是否依赖后端 |
|------|------|------------------------|
| **Capacitor / 原生** | BLE 扫描、连接、PTT 音频、后台保活 | **否** — 可离线双机验证 |
| **本地队列** | 文字消息 IndexedDB + `clientId` / `clientSeq` | **否** |
| **后端 REST（P2.0）** | 有网 `POST comms/sync`、换机 `GET comms`、距离 `peers` | **否** — 联机增强，非阻塞 |

```
┌─────────────────────────────────────────────────────────────┐
│  真机 PTT（近场，无网可用）                                      │
│  BLE Central 扫描 → 连接 → 写入 / 音频流（不走 JSON 大包）        │
└──────────────────────────┬──────────────────────────────────┘
                           │ 仅文字、元数据（可选）
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  本地队列（IndexedDB）→ 有网后 POST .../comms/sync              │
└─────────────────────────────────────────────────────────────┘
```

**当前 Capacitor 已有：** BLE **Central**（扫描 + 连接写入）。

**完整「按住对讲」还需（原生 / 插件，后端不参与）：**

| 缺口 | 建议方案 |
|------|----------|
| **GATT Peripheral 广播**（本机可被扫到） | 自定义 Capacitor 插件；或 iOS **MultipeerConnectivity** / Android **Nearby Connections** |
| **语音不走 JSON** | BLE 层大包分片；或 **蓝牙只传音频、文字仍走 BLE 小 characteristic**；`comms/sync` 的 `body` 仅同步转写/文本，**禁止**把原始 PCM/base64 塞进 sync JSON |
| **后台 PTT** | Android **Foreground Service** + 通知；iOS **AVAudioSession**（`playAndRecord` + background mode） |

**套壳 MVP 验证路径（无需等 transcribe / summary / WebSocket）：**

1. 双机 BLE Central ↔ 对端 Peripheral（或 Multipeer）通短文本 / 音频帧  
2. App 内文字入本地队列，`IN_TRIP_COMMS_ENABLED` 关闭时 UI 仍可用  
3. 有网且后端就绪时，再 `POST comms/sync` 与 Web 端对齐历史  

**后端刻意不做：** BLE GATT 服务、音频流中继、PTT 信令 WebSocket（P2.1 仅可选优化，非套壳前置）。

---

## 1. 共享类型

```typescript
/** 客户端生成 UUID，用于离线幂等；服务端分配 messageId */
interface IntercomMessage {
  /** 服务端 ID；客户端首发可为空，sync 响应回填 */
  id?: string;
  /** 客户端本地 ID，sync 去重键（必填） */
  clientId: string;
  tripId: string;
  senderId: string;
  senderDisplayName?: string;
  /** 单调递增，同 trip 内排序；客户端维护，服务端校验 gap */
  clientSeq: number;
  type: 'text' | 'voice' | 'location_pin' | 'system';
  /** 文本内容；voice 可为转写后的 text 或占位「[语音 12s]」 */
  body: string;
  /** voice 专用 */
  audio?: {
    url?: string;
    durationSec?: number;
    mimeType?: string;
    transcriptId?: string;
  };
  /** location_pin 专用 */
  location?: { lat: number; lng: number; label?: string };
  createdAt: string; // ISO 8601，客户端时钟；服务端可校正为 serverCreatedAt
  serverCreatedAt?: string;
  /** 已读水位（可选，P2.1） */
  readBy?: string[];
  metadata?: Record<string, unknown>;
}

interface IntercomPeer {
  userId: string;
  displayName?: string;
  /** 相对「我」或大部队锚点的距离；无法计算时为 null */
  distanceMeters: number | null;
  lastSeenAt: string; // ISO 8601
  connection: 'online' | 'offline';
  /** 可选：最近一次上报坐标（组织者/共享位置开关开启时） */
  lastLocation?: { lat: number; lng: number; accuracyMeters?: number };
}

interface CommsSummary {
  tripId: string;
  generatedAt: string;
  /** 覆盖窗口，默认最近 24h 或 since 参数 */
  windowStart: string;
  windowEnd: string;
  bullets: string[];
  /** 可选：引用的 messageId 列表，供 UI 跳转 */
  sourceMessageIds?: string[];
}
```

---

## 2. 消息同步（有网后）

### `POST /api/trips/:tripId/in-trip/comms/sync`

**场景：** App 从离线恢复、或定时批量上行；与 `offline/sync` 并列，**不混入** `record_transaction` 等操作类型。

**请求体：**

```json
{
  "messages": [
    {
      "clientId": "550e8400-e29b-41d4-a716-446655440000",
      "clientSeq": 42,
      "type": "text",
      "body": "我在停车场 B，你们到哪了？",
      "createdAt": "2026-07-16T11:05:00.000Z"
    },
    {
      "clientId": "660e8400-e29b-41d4-a716-446655440001",
      "clientSeq": 43,
      "type": "voice",
      "body": "[语音 8s]",
      "audio": {
        "durationSec": 8,
        "transcriptId": "vt_abc123"
      },
      "createdAt": "2026-07-16T11:06:12.000Z"
    }
  ],
  "lastKnownServerSeq": 120
}
```

| 字段 | 说明 |
|------|------|
| `messages` | 按 `clientSeq` 升序；服务端已见过的 `clientId` 跳过写入 |
| `lastKnownServerSeq` | 可选；客户端已收服务端最大序号，用于增量下发 |

**响应 `data`：**

```json
{
  "syncedIds": ["550e8400-e29b-41d4-a716-446655440000", "660e8400-e29b-41d4-a716-446655440001"],
  "serverMessages": [
    {
      "id": "msg_srv_121",
      "clientId": "770e8400-e29b-41d4-a716-446655440002",
      "tripId": "1ae5cd8b-84ba-457d-9e0b-50ac3813a104",
      "senderId": "user-b",
      "senderDisplayName": "小王",
      "clientSeq": 15,
      "type": "text",
      "body": "还有 5 分钟到",
      "createdAt": "2026-07-16T11:07:00.000Z",
      "serverCreatedAt": "2026-07-16T11:07:01.200Z"
    }
  ],
  "latestServerSeq": 121,
  "syncedAt": "2026-07-16T11:07:30.000Z"
}
```

**语义：**

1. **幂等：** `(tripId, senderId, clientId)` 唯一；重复 sync 返回相同 `id` 进 `syncedIds`
2. **下行增量：** `serverMessages` = 他人消息且 `serverSeq > lastKnownServerSeq`（或 `since` 等价）
3. **冲突：** `clientSeq` 乱序不拒收，但响应可带 `warnings: [{ clientId, code: 'SEQ_GAP' }]`
4. **离线队列：** 客户端本地 IndexedDB 队列结构与 `IntercomMessage` 相同，联网后整批 POST

**错误码：**

| code | HTTP | 说明 |
|------|------|------|
| `COMMS_NOT_IN_TRIP` | 400 | 非 TRAVELING |
| `COMMS_NOT_MEMBER` | 403 | 非行程成员 |
| `COMMS_PAYLOAD_TOO_LARGE` | 413 | 单次 messages > 50 或 body > 4KB |
| `COMMS_EXECUTION_DISABLED` | 503 | 模块未启用 |

---

## 3. 拉取历史（换机 / 迟到加入）

### `GET /api/trips/:tripId/in-trip/comms`

**Query：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `since` | 否 | ISO 8601 或 `serverSeq` 数字；默认行程进入 TRAVELING 时刻 |
| `limit` | 否 | 默认 `50`，最大 `200` |
| `before` | 否 | 分页游标（上一页最小 `serverCreatedAt` 或 `serverSeq`） |

**示例：**

```
GET /api/trips/:tripId/in-trip/comms?since=2026-07-16T00:00:00.000Z&limit=50
GET /api/trips/:tripId/in-trip/comms?since=120&limit=50
```

**响应 `data`：**

```json
{
  "messages": [ "/* IntercomMessage[]，按 serverCreatedAt 升序 */" ],
  "latestServerSeq": 121,
  "hasMore": false,
  "nextBefore": null
}
```

**客户端策略：**

- 冷启动：`GET comms` 全量最近 N 条 → 本地持久化 → 之后靠 `sync` 增量
- 换机：带 `since=上次同步的 latestServerSeq` 或最后一条 `serverCreatedAt`
- 轮询兜底（无 WebSocket）：每 `runtime-policy.syncIntervalMinutes` 调 `sync` 或 `GET comms?since=...`

---

## 4. 成员位置（距离展示）

### 方案 A（推荐 P2 首发）：REST 轮询

#### `GET /api/trips/:tripId/in-trip/comms/peers`

**Query（可选）：**

| 参数 | 说明 |
|------|------|
| `refLat`, `refLng` | 距离参照点；缺省用服务端记录的「我」的最后位置 |
| `staleAfterSec` | 超过此秒数未心跳视为 `offline`，默认 `120` |

**响应 `data`：**

```json
{
  "peers": [
    {
      "userId": "user-a",
      "displayName": "我",
      "distanceMeters": 0,
      "lastSeenAt": "2026-07-16T11:10:00.000Z",
      "connection": "online"
    },
    {
      "userId": "user-b",
      "displayName": "小王",
      "distanceMeters": 850,
      "lastSeenAt": "2026-07-16T11:09:45.000Z",
      "connection": "online",
      "lastLocation": { "lat": 63.881, "lng": -22.448, "accuracyMeters": 12 }
    }
  ],
  "referencePoint": { "lat": 63.8804, "lng": -22.4495, "source": "self" },
  "asOf": "2026-07-16T11:10:05.000Z"
}
```

`referencePoint.source` 枚举：`self` | `next_stop` | `explicit`（来自 query）

**距离计算：** Haversine；Execute 页可传 `refLat/refLng` = `state.nextStop.Place` 展示「距下一站」。

#### `POST /api/trips/:tripId/in-trip/comms/peers/heartbeat`

**请求体：**

```json
{
  "lat": 63.8804,
  "lng": -22.4495,
  "accuracyMeters": 8,
  "clientTimestamp": "2026-07-16T11:10:00.000Z",
  "shareLocation": true
}
```

| 字段 | 说明 |
|------|------|
| `shareLocation` | `false` 时仅更新 `lastSeenAt`，不下发坐标给其他成员 |

**响应：** `{ accepted: true, ttlSec: 120 }`

**频率：** 建议 30–60s；省电模式跟随 `runtime-policy.lowPowerMode` 拉长间隔。

---

### 方案 B（P2.1 / 可选）：WebSocket

```
WS /api/trips/:tripId/in-trip/comms/ws
```

| 方向 | 事件 | 载荷 |
|------|------|------|
| C→S | `heartbeat` | `{ lat, lng, accuracyMeters }` |
| C→S | `message` | `{ clientId, type, body, ... }`（等价 sync 单条） |
| S→C | `message` | `IntercomMessage` |
| S→C | `peer_update` | `{ userId, distanceMeters, connection, lastSeenAt }` |

**说明：** REST `sync` + `GET peers` 为必达基线；WebSocket 为同域推送优化，断线回退轮询。

**隐私：** 设置项 `metadata.commsShareLocation`（用户级或行程级）；默认仅 TRAVELING 且 opt-in 后上报精确坐标。

---

## 5. 语音转写（可选）

### `POST /api/trips/:tripId/in-trip/comms/transcribe`

**Content-Type：** `multipart/form-data`

| 字段 | 必填 | 说明 |
|------|------|------|
| `audio` | 是 | 二进制；max 10MB |
| `language` | 否 | `zh-CN` / `en` / `is`，透传 Whisper |
| `format` | 否 | `audio/webm`、`audio/mp4` 等 |
| `clientId` | 否 | 预关联即将 sync 的 voice 消息 |

**响应 `data`：**

```json
{
  "transcriptId": "vt_abc123",
  "transcript": "我们在蓝湖停车场等你们",
  "durationSec": 8.2,
  "language": "zh",
  "confidence": 0.91
}
```

**流程：**

1. 录完 → `transcribe` → 用户可编辑 `transcript`
2. 构造 `IntercomMessage`（`type: voice`, `body: transcript`, `audio.transcriptId`）
3. 离线则入本地队列，有网 `sync`

**实现复用：** `VoiceService.transcribe`（与 `POST .../wish/voice/transcribe` 相同 STT 栈）；**不**自动生成愿望草稿。

**错误码：** `TRANSCRIBE_AUDIO_MISSING` | `TRANSCRIBE_UNSUPPORTED_FORMAT` | `TRANSCRIBE_PROVIDER_UNAVAILABLE`

---

## 6. AI 摘要（可选）

### `GET /api/trips/:tripId/in-trip/comms/summary`

**Query：**

| 参数 | 默认 | 说明 |
|------|------|------|
| `since` | 24h 前 | 摘要窗口起点 |
| `maxBullets` | `5` | 最多条数 |
| `lang` | `zh` | 输出语言 |

**响应 `data`：**

```json
{
  "tripId": "1ae5cd8b-84ba-457d-9e0b-50ac3813a104",
  "generatedAt": "2026-07-16T20:00:00.000Z",
  "windowStart": "2026-07-15T20:00:00.000Z",
  "windowEnd": "2026-07-16T20:00:00.000Z",
  "bullets": [
    "11:05 团队约定在停车场 B 汇合",
    "14:20 小王报告因侧风改走 1 号公路",
    "16:00 全员到达哈尔格林姆斯教堂"
  ],
  "sourceMessageIds": ["msg_srv_121", "msg_srv_128", "msg_srv_135"]
}
```

**缓存：** 服务端按 `(tripId, windowEnd 整点)` 缓存 15min；新消息 sync 后可 `Cache-Control: max-age=0` 强制刷新。

**降级：** LLM 不可用时返回 `{ bullets: [], degraded: true, reason: 'SUMMARY_PROVIDER_UNAVAILABLE' }`，HTTP 200。

---

## 7. 建议存储（实现参考）

```sql
-- P2 migration 草案
CREATE TABLE trip_in_trip_comms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  client_seq BIGINT NOT NULL,
  server_seq BIGSERIAL,
  message_type VARCHAR(16) NOT NULL,
  body TEXT NOT NULL,
  payload JSONB,
  client_created_at TIMESTAMPTZ NOT NULL,
  server_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, sender_id, client_id)
);

CREATE INDEX idx_comms_trip_server_seq ON trip_in_trip_comms_messages(trip_id, server_seq);

CREATE TABLE trip_in_trip_comms_peer_presence (
  trip_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  accuracy_meters REAL,
  share_location BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
```

---

## 8. 前端集成顺序（建议）

### 8.1 有网 Web / 混合 App（REST）

```
进入 Execute / 对讲 Tab
  → GET comms?limit=50（历史）
  → POST peers/heartbeat（若已授权定位）
  → 定时：POST comms/sync（含待发 messages + lastKnownServerSeq）
  → 定时：GET comms/peers（距离 UI）
发语音（云端路径，可选）
  → POST comms/transcribe → 编辑 → 入队 → sync
行末 / 组织者视图
  → GET comms/summary
```

### 8.2 真机套壳（BLE PTT + 可选 sync）

```
按住 PTT
  → 原生插件：音频 / 短信令走 BLE（非 JSON 大包）
  → 松手后：文字摘要或本地 STT 结果写入 IndexedDB（type: text | voice + body 占位）
无网
  → 仅 BLE + 本地队列；不调用后端
有网
  → POST comms/sync（只传 IntercomMessage 文本字段，不传原始音频）
换机 / Web 查看
  → GET comms?since=
```

**`voice` 类型约定：** sync 时 `body` 为转写或 `[语音 Ns]` 占位；`audio.url` 仅在有 OSS/CDN 上传链路时使用，**PTT 近场路径不得依赖后端收音频。**

---

## 9. 与 Execute 阶段文档交叉引用

- MVP 接入：[`EXECUTE_PHASE_FRONTEND_HANDOFF.md`](../trip-constraint-solver/EXECUTE_PHASE_FRONTEND_HANDOFF.md)
- 离线同步模式：[`OFFLINE_BETA_API.md`](./OFFLINE_BETA_API.md) §三
- 拆队位置（勿混用）：[`GROUP_PULSE_SPLIT_API.md`](./GROUP_PULSE_SPLIT_API.md) §三

---

## 10. 分期建议

| 阶段 | 范围 | 套壳 MVP |
|------|------|----------|
| **P2.0** ✅ | `sync` + `GET comms` + `peers` REST + `heartbeat` | **不阻塞** — BLE 可先行 |
| **P2.1** | WebSocket、`readBy` 已读水位 | 可选 |
| **P2.2** ✅ | `transcribe` + `summary`（云端 STT/摘要） | 可选；与 BLE 音频路径独立 |
| **原生** | Peripheral / Multipeer、音频分片、后台 PTT | **Capacitor 插件**；后端无接口 |

**开关（建议）：** `IN_TRIP_COMMS_ENABLED=true`（独立于 execution-advisory，默认可随 `IN_TRIP_EXECUTION_ENABLED` 一并开启）。套壳真机联调可设 `IN_TRIP_COMMS_ENABLED=false`，仅验证 BLE。
