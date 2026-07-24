# 预订域交付层 — 前端集成指南（Phase-4c）

> 适用接口：`POST /api/agent/route_and_run`（SUCCESS）  
> 总览：[AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md)  
> 数据路径：`response.result.payload.ui_display.*`  
> 原则：**正文读 narration 摘要，交互读 ui_display 结构化契约** — 不要从 Markdown 正文解析预订信息。

---

## 1. 总览：三个契约 + 一条 checkout 链路

| 契约 | Schema | 用途 |
|------|--------|------|
| 预订优先级 | `tripnara.booking_priority_list@v1` | 抢票倒计时、日历提醒、官方链接 |
| 预订购物车 | `tripnara.booking_cart@v1` | 航班/酒店/租车采样报价 + 全局预算优选 |
| 多模态交付 | `tripnara.delivery_artifacts@v1` | 地图动线、日历同步、PDF |
| 统一地图图层 | `tripnara.unified_map_layer@v1` | POI + 酒店 depot + 取还车多图层 |
| Bundle 结算单 | `tripnara.booking_checkout_bundle@v1` | submit_checkout 锁价后的组合结算单 |

Checkout 状态机：`POST /agent/booking_cart/apply`

---

## 2. 页面布局建议（SUCCESS 后）

```
┌─────────────────────────────────────────┐
│ narration.user_friendly_summary（短摘要）│
│ + trade_off_narrative（若有）            │
├─────────────────────────────────────────┤
│ 🔴 booking_priority_list（P0 置顶）       │
├─────────────────────────────────────────┤
│ dual_track_itinerary / 行程时间轴        │
├─────────────────────────────────────────┤
│ booking_cart（可折叠「一键预订」）        │
├─────────────────────────────────────────┤
│ poi_pitfall_cards / leg_evidence_cards   │
├─────────────────────────────────────────┤
│ delivery_artifacts（地图 / 日历 / PDF）  │
└─────────────────────────────────────────┘
```

**不要**在正文区重复渲染 `booking_priority_list.items` 的全文；NARRATE 已在 `tips` 里放一行 `[预订优先级] …` 摘要。

---

## 3. `booking_priority_list@v1`

### 3.1 读取路径

```typescript
const ui = response.result.payload.ui_display;
const list = ui?.booking_priority_list;
// 或流式 NARRATE 阶段：narration.booking_priority_list（与 ui_display 同源）
```

### 3.2 类型要点

```typescript
interface BookingPriorityList {
  schema: 'tripnara.booking_priority_list@v1';
  tripId: string;
  generatedAt: string; // ISO，用于本地重算 countdown
  items: BookingPriorityItem[];
}

interface BookingPriorityItem {
  id: string;
  category: 'ATTRACTION_TICKET' | 'TRANSPORT_FLIGHT' | 'SPECIAL_EXPERIENCE';
  title: string;
  associatedDayNumber: number;
  urgencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  timing: {
    bookByDate: string;
    opensAtLocal?: string;
    countdownSeconds: number; // 相对 generatedAt
  };
  actionPayload: {
    officialBookingUrl: string;
    bookingGuideHtml?: string;
    calendarReminderDeeplink: string;
  };
}
```

### 3.3 渲染规则

1. **排序**：后端已按 `urgencyLevel` + `countdownSeconds` 排好，直接渲染。
2. **倒计时**：客户端用 `generatedAt + countdownSeconds` 或每秒递减；到期显示「需立即处理」。
3. **urgency 样式**：
   - `CRITICAL` → 红/置顶
   - `HIGH` → 橙
   - `MEDIUM` → 默认
4. **主按钮「去预约」** → `actionPayload.officialBookingUrl`（新窗口）。
5. **次按钮「加日历」** → 见 §3.4。
6. **避坑**：`bookingGuideHtml` 用 sanitizer 后折叠展示（与 `poi_pitfall_cards` 不重复展开）。

### 3.4 日历 Deeplink 处理

当前 `calendarReminderDeeplink` 为 **Dashboard 深链**（Phase-4c 过渡形态）：

```
/dashboard/trips/{tripId}?action=calendar_reminder&booking_id={id}&opens_at=...&book_by=...&title=...
```

**推荐前端实现：**

```typescript
function openCalendarReminder(item: BookingPriorityItem, tripId: string) {
  const deeplink = item.actionPayload.calendarReminderDeeplink;

  // 方案 A：若已是 https://calendar.google.com/... 直接 window.open
  if (deeplink.startsWith('https://calendar.google.com/')) {
    window.open(deeplink, '_blank');
    return;
  }

  // 方案 B：Dashboard 深链 → 调后端 Google Calendar API
  // delivery_artifacts.links 里 kind=calendar 的 api_action:
  // POST /google-calendar/trips/{tripId}/sync
  // 扩展：POST body 带上 booking_id / opens_at / title（后续 Phase-4d）

  // 方案 C（Web 降级）：生成 .ics Blob 下载
  const start = item.timing.opensAtLocal ?? item.timing.bookByDate;
  downloadIcs({
    title: item.title,
    start,
    description: stripHtml(item.actionPayload.bookingGuideHtml),
    url: item.actionPayload.officialBookingUrl,
  });
}
```

