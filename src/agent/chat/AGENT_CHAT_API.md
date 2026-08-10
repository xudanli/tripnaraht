# Agent Chat API（会话 / 消息骨架）

> **Status:** SKELETON — Prisma + HTTP + in-process SSE  
> **执行引擎：** 仍为 `route_and_run`；本层负责会话、落库、权限与事件  
> **迁移：** `prisma/migrations/20260726170000_agent_conversations/`

## Endpoints（前缀 `/api/agent/chat`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/me/conversations` | 个人抽屉（PERSONAL） |
| GET | `/trips/:tripId/conversations` | 团队主线程（通常 1 条） |
| POST | `/conversations` | 创建 PERSONAL / 确保 TRIP_SHARED |
| POST | `/trips/:tripId/conversations/ensure-shared` | 确保团队主线程 |
| GET | `/conversations/:id/messages?cursor=&limit=` | 分页消息 |
| POST | `/conversations/:id/messages` | body 优先 `{ "message": "..." }`；亦接受 `text` / `content` / `body` / `prompt` / `query` / `user_message` / `userMessage`（可嵌在 `data`/`payload`）→ route_and_run |
| POST | `/conversations/:id/messages/attach-async` | async SUCCESS 落库 |
| POST | `/conversations/:id/confirm` | **Abu 协商**确认（角色门控）；**不是**改排「确认写入」 |
| POST | `/conversations/:id/apply-itinerary-draft` | **改排草案确认写入**（角色门控；内部 `apply_itinerary_adjust_draft`） |
| GET | `/conversations/:id/events` | SSE 事件流 |

鉴权：`Authorization: Bearer`（需登录用户）。

## 策略

| 规则 | 行为 |
|------|------|
| PERSONAL | 默认 `execution_mode=ADVICE_ONLY`；**禁止** confirm / apply-itinerary-draft 写共享行程 |
| TRIP_SHARED | 默认 ADVICE_ONLY；Confirm / Apply 仅 OWNER/ORGANIZER/DRIVER |
| FLAWED_DRAFT | `delivery_verdict=FLAWED_DRAFT` 时不出可写 CTA，Apply 返回 `403 FLAWED_DRAFT_FORBIDDEN` |
| 请求 | `meta.conversation_id` + 服务端组装 `recent_messages`；有 `trip_id` 时自动设 `context_type=active_trip_summary` |
| 统一渲染 | `summary_json.conversation_turn_result` 为领域 SSOT；旧卡双写兼容（见 FRONTEND_CONVERSATION_TURN_RESULT.md） |
| 短确认 | 助手刚邀「筛选霍芬可订房」等时，用户回「需要/好的/可以/OK」会在 route_and_run 前扩成显式酒店库存检索句（落库仍保留原文） |

## 改排「确认写入」契约（前端接 CTA）

**不要**用 `decision_consent` / `/confirm` 做改排落库：前者是认知授权，后者是 Abu 协商。Chat 改排永远 `ADVICE_ONLY`，AUTO 不会静默写库。

### 何时可写

看草案消息上的 `summary_json.itinerary_adjust_result`：

| 条件 | 含义 |
|------|------|
| `apply_gate.can_apply === true` | 可画「确认写入」 |
| 存在 `primary_action.action === 'apply_itinerary_adjust'` | 同源信号；点后调 Apply API |
| `result_status` | 草案轮通常为 `OK`（**不是** `NEED_CONSENT`；避免与认知卡混淆） |
| `delivery_verdict` | `VERIFIED` / 非 `FLAWED_DRAFT` 才可写；`FLAWED_DRAFT` → `apply_gate.deny_reason=flawed_draft` |
| `applied === true` / `deny_reason=already_applied` | 已写入，勿再画 CTA |
| PERSONAL / 无草案 items | `can_apply=false` |

### 怎么写

```http
POST /api/agent/chat/conversations/:id/apply-itinerary-draft
Authorization: Bearer …
Content-Type: application/json

{
  "message_id": "<草案 ASSISTANT 消息 id，可选>",
  "draft_id": "<卡片 draft_id / primary_action.params.idempotency_key>",
  "idempotency_key": "<默认=draft_id>",
  "durable_trip_run_id": "<可选，卡片已带>",
  "apply_snapshot": { "target_date_iso": "2026-08-20", "apply_mode": "replace_day", "items": [/* 可选覆盖 */] }
}
```

