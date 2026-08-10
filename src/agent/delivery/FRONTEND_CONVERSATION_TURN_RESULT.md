# ConversationTurnResult — 统一对话领域输出

> **Schema**：`tripnara.conversation_turn_result@v1`  
> **字段路径**：`result.payload.conversation_turn_result`  
> **原则**：Chat / iOS **只渲染本信封**；旧字段（`ui_display` / `suggested_operations` / `consultation_dashboard` / `itinerary_adjust_result` 等）双写保留迁移窗口。

配套：[`FRONTEND_ROUTE_AND_RUN_IOS_HANDOFF.md`](./FRONTEND_ROUTE_AND_RUN_IOS_HANDOFF.md) · 代码 SSOT [`src/agent/delivery/conversation/`](./conversation/)

---

## 信封

| 字段 | 说明 |
|------|------|
| `schema_id` | 固定 `tripnara.conversation_turn_result@v1` |
| `request_id` / `trip_id` | 请求与行程 |
| `lifecycle` | `PLANNING` \| `TRAVELING` \| `COMPLETED` \| `UNKNOWN` |
| `primary_card` | 七类之一，主渲染卡 |
| `cards[]` | 判别联合卡片（可多张，按 kind 去重） |
| `actions[]` | 统一 CTA |
| `delivery` | `{ verdict, user_confirm_required, flawed_present }` |
| `answer_text` | 与顶层 `result.answer_text` 同源 |
| `accommodation_cards` / `hotel_search_meta` | 可选；住宿 MCP 库存（**非**七类 kind）。有结果时写入信封，渠道须在此渲染 |
| `car_rental_cards` / `car_rentals` / `car_rental_search_meta` | 可选；租车推荐（Booking / Browserbase / 目录，**非**七类 kind）。有结果时写入信封，渠道须在此渲染 |
| `context` / `context_ref` | `TripConversationContextSnapshot` |
| `cgus_trip_review` | 可选；CGUS Outcome Loop 回写指针（`decision_id` / `recommended_candidate` / `trip_run_id_hint`）。见 [`CGUS_TRIP_REVIEW_IOS_HANDOFF.md`](./CGUS_TRIP_REVIEW_IOS_HANDOFF.md) |

并行字段：`payload.trip_conversation_context`（与 `context` 同源双写）；`payload.accommodation_cards` 与信封内字段同源双写。

---

## 七类标准卡片（冻结）

| kind | 用途 |
|------|------|
| `trip_fact` | 行程答问 / DATA_LOOKUP |
| `change_draft` | 变更草案（before/after、`apply_gate`） |
| `decision_options` | 方案对比 / consent；Decision Support 时含 `decision_id`、`dimensions`、`select_decision_option` |
| `gate_risk` | 执行结论优先 |
| `import_preview` | Guide-to-Plan 导入预览 |
| `team_action` | 投票 / 体能 / 通知 |
| `apply_receipt` | 写入回执 + rollback |

---

## Actions

`confirm_negotiation` · `decision_consent` · `select_decision_option` · `apply_itinerary_adjust` · `rollback` · `notify_members` · `open_guide_to_plan`

Decision Support Commit：`POST /api/agent/decisions/:decisionId/select`（body: `{ option_id, trip_id? }`）或 `route_and_run` 的 `options.decision_select`；写入 `trip.metadata.travelDecisionCommitments` **并合并** `travelDecisionContract`（约束控制台 SSOT），同时镜像 `icelandSelfDrive.drivingSettings`（车型/F-road/节奏）。开放题暂存于 `travelDecisionOpenProblems`（可跨进程水合）。查询：`GET /api/agent/trips/:tripId/decision-status`。返回可选 `draft_bridge_message` / CTA「生成调整草案」；`options.decision_auto_draft=true` 时附带 `pending_route_and_run_message` + `client_auto_follow`（客户端再打一次 route_and_run，**服务端不静默 Apply**）。

---

## 渲染顺序（渠道）

1. Decode `conversation_turn_result`
2. 按 `primary_card` 渲染主卡；其余卡可折叠
3. 若有 `accommodation_cards`（或 `accommodations`）→ 渲染住宿库存卡（与 Chat 同形）
4. 若有 `car_rental_cards`（或 `car_rentals`）→ 渲染租车推荐卡（与 Chat `tripnara/chat_car_rental_cards@v1` 同形）
5. 渲染 `actions[]`
6. **Fallback**：仅当信封缺失时读旧 `ui_display` / `suggested_operations` / 顶层 `accommodation_cards` / `car_rental_cards`

---

## 后续阶段接线（已落地）

| 阶段 | 接线 |
|------|------|
| ContextSnapshot | ContextEnricher 在 `active_trip_summary` 水合后挂载请求 carrier；Assembler 优先读取 |
| Lifecycle | `preferPrimaryCardForLifecycle` 决定 `primary_card` |
| TRAVELING | `shouldUseTravelingExecutionFocus` + `buildTravelingExecutionConclusion` → `gate_risk` 结论优先 |
| change_draft | `draft_schedule_zh` / `schedule_change_bullets_zh` 映射为 after/before |
| Guide-to-Plan | 导入 hint 时查询既有 session → `import_preview` |
| Team notify | Chat Apply 成功后 `buildTeamNotifyAfterApply` 写入回执 |