---

## 4. `booking_cart@v1` + 全局背包优选

### 4.1 读取路径

```typescript
const cart = ui?.booking_cart;
```

### 4.2 状态机（`cart_state`）

| 状态 | 含义 | UI |
|------|------|-----|
| `draft` | 无预算或未对账 | 展示 items，默认勾选 `selection.selected_item_ids` |
| `optimized` | 预算内全局优选完成 | 绿色摘要 + `trade_off_narrative` |
| `over_budget` | 超预算 | 展示 `savings_opportunities` 换选按钮 |
| `ready_to_checkout` | 用户确认可下单 | 启用「提交预订」 |
| `checkout_submitted` | 已提交 | 展示 checkout deep_links |

**重要**：`quote_only: true` — 价格为采样报价，下单前需提示用户再次确认。

### 4.3 默认选中逻辑

```typescript
const selected = new Set(cart.selection?.selected_item_ids ?? []);
// 同 slot 只能选一项（flight_leg_* / hotel_night_* / car_rental）
```

用户改选后必须走 checkout API，**不要**只改本地 state 而不回传 cart 快照。

### 4.4 `trade_off_narrative`

全局背包锁定「高光锚点」后生成的中文说明，例如：

> 💡 预算对账：为确保第 4 天的高光体验（顶级住宿），系统已在其余槽位优先选择高性价比选项…

展示在 `headline_zh` 下方即可，无需 LLM 再生成。

### 4.5 超预算换选

```typescript
cart.savings_opportunities?.forEach((s, index) => {
  // 按钮文案：s.suggestion_zh
  // 点击 → POST booking_cart/apply { action: 'apply_saving', payload: { saving_index: index } }
});
```

---

## 5. Checkout API

**Endpoint：** `POST /agent/booking_cart/apply`

```typescript
type BookingCartAction =
  | 'update_selection'
  | 'apply_saving'
  | 'confirm_ready'
  | 'submit_checkout';

async function applyCartAction(
  cart: BookingCartUi,
  action: BookingCartAction,
  payload?: {
    selected_item_ids?: string[];
    saving_index?: number;
    acknowledge_over_budget?: boolean;
  },
) {
  const res = await fetch('/agent/booking_cart/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart, action, payload, trip_id: cart.trip_id }),
  });
  return res.json(); // { status: 'OK'|'REJECTED', booking_cart, checkout?, rejection_reason_zh? }
}
```

**典型流程：**

```
1. route_and_run SUCCESS → 展示 ui_display.booking_cart
2. 用户调整勾选 → update_selection { selected_item_ids }
3. 超预算点换选 → apply_saving { saving_index: 0 }
4. 确认 → confirm_ready（超预算需 acknowledge_over_budget: true）
5. 提交 → submit_checkout → checkout.deep_links[].href 跳转供应商
```

---

## 6. `delivery_artifacts@v1`（辅助）

```typescript
const artifacts = ui?.delivery_artifacts;
artifacts?.links.forEach((link) => {
  switch (link.kind) {
    case 'map':
      // link.href → Google Maps 动线
      break;
    case 'calendar':
      // link.api_action → POST /google-calendar/trips/{tripId}/sync
      break;
    case 'share':
      // 打开行程工作台
      break;
  }
});
```

优先使用 `ui_display.unified_map_layer`（见 §7）；`delivery_artifacts.map_polyline_url` 为 POI 折线降级。

---

## 7. `unified_map_layer@v1`（Phase-4d）

### 7.1 读取路径

```typescript
const mapLayer = ui?.unified_map_layer;
```

### 7.2 类型要点

```typescript
interface UnifiedMapLayerPayload {
  schema: 'tripnara.unified_map_layer@v1';
  trip_id?: string;
  points: Array<{
    id: string;
    kind: 'poi' | 'hotel_depot' | 'car_pickup' | 'car_dropoff' | 'transfer' | 'day_start';
    label_zh: string;
    lat: number;
    lng: number;
    day_number?: number;
    night_index?: number;
    icon_hint?: string;
  }>;
  legs: Array<{
    id: string;
    kind: 'drive' | 'walk' | 'transit' | 'flight' | 'ferry';
    from_point_id: string;
    to_point_id: string;
    label_zh?: string;
  }>;
  overview_directions_url?: string; // Google Maps 全览
  computed_at: string;
}
```