服务端：角色门控 → `route_and_run({ options: { apply_itinerary_adjust_draft: true, itinerary_adjust_draft_snapshot, durable_trip_run_id, async_mode: 'OFF' } })` → 落库 ASSISTANT 回执。

过渡期也可直接打 `POST /api/agent/route_and_run` 带同样 options（无 chat 角色门控时请自行校验）。

### 写什么 / 回执

- **目标日**：`target_date_iso`（+ 可选 `target_day_number`）
- **幂等键**：`idempotency_key`（默认 `draft_id`）；同一键重复 Apply 返回 `idempotent: true`，不二次改库
- **成功 SSE**：`message.created`，payload 含
  - `ui_surface: itinerary_adjust_apply_result`
  - `itinerary_adjust_apply_result: { applied, target_date_iso, draft_id, idempotency_key, source_message_id, … }`
  - `applied: true`
- **原草案消息**：`itinerary_adjust_result.applied` 置 `true`，`apply_gate.can_apply=false`

## SSE 事件

`message.created` · `ai.progress` · `confirm.resolved` · `peer.activity`

住宿检索成功时，`message.summary_json` / SSE `message.created.payload` 会带：

- `intro` / `answer_text` / `summary` / `markdown` / `text`：策略正文（**卡片上方文案**；已剥离「实时可订住宿」列表，避免与卡片重复）
- `schema_id`: `tripnara/chat_accommodation_cards@v1`
- `ui_surface`: `accommodation_cards`
- `accommodation_cards`：结构化卡片，常用字段：
  - `name` / `nameZh` / `nameCN`：名称
  - `photoUrl` / `url` / `rating` / `priceLabel`
  - `recommendReasonZh` / `decision_support_zh` / `推荐原因`：推荐原因
  - `inventoryVerified` / `inventoryMode` / `availabilityDisclaimerZh`：可订核验（`detail_verified` | `stay_priced` | `poi_catalog` | `unverified`）
  - `fields_zh`：`[{ key, label, value }]` 中文可渲染字段（价格/评分/入住/距离/推荐原因/可订性…）
  - `field_labels_zh`：字段 key → 中文标签
  - **`cta_zh`**：默认「加入行程」（主按钮文案）
  - **`actions[]`**：含 `add_accommodation_to_itinerary`（一键加行程）与可选 `view_accommodation`
  - **`primary_action`**：指向「加入行程」的 action 对象
- `hotel_search_meta.inventory_*`：整批库存核验摘要（默认仅价签过滤；`HOTEL_INVENTORY_VERIFY=1` 才开房源页粗探）
- `cards_markdown`：可选，**勿拼进主气泡**；仅无原生卡片 UI 时降级用

有卡片时，`message.content` / 顶层 `text` / `intro` / `answer_text` **只含策略正文**。无 `answer_text` 时兜底「按你的日期，找到 N 个住宿可选：」。

**前端建议**：上方渲染 `intro`/`answer_text`/`content`；下方用 `accommodation_cards`（推荐原因取 `recommendReasonZh`；可订性取 `inventoryVerified` / `fields_zh.inventory`）。主按钮用 `cta_zh` / `primary_action`（`add_accommodation_to_itinerary`），调用 Apply：`POST .../trips/:tripId/accommodations/apply`。Google/高德结果为 `poi_catalog`，勿当「已确认有房」。

### 餐厅推荐卡

问「8.16的，请为我推荐餐厅」等餐饮推荐且回答成功时，`summary_json` 可带：

- `schema_id`: `tripnara/chat_restaurant_cards@v1`
- `ui_surface`: `restaurant_cards`
- `restaurant_cards[]`：
  - `name` / `nameZh` / `url` / `mapsUrl`
  - `cta_zh`: 默认「加入行程」
  - `actions[]`：`open_restaurant_url` / `open_maps` / `add_restaurant_to_itinerary`
  - `areaZh` / `cuisineZh` / `priceLabel` / `reasonZh` / `reservationHintZh` / `dayLabelZh`
  - `fields_zh` / `source`（`google_places` | `catalog_fallback`）
- Places 不可用时回落冰岛餐饮静态目录（按 8.16 / 黄金圈等区域）

### 租车公司 / 报价卡

