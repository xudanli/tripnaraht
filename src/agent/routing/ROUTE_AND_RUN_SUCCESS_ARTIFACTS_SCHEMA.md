# route_and_run 规划成功产物 Schema

> **原则**：能看、能改、能订、能分享 — 全部落在结构化契约，**不从 Markdown 正文解析**。  
> **主路径**：`response.result.payload` · `response.result.payload.ui_display`  
> **路由协议**：[ROUTE_AND_RUN_ROUTING_PROTOCOL.md](./ROUTE_AND_RUN_ROUTING_PROTOCOL.md)

---

## 1. 总览映射

| 用户能力 | Schema / 路径 | 路由类 |
|----------|---------------|--------|
| **看** 行程 | `payload.timeline` · `ui_display.dual_track_itinerary` | FULL / PARTIAL / CONDITIONAL |
| **改** 行程 | CRUD patch · 协商 · rollback | CRUD / PARTIAL / 卫星 API |
| **订** | `booking_priority_list` · `booking_cart` · checkout bundle | SUCCESS 后 |
| **分享** | `delivery_artifacts` · calendar/PDF state | SUCCESS 后 |

---

## 2. 行程结构（能看 / 能改）

### 2.1 `payload.timeline` — 逻辑层（ItineraryDay[]）

```typescript
interface ItineraryDay {
  day_number: number;
  date?: string;           // ISO date
  title_zh?: string;
  items: ItineraryItem[];  // POI / transit / meal blocks
}

interface ItineraryItem {
  id?: string;
  type: string;            // POI | TRANSIT | MEAL | ...
  start_time?: string;
  end_time?: string;
  place?: { name_zh?: string; name_en?: string; lat?: number; lng?: number };
  status?: 'PLANNED' | 'AWAITING_CONFIRMATION' | 'OK';
}
```

- **CRUD_EDIT** 成功：以 patch 后的 `timeline` 为准（轻量 diff）。  
- **FULL_DEEP_PLAN**：完整多日 `timeline` + 可选 `orchestrationResult.state`。

### 2.2 `ui_display.dual_track_itinerary` — 展示层（晴/雨 · Plan B）

```typescript
// schema: tripnara.dual_track_itinerary@v1（DTO: DualTrackItineraryUiDto）
{
  schema: 'tripnara.dual_track_itinerary@v1';
  default_track_id: 'A';
  tracks: Array<{
    track_id: 'A' | 'B' | string;
    label_zh: string;
    activation_condition_zh?: string;  // 条件分支文案
    days: /* 与 timeline 同构的 UI 块 */;
  }>;
}
```

- **CONDITIONAL_BRANCH** 成功：**必须**有双轨或 `contingency_branches` 投影。  
- 前端：默认渲染 `default_track_id`，条件满足时切换 B 轨。

---

## 3. 备选方案（Plan B / alternatives）

| 路径 | 用途 |
|------|------|
| `payload.alternatives` | 决策候选（CGUS / 优化器） |
| `ui_display.dual_track_itinerary.tracks[]` | 用户可见双轨 |
| `payload.orchestrationResult.state.contingency_branches` | 编排内核条件分支 |
| `explain.optimization.alternatives` | Explain 面板 |

**不要**混用为唯一真相；SUCCESS 展示以 `ui_display` 为准，explain 只读。

---

## 4. 预订（能订）

| Schema | 路径 | 说明 |
|--------|------|------|
| `tripnara.booking_priority_list@v1` | `ui_display.booking_priority_list` | P0 倒计时 · 官方链接 |
| `tripnara.booking_cart@v1` | `ui_display.booking_cart` | 航班/酒店/租车采样 |
| `tripnara.booking_checkout_bundle@v1` | `booking_cart/apply` 响应 | 锁价结算单 |

Checkout 状态机：`POST /agent/booking_cart/apply` — 详见 [FRONTEND_BOOKING_DELIVERY.md](../delivery/FRONTEND_BOOKING_DELIVERY.md)。

**门控**：`flawed_draft_v1.is_flawed=true` 时 checkout 前须二次确认。

---

## 5. 地图（能看）