### 7.3 渲染建议

| `point.kind` | 图层 | 建议图标 |
|--------------|------|----------|
| `poi` | 行程 POI | 默认 pin |
| `hotel_depot` | 每晚住宿锚点 | 酒店 |
| `car_pickup` / `car_dropoff` | 租车 | 车 |
| `transfer` | 转场 | 虚线 |

- 用 `legs` 在地图上画「当日末站 → 酒店 depot」等连线。
- `overview_directions_url` 作为「在 Google 地图打开全览」按钮（与 `delivery_artifacts` 地图链互补）。

---

## 8. Bundle 锁价结算单 `booking_checkout_bundle@v1`

`submit_checkout` 成功后，`checkout.bundle` 携带锁价结果（替代纯 href 列表）。

```typescript
interface BookingCheckoutBundle {
  schema: 'tripnara.booking_checkout_bundle@v1';
  bundle_id: string;
  locked_at: string;
  expires_at: string; // 全 Bundle 最早过期，前端需倒计时
  total_locked_price_numeric: number;
  currency?: string;
  quote_only: boolean; // false = 全部 LOCKED，可展示「已锁价」
  lines: Array<{
    item_id: string;
    lock_id: string;
    lock_status: 'LOCKED' | 'QUOTE_ONLY' | 'LOCK_FAILED';
    lock_expires_at: string;
    locked_price_numeric: number;
    href?: string;
    api_action?: { method: 'GET' | 'POST'; path: string; body_keys?: string[] };
    lock_detail_zh?: string;
  }>;
  disclaimer_zh: string;
}
```

### 8.1 前端 checkout 流程（更新）

```
confirm_ready → cart_state = ready_to_checkout
submit_checkout → checkout.bundle + cart.quote_only 可能变 false
```

**展示规则：**

1. `bundle.quote_only === false` → 标题用「已锁定 Bundle」，展示 `total_locked_price_numeric` + `expires_at` 倒计时。
2. 逐行渲染 `lock_status`：
   - `LOCKED` → 绿标 + 锁价金额
   - `QUOTE_ONLY` → 黄标 + 「采样价」
   - `LOCK_FAILED` → 红标 + 引导 `href` 手动预订
3. 若 `line.api_action.path` 存在（如 `/mcp/hotel/hold`），后续 Phase 可 POST 正式 hold；当前可仍用 `href` 跳转。
4. **必须用响应里的 `booking_cart` 覆盖本地快照**（`quote_only`、`selection.total_price_numeric` 会更新）。

---

## 9. TypeScript 守卫（推荐）

```typescript
export function isBookingPriorityList(v: unknown): v is BookingPriorityList {
  return (
    typeof v === 'object' &&
    v != null &&
    (v as BookingPriorityList).schema === 'tripnara.booking_priority_list@v1' &&
    Array.isArray((v as BookingPriorityList).items)
  );
}

export function isBookingCart(v: unknown): v is BookingCartUi {
  return (
    typeof v === 'object' &&
    v != null &&
    (v as BookingCartUi).schema === 'tripnara.booking_cart@v1' &&
    Array.isArray((v as BookingCartUi).items)
  );
}
```

---

## 10. 空态与降级

| 场景 | 行为 |
|------|------|
| 无 `booking_priority_list` | 不渲染优先级区块（无 hard_booking / 交通提醒） |
| 无 `booking_cart` | 隐藏购物车；`delivery_artifacts` 仍可用 |
| `cart_state === 'draft'` | 无预算提示，仍展示报价 |
| SSE 流式 | 先渲染 itinerary；`ui_display` 在 SUCCESS 最终帧补齐 |

---

## 11. 示例 SUCCESS payload 片段

```json
{
  "result": {
    "status": "OK",
    "payload": {
      "ui_display": {
        "booking_priority_list": {
          "schema": "tripnara.booking_priority_list@v1",
          "tripId": "trip-abc",
          "generatedAt": "2026-06-13T08:00:00.000Z",
          "items": [{
            "id": "louvre",
            "category": "ATTRACTION_TICKET",
            "title": "卢浮宫预约",
            "associatedDayNumber": 3,
            "urgencyLevel": "CRITICAL",
            "timing": {
              "bookByDate": "2026-08-16T08:00:00.000Z",
              "opensAtLocal": "2026-08-16T10:00:00+02:00",
              "countdownSeconds": 5529600
            },
            "actionPayload": {
              "officialBookingUrl": "https://www.louvre.fr/tickets",
              "calendarReminderDeeplink": "/dashboard/trips/trip-abc?action=calendar_reminder&booking_id=louvre&..."
            }
          }]
        },
        "booking_cart": {
          "schema": "tripnara.booking_cart@v1",
          "quote_only": true,
          "cart_state": "optimized",
          "headline_zh": "已在 ¥20000 预算内完成全局优选（5 项，最大化体验分）",
          "trade_off_narrative": "💡 预算对账：为确保第 4 天的高光体验…",
          "selection": {
            "selected_item_ids": ["h1budget", "h2budget", "h4lux", "c2", "flight_leg0_rank2"],
            "total_price_numeric": 18500,
            "within_budget": true,
            "budget_limit": 20000
          }
        }
      }
    }
  }
}
```