问「推荐租车公司 / 租车报价」且回答成功时，`summary_json` 可带：

- `schema_id`: `tripnara/chat_car_rental_cards@v1`
- `ui_surface`: `car_rental_cards`
- `car_rental_cards[]`：
  - `name` / `nameZh` / `company` / `vehicleType` / `url`
  - `cta_zh`: 「查看报价」|「打开官网」|「去比价」
  - `actions[]`：`open_car_rental_url`
  - `priceLabel` / `pickupLabelZh` / `dropoffLabelZh` / `reasonZh` / `fields_zh`
  - `source`：`booking_com` | `iceland_rental_guidance` | `catalog_fallback` | `browserbase`
  - `availabilityDisclaimerZh`
- `car_rental_search_meta`：取还日窗口（含 `fallback_dates_used`）
- `car_rental_guidance_footnotes_zh`：可选保险 / F-road 脚注

优先 Booking.com 实时报价；无 Key / 无结果时用 `CarRentalDirect`（Browserbase 探本地车行官网 + 静态目录 Blue / Zero / Lotus / Lava + Northbound）；并可合并 `iceland.rentalGuidance`。

### 单日改排草案卡

问「优化第 N 天的路线 / 太赶了帮我放缓」等且回答成功时，`summary_json` 可带：

- `schema_id`: `tripnara/chat_itinerary_adjust_result@v1`
- `ui_surface`: `itinerary_adjust_result`
- `itinerary_adjust_result`：展示字段 + **写入 CTA**
  - 展示：`draft_schedule_zh` / `schedule_change_bullets_zh` / `apply_confirmation_lines` / `suppress_chat_lead` …
  - **`draft_id`**：幂等引用
  - **`durable_trip_run_id`**：可选，Apply 时回传
  - **`apply_snapshot`**：`{ target_date_iso, target_day_number?, apply_mode, items? }`
  - **`apply_gate`**：`{ can_apply, apply_path, deny_reason?, flawed_draft_forbidden }`
  - **`cta_zh`**：`确认写入`（仅 `can_apply=true`）
  - **`actions[]` / `primary_action`**：`action=apply_itinerary_adjust`，`params` 含 `draft_id` / `apply_path` / `apply_snapshot` / `idempotency_key`

主气泡 `answer_text` 为短说明；完整当日安排优先读该结构化字段。`execution_mode=ADVICE_ONLY` 时**不自动写行程**——前端按 `cta_zh` 画按钮，点后调 `POST .../apply-itinerary-draft`。

### 活动预订跳转卡

问「哪些景点需提前预定 / 活动预订」且回答成功时，`summary_json` 可带：

- `schema_id`: `tripnara/chat_activity_booking_cards@v1`
- `ui_surface`: `activity_booking_cards`
- `activity_booking_cards[]`：
  - `name` / `nameZh` / `url`（官网或运营商订票页，**前端 CTA 打开此链接**）
  - `cta_zh`: 默认「去预订」
  - `priceLabel` / `source`（`browserbase` | `catalog_fallback`）/ `availabilityDisclaimerZh`
  - `dayLabelZh` / `urgencyZh` / `reasonZh` / `fields_zh`
- `activity_search_meta`：探页摘要（`mode` / `probed` / `fallback` / `latency_ms`）

**MCP**：`activity.search`（`ActivityDirectService`）用 Browserbase 打开目录 URL，Stagehand 抽取价签与订票链；超时/未授权时回落静态目录。环境变量：

- `ACTIVITY_BOOKING_BROWSERBASE=0`：强制只用目录
- `ACTIVITY_BROWSERBASE_MS`：单次探页总预算（默认 ~28s）
- `LIVE_TOOL_ACTIVITY_MS`：live sensor 外层超时（默认 ~32s）

链接优先行程项 `bookingUrl` / Browserbase 抽取；否则用冰岛常见硬预约目录。瀑布等免费景点即使误标 `NEED_BOOKING` 也不出卡。

HTTP：`GET/POST /api/activity-direct/health|catalog|search`

单机内存 fanout；多实例需换 Redis pub/sub（事件 shape 不变）。

## 启用

```bash
npx prisma migrate deploy
# 或对本 SQL：psql $DATABASE_URL -f prisma/migrations/20260726170000_agent_conversations/migration.sql
npx prisma generate
# 重启 npm run dev
```