```typescript
// ui_display.unified_map_layer — tripnara.unified_map_layer@v1
{
  schema: 'tripnara.unified_map_layer@v1';
  layers: Array<{
    layer_id: string;
    kind: 'POI' | 'HOTEL_DEPOT' | 'CAR_RENTAL' | string;
    markers: Array<{ id: string; lat: number; lng: number; label_zh?: string }>;
  }>;
}
```

关联：`ui_display.delivery_artifacts.map_url` 可指向静态/交互地图导出。

---

## 6. 证据与风险 Banner（能看 / 门控）

| 类型 | 路径 | 用途 |
|------|------|------|
| 路段证据 | `ui_display.leg_evidence_cards` | 坡度 · 步行 · 车程 |
| POI 避坑 | `ui_display.poi_pitfall_cards` | 排队 · 预约 |
| Iron Shield | `ui_display.evidence_cards_ui` | 门控证据 UI |
| 瑕疵草案 | `payload.flawed_draft_v1` | SUCCESS 但未完全收敛 |
| 三人格 | `explain.guardian_personas` | Abu/Dr.Dre/Neptune 只读 |
| 失败码 | `explain.failure_reason_codes` | 调试 · 标签 |

### 6.1 稀疏区开放世界（GL / SJ）

| Schema | 路径 | 说明 |
|--------|------|------|
| `tripnara.open_world_discovery@v1` | `ui_display.open_world_discovery` | provisional POI stub + 核实任务 + 留白摘要 |

核实状态机：`POST /agent/open_world_verification/apply`（`mark_verified` · `discard_stub`）— 客户端回传快照，无服务端持久化。

```typescript
// tripnara.open_world_discovery@v1（节选）
{
  schema: 'tripnara.open_world_discovery@v1';
  sparse_profile_id?: string;
  verification_tasks: Array<{
    stub_id: string;
    title_zh: string;
    status: 'pending' | 'in_progress' | 'done';
    cta_label_zh: string;
  }>;
  intentional_slack_summary_zh?: string;
}
```

```typescript
// tripnara.flawed_draft@v1
{
  schemaId: 'tripnara.flawed_draft@v1';
  is_flawed: boolean;
  headline_zh?: string;
  reasons: Array<{ code: string; detail_zh?: string }>;
  user_action_recommended: boolean;
}
```

---

## 7. 分享 / 导出状态（能分享）

```typescript
// ui_display.delivery_artifacts — tripnara.delivery_artifacts@v1
{
  schema: 'tripnara.delivery_artifacts@v1';
  map_share_url?: string;
  calendar_ics_url?: string;
  pdf_export_url?: string;
  share_token?: string;
  export_state?: 'READY' | 'PENDING' | 'FAILED';
}
```

- **calendar / PDF**：异步生成时 `export_state=PENDING`，轮询或 SSE 终态后 `READY`。  
- 前端应缓存 `share_token`，避免重复导出。

---

## 8. 按路由类的最小 SUCCESS 包

| 路由类 | 必需字段 |
|--------|----------|
| QUICK_ANSWER | `result.answer_text` |
| CRUD_EDIT | `payload.timeline`（patch） |
| SLOT_PLACEMENT_CLARIFY | —（终端 `NEED_MORE_INFO`） |
| PARTIAL_REPLAN | `timeline` + 可选 `ui_display` |
| FULL_DEEP_PLAN | `ui_display.dual_track_itinerary` 或 timeline + narration + map |
| CONDITIONAL_BRANCH | `ui_display.dual_track_itinerary` |
| SAFETY_* | `NEED_CONSENT` / 无行程写 |

---

## 9. 语音与情绪（可选增强）

| Schema | 路径 |
|--------|------|
| `tripnara.voice_payload@v1` | `ui_display.voice_payload` |
| `tripnara.emotional_context.client@v1` | `ui_display.emotional_context` |
| `tripnara.accommodation_health@v1` | `ui_display.accommodation_health` |

---

*维护：与 `DecisionUiDisplayDto` · `RouteAndRunResponseDto` 同步；Breaking bump `@v2`。*