---

## 12. Checklist（上线前）

- [ ] SUCCESS 后读取 `ui_display.booking_priority_list`，CRITICAL 项置顶
- [ ] 倒计时本地 tick，离开页面再回来用 `generatedAt` 重算
- [ ] 购物车改选走 `booking_cart/apply`，保留服务端返回的 cart 快照
- [ ] 展示 `quote_only` 免责声明
- [ ] 不解析 narration Markdown 里的预订细节
- [ ] `trade_off_narrative` 与 `headline_zh` 同区块展示
- [ ] 地图用 `unified_map_layer` 多图层（酒店 depot / 取还车）
- [ ] `submit_checkout` 后展示 `checkout.bundle` 锁价倒计时
- [ ] `bundle.quote_only === false` 时去掉「采样报价」主文案

---

## 13. 暖心语音 + 住宿健康度（诊断降维）

当系统检测到 **1666km 级锚距异常**、**冬夜长途收队**、**漏订住宿** 等硬门控问题时，不要向用户展示「结构性缺口 / distance_to_anchor_km」等内核术语。改读：

| 字段 | Schema | 用途 |
|------|--------|------|
| `voice_payload` | `tripnara.voice_payload@v1` | TTS 全文 + 调音参数 |
| `accommodation_health` | `tripnara.accommodation_health@v1` | N 晚进度条 + 人话标签 |
| `emotional_context` | `tripnara.emotional_context.client@v1` | 语气锁 `empathetic_reassurance` |

### 13.1 语音播报

```typescript
const voice = ui.voice_payload;
const emo = ui.emotional_context;

if (voice?.schema === 'tripnara.voice_payload@v1') {
  ttsEngine.speak({
    text: voice.text,
    speed: voice.audio_config.speed_factor,      // 冲突场景 ≈ 0.85
    pitch: voice.audio_config.pitch_setting,       // 'low'
    voiceId: voice.audio_config.voice_id,        // 可选映射
    // 与 emotional_context 交叉校验
    tone: emo?.voiceToneModifier ?? voice.tone_modifier,
  });
}
```

**不要**把 `narration.tips` 里带 `[安全贴士]` / `[内核提示]` 的条目直接 TTS 朗读；优先播 `voice_payload.text`。

### 13.2 住宿健康度进度条（替代公里数）

```typescript
const health = ui.accommodation_health;
// health.nights[].status: 'booked' | 'missing' | 'warning' | 'critical'
// health.nights[].warning_badge_zh → 人话标签，已换算为「约 X 小时车程」
```

| status | UI 建议 |
|--------|---------|
| `booked` | 绿色实心 |
| `missing` | 灰色虚线 + `cta_label_zh`「点我一键帮填」 |
| `warning` | 橙色 + `driving_time_label_zh` |
| `critical` | 红色 + 「疑似定错城市」类 badge |

**禁止**在卡片上直接展示 `distance_to_anchor_km: 1666`；若需调试，放开发者面板。

### 13.3 与正文分工

- `narration.user_friendly_summary`：短摘要（可能已前缀 voice 节选）
- `voice_payload.text`：完整口语版，适合「播放解说」按钮
- `accommodation_health.summary_zh`：进度条上方一行_stats_

### 13.4 Checklist

- [ ] 硬冲突场景 `emotional_context.voiceToneModifier === 'empathetic_reassurance'`
- [ ] TTS `speed_factor` 取 `voice_payload.audio_config`，默认 0.85
- [ ] 住宿卡片用 `accommodation_health` 标签，不展示 raw km
- [ ] 提供「播放语音解说」与「只看进度条」两种入口

问题联系后端：预订域契约变更以 `@v1` schema 字段为准，Breaking 变更会 bump 至 `@v2`。

---

## 14. 相关交付文档

**总览（推荐先读）**：[AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md) — 统一入口能力边界、HTTP 地图、响应四层。

| 文档 | 主题 |
|------|------|
| [FRONTEND_FLAWED_DRAFT_DELIVERY.md](./FRONTEND_FLAWED_DRAFT_DELIVERY.md) | SUCCESS 但未完全收敛 → `flawed_draft_v1` Banner |
| [FRONTEND_ASYNC_TASK_LEASE.md](./FRONTEND_ASYNC_TASK_LEASE.md) | 异步任务 Worker Lease · `task_lease_v1` · resume |
