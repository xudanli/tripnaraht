# AI 对话 · `route_and_run` · iOS 对接 Handoff

> **读者**：iOS 客户端  
> **主入口**：`POST /api/agent/route_and_run`  
> **原则**：对话页只接本入口；结构化 UI **优先**读 `conversation_turn_result`（七类标准卡）；其次 `ui_display` / `trusted_delivery_v1`；不解析内部编排节点名。  
> **响应形状**：裸 JSON（`RouteAndRunResponseDto`），**不是** `{ success, data }` 包装。  
> **统一输出 SSOT**：[FRONTEND_CONVERSATION_TURN_RESULT.md](./FRONTEND_CONVERSATION_TURN_RESULT.md)

**配套文档**

| 文档 | 用途 |
|------|------|
| [AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md) | 能力与接口地图 |
| [FRONTEND_TRUSTED_DELIVERY.md](./FRONTEND_TRUSTED_DELIVERY.md) | 成功态渲染硬规则 |
| [FRONTEND_ASYNC_TASK_LEASE.md](./FRONTEND_ASYNC_TASK_LEASE.md) | async lease |
| [**DECISION_COGNITION_IOS_HANDOFF.md**](./DECISION_COGNITION_IOS_HANDOFF.md) | **认知主链卡片 / consent / Cockpit（iOS）** |
| [route-and-run-sse-frontend-guide.md](../../../internal-docs/agent/route-and-run-sse-frontend-guide.md) | SSE |
| `src/agent/dto/route-and-run.dto.ts` | 类型 SSOT |
| Swagger | `{HOST}/api-docs` → tag `agent` |

---

## 1. 环境

| 项 | 值 |
|----|-----|
| Base | `{HOST}/api`（本地常见 `http://localhost:3000/api`） |
| Content-Type | `application/json` |
| 鉴权 | `Authorization: Bearer <token>`（与 Trip API 一致；本地 dev 常 `@Public()`） |
| 改行程 | **必须**带 `trip_id` |

---

## 2. 调用路径（选一条主路径）

| 场景 | 路径 |
|------|------|
| 短问答 / 小改 | `POST /agent/route_and_run` 同步等 200 |
| 规划 / 大改（推荐） | `POST /agent/route_and_run/async` → SSE + poll |
| 存量兼容 | 同步 POST，若 **202** + `async_task` → 切异步 |

协商确认：`POST /agent/confirm_negotiation`  
回滚：`POST /agent/rollback`

---

## 3. Swift · P0 Codable 模型

把下面文件放进 iOS 工程（例如 `TripNara/Agent/`）。字段为 **snake_case**（与后端一致）；未列字段可忽略（`decodeIfPresent`）。

```swift
import Foundation

// MARK: - Request

struct RouteAndRunRequest: Encodable {
    var request_id: String
    var user_id: String
    var trip_id: String?
    var message: String
    var conversation_context: ConversationContext?
    var options: AgentOptions?
    var clarification_answers: [ClarificationAnswer]?
}

struct ConversationContext: Encodable {
    /// 推荐格式：`"用户: …"` / `"助手: …"` 字符串数组（后端 SSOT）
    var recent_messages: [String]?
    var locale: String?        // 默认可传 "zh-CN"
    var timezone: String?      // 如 "Asia/Shanghai"
    var context_type: String?  // 可选 "active_trip_summary"
}

struct AgentOptions: Encodable {
    var entry_point: String?           // trip_detail_page | agent_chat | itinerary_day_editor | …
    var execution_mode: String?        // "ADVICE_ONLY" | "SEMI_AUTO" | "AUTO"
    var async_mode: String?            // "OFF" | "AUTO" | "FORCE"
    var max_seconds: Int?
    var allow_flawed_draft_narrate: Bool?
    /// 用户确认推荐方案 / 风险放宽 → 服务端 DECISION_AUTHORIZED（见 DECISION_COGNITION_IOS_HANDOFF）
    var decision_consent: Bool?
}

struct ClarificationAnswer: Encodable {
    var questionId: String
    var value: [String]
}

// MARK: - Sync / final response

struct RouteAndRunResponse: Decodable {
    var request_id: String
    var route: RouterOutput?
    var async_task: AsyncTaskMeta?
    var result: RouteAndRunResult
    // observability 等可忽略
}

struct RouterOutput: Decodable {
    var target: String?
    var reason: String?
}

struct AsyncTaskMeta: Decodable {
    var task_id: String
    var status: String?
    var is_async_delegated: Bool?
    var current_phase: String?
    var progress_percentage: Int?
    var message: String?
    var poll_path: String?
}

struct RouteAndRunResult: Decodable {
    var status: ResultStatus
    var answer_text: String
    var answer_html: String?
    var payload: ResultPayload?
}

enum ResultStatus: String, Decodable {
    case OK
    case PROCESSING
    case NEED_MORE_INFO
    case NEED_CONSENT
    case NEED_CONFIRMATION
    case FAILED
    case TIMEOUT
    case REDIRECT_REQUIRED
}

struct ResultPayload: Decodable {
    var trusted_delivery_v1: TrustedDeliveryV1?
    var flawed_draft_v1: FlawedDraftV1?
    /// 统一对话领域输出（渲染 SSOT）— FRONTEND_CONVERSATION_TURN_RESULT.md
    var conversation_turn_result: ConversationTurnResult?
    var trip_conversation_context: TripConversationContext?
    var ui_display: UIDisplay?
    var negotiation_payload: NegotiationPayload?
    var timeline: [ItineraryDay]?
    /// 认知 echo：`tripnara/cognition_echo@v1`（详见 DECISION_COGNITION_IOS_HANDOFF）
    var cognition: CognitionEcho?
    /// 轻量咨询 / 投票 CTA：迁移期兜底
    var ui_surface: String? // "planning" | "consultation"
    var suggested_operations: [SuggestedOperation]?
    var trip_id: String?
    /// 住宿库存卡（与 Chat `accommodation_cards` 同形；有 MCP 结果时必带）
    var accommodations: [AccommodationCard]?
    var accommodation_cards: [AccommodationCard]?
    var accommodation_night_groups: [AccommodationNightGroup]?
    var hotel_search_meta: HotelSearchMeta?
    /// 活动预订跳转卡（「预定冰川徒步」等；与 Chat `activity_booking_cards` 同形）
    /// 卡上可有 `teamFitnessFit` / `teamFitnessFloorZh` / `fields_zh` key=`team_fitness`；
    /// `activity_search_meta.team_fitness` 为全队木桶汇总（fit / fit_zh / missing_count…）
    var activity_booking_cards: [ActivityBookingCard]?
    var activities: [ActivityBookingCard]?
    var activity_search_meta: ActivitySearchMeta?
}

/// `result.payload.suggested_operations[]` — 对话气泡下方一键操作
struct SuggestedOperation: Decodable {
    var id: String?
    var label: String?
    /// `route_and_run_message` | `client_navigation`
    var kind: String?
    var payload: SuggestedOperationPayload?
}

struct SuggestedOperationPayload: Decodable {
    var message: String?
    var trip_id: String?
    /// client_navigation：`timeline` / `silent_vote_create` / `structured_negotiation` …
    var route: String?
    /// `silent_vote_create` / `start_vote` / `team.start_vote`
    var action: String?
}

enum DeliveryVerdict: String, Decodable {
    case VERIFIED
    case VERIFIED_WITH_WARNINGS
    case FLAWED_DRAFT
    case BLOCKED
    case FAILED
}

struct TrustedDeliveryV1: Decodable {
    var schemaId: String?
    var version: Int?
    var delivery_verdict: DeliveryVerdict?
    var task_progress: TaskProgress?
    var user_confirm: UserConfirm?
    var degraded_explanation: DegradedExplanation?
    var flawed_disclosure: FlawedDisclosure?
    var ai_operation_log: [AIOpLogEntry]?
}

struct TaskProgress: Decodable {
    var phase: String?
    var label_zh: String?
    var percent: Int?
    var message: String?
}

struct UserConfirm: Decodable {
    var required: Bool?
    var kind: String?          // clarification | confirmation | consent
    var summary_zh: String?
}

struct DegradedExplanation: Decodable {
    var present: Bool?
    var summary_zh: String?
    var reasons_zh: [String]?
}

struct FlawedDisclosure: Decodable {
    var present: Bool?
    var headline_zh: String?
    var reason_codes: [String]?
}

struct AIOpLogEntry: Decodable {
    var label_zh: String?
    var summary: String?
    var duration_ms: Int?
}

struct FlawedDraftV1: Decodable {
    var is_flawed: Bool?
    // reasons 等按需 decode
}

struct UIDisplay: Decodable {
    // 按需挑：dual_track_itinerary / booking_cart / map …
    /// 认知主链卡片：`tripnara.cognition_ui_cards@v1`（优先渲染）
    var cognition_cards: CognitionUiCards?
    // 未知键可先用 JSONValue 或忽略
}

// Cognition* 完整模型见 DECISION_COGNITION_IOS_HANDOFF.md §4
struct CognitionUiCards: Decodable {
    var schema: String?
    var decision_depth: String?
    var markers: [String]?
    var cards: [CognitionUiCard]?
}

struct CognitionUiCard: Decodable {
    var id: String?
    var kind: String?
    var title_zh: String?
    var body_zh: String?
    var severity: String?   // info | warn | critical
    var ref: String?
    var cta_zh: String?
}

struct CognitionEcho: Decodable {
    var schema: String?
    var decision_depth: String?
    var markers: [String]?
    // focused_problem / future / reality 等按需扩展，见认知 handoff
}

struct ItineraryDay: Decodable {
    // 按产品时间轴模型补字段；P0 可先 AnyJSON
}

struct NegotiationPayload: Decodable {
    var status: String?
    var alternatives: [NegotiationAlternative]?
    var default_option_id: String?
    var negotiation_session_id: String?
    var expected_negotiation_hash: String?
}

struct NegotiationAlternative: Decodable {
    var id: String?
    var label: String?
    var summary: String?
}

// MARK: - Async task

struct RouteAndRunTaskInit: Decodable {
    var task_id: String
    var status: String?
    var current_phase: String?
    var progress_percentage: Int?
    var message: String?
    var request_id: String?
    var data: RouteAndRunResponse?   // 通常 null
}

struct RouteAndRunTaskStatus: Decodable {
    var task_id: String
    var status: TaskStatus
    var current_phase: String?
    var progress_percentage: Int?
    var message: String?
    var data: RouteAndRunResponse?
    var updated_at: String?
    var task_lease_v1: TaskLeaseV1?
}

enum TaskStatus: String, Decodable {
    case PENDING
    case PROCESSING
    case SUCCESS
    case FAILED
    case CANCELLED
}

struct TaskLeaseV1: Decodable {
    var schemaId: String?
    var lease_status: LeaseStatus?
    var heartbeat_at: String?
    var lease_ttl_sec: Int?
    var resume_count: Int?
    var max_resume: Int?
    var durable_trip_run_id: String?
}

enum LeaseStatus: String, Decodable {
    case ACTIVE
    case STALE
    case RESUMING
    case EXHAUSTED
}

struct TaskSSEPayload: Decodable {
    var task_id: String?
    var request_id: String?
    var type: String                 // PHASE | RESULT | ERROR
    var current_phase: String?
    var progress_percentage: Int?
    var message: String?
    var status: TaskStatus?
    var ts: String?
    var error: String?
    var data: RouteAndRunResponse?
}

// MARK: - Confirm negotiation

struct ConfirmNegotiationRequest: Encodable {
    var session_id: String
    var alternative_id: String       // 如 UPGRADE_TO_DRIVE / POSTPONE_SCHEDULE
    var expected_negotiation_hash: String
}

struct ConfirmNegotiationResponse: Decodable {
    var status: String               // CONFIRMED
    var resolution_patch_summary: String?
    // itinerary / itinerary_revision 按需
}
```

---

## 4. Swift · API Client（骨架）

```swift
import Foundation

final class RouteAndRunAPI {
    let baseURL: URL          // …/api
    var tokenProvider: () -> String?

    init(baseURL: URL, tokenProvider: @escaping () -> String? = { nil }) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
    }

    private func authorizedRequest(path: String, method: String, body: Data? = nil) -> URLRequest {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = tokenProvider(), !t.isEmpty {
            req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = body
        return req
    }

    func routeAndRun(_ body: RouteAndRunRequest) async throws -> (code: Int, sync: RouteAndRunResponse?, asyncMeta: AsyncTaskMeta?) {
        let data = try JSONEncoder().encode(body)
        let (respData, resp) = try await URLSession.shared.data(
            for: authorizedRequest(path: "agent/route_and_run", method: "POST", body: data)
        )
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 202 {
            // 可能整包是 RouteAndRunResponse 且带 async_task
            let decoded = try JSONDecoder().decode(RouteAndRunResponse.self, from: respData)
            return (code, nil, decoded.async_task)
        }
        let decoded = try JSONDecoder().decode(RouteAndRunResponse.self, from: respData)
        if let meta = decoded.async_task, meta.is_async_delegated == true {
            return (code, nil, meta)
        }
        return (code, decoded, nil)
    }

    func routeAndRunAsync(_ body: RouteAndRunRequest) async throws -> RouteAndRunTaskInit {
        var b = body
        if b.options == nil { b.options = AgentOptions() }
        b.options?.async_mode = b.options?.async_mode ?? "FORCE"
        let data = try JSONEncoder().encode(b)
        let (respData, resp) = try await URLSession.shared.data(
            for: authorizedRequest(path: "agent/route_and_run/async", method: "POST", body: data)
        )
        guard (resp as? HTTPURLResponse)?.statusCode == 202 || (resp as? HTTPURLResponse)?.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(RouteAndRunTaskInit.self, from: respData)
    }

    func taskStatus(taskId: String) async throws -> RouteAndRunTaskStatus {
        let (data, _) = try await URLSession.shared.data(
            for: authorizedRequest(path: "agent/task/status/\(taskId)", method: "GET")
        )
        return try JSONDecoder().decode(RouteAndRunTaskStatus.self, from: data)
    }

    func resumeTask(taskId: String) async throws {
        _ = try await URLSession.shared.data(
            for: authorizedRequest(path: "agent/task/resume/\(taskId)", method: "POST")
        )
    }

    func confirmNegotiation(_ body: ConfirmNegotiationRequest) async throws -> ConfirmNegotiationResponse {
        let data = try JSONEncoder().encode(body)
        let (respData, resp) = try await URLSession.shared.data(
            for: authorizedRequest(path: "agent/confirm_negotiation", method: "POST", body: data)
        )
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 409 { throw NegotiationExpiredError() }
        return try JSONDecoder().decode(ConfirmNegotiationResponse.self, from: respData)
    }
}

struct NegotiationExpiredError: Error {}
```

### SSE（生产可带 Bearer）

不要用不能加 Header 的 `EventSource`；用 `URLSession.bytes`：

```swift
extension RouteAndRunAPI {
    /// 解析 text/event-stream：拼 data 行 → JSON → TaskSSEPayload
    func streamTask(taskId: String, onEvent: @escaping (TaskSSEPayload) -> Void) async throws {
        let req = authorizedRequest(path: "agent/task/stream/\(taskId)", method: "GET")
        let (bytes, _) = try await URLSession.shared.bytes(for: req)
        var dataLines: [String] = []
        for try await line in bytes.lines {
            if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
            } else if line.isEmpty, !dataLines.isEmpty {
                let raw = dataLines.joined(separator: "\n")
                dataLines.removeAll()
                if let d = raw.data(using: .utf8),
                   let payload = try? JSONDecoder().decode(TaskSSEPayload.self, from: d) {
                    onEvent(payload)
                    if payload.type == "RESULT" || payload.type == "ERROR" { return }
                }
            }
        }
    }
}
```

---

## 5. UI 状态机（对话页）

```
┌─────────────┐
│   idle      │
└──────┬──────┘
       │ 用户发送
       ▼
┌─────────────┐     短问答        ┌──────────────┐
│  sending    │──────────────────►│ renderFinal  │
└──────┬──────┘                   └──────────────┘
       │ 规划 / async / 202
       ▼
┌─────────────┐  PHASE/poll      ┌──────────────┐
│  running    │◄────────────────►│  progress UI │
│ (SSE+poll)  │   STALE/RESUMING │ 「恢复中…」  │
└──────┬──────┘                  └──────────────┘
       │ RESULT / status=SUCCESS
       ▼
┌─────────────┐
│ renderFinal │── switch result.status
└──────┬──────┘
       ├─ OK ──────────────► 气泡 + ui_display
       │                     + flawed/degraded Banner
       ├─ NEED_MORE_INFO ──► 澄清卡 → 再发 route_and_run
       ├─ NEED_CONFIRMATION► 方案卡 → confirm_negotiation
       ├─ NEED_CONSENT ────► 授权
       └─ FAILED/TIMEOUT ──► 错误 + 重试
```

### `renderFinal` 伪代码

```swift
func renderFinal(_ res: RouteAndRunResponse) {
    let r = res.result
    let td = r.payload?.trusted_delivery_v1
    let verdict = td?.delivery_verdict
    let turn = r.payload?.conversation_turn_result  // 统一领域输出 SSOT

    if verdict == .FLAWED_DRAFT || r.payload?.flawed_draft_v1?.is_flawed == true {
        showFlawedBanner(td?.flawed_disclosure?.headline_zh)
        // 禁止当「已验证」；禁止静默 Apply
    }
    if td?.degraded_explanation?.present == true {
        showDegraded(td?.degraded_explanation)
    }

    switch r.status {
    case .OK:
        appendAssistantBubble(turn?.answer_text ?? r.answer_text)
        if let turn {
            renderConversationTurn(turn)  // primary_card + cards + actions
            // 住宿库存在信封内（非七类 kind）；缺省再读 payload 顶层双写
            renderAccommodationCards(
                turn.accommodation_cards ?? r.payload?.accommodation_cards
            )
            // 飞猪住宿 CTA：`view_accommodation.params.open_strategy == app_then_web` 时
            // 先 `UIApplication.open(appUrl || tbOpenUrl)`（淘宝/飞猪），失败再开 `fallback_url`/`webUrl`（https）。
            // 勿只开 `url` 的 router.feizhu.com，否则会先落浏览器中间页再点一次。
            // 活动预订跳转卡（CTA 打开 card.url；勿当「已下单」）
            renderActivityBookingCards(
                turn.activity_booking_cards ?? r.payload?.activity_booking_cards
            )
        } else {
            // 迁移兜底
            renderUIDisplay(r.payload?.ui_display)
            renderCognitionCards(r.payload?.ui_display?.cognition_cards)
            renderAccommodationCards(r.payload?.accommodation_cards)
            renderActivityBookingCards(r.payload?.activity_booking_cards)
            renderSuggestedOperations(r.payload?.suggested_operations, tripId: r.payload?.trip_id)
            renderTimeline(r.payload?.timeline)
        }
        renderOpLog(td?.ai_operation_log)
    case .NEED_MORE_INFO:
        showClarification(html: r.answer_html, text: r.answer_text, confirm: td?.user_confirm)
        if let turn { renderConversationTurn(turn) }
        else { renderCognitionCards(r.payload?.ui_display?.cognition_cards) }
    case .NEED_CONFIRMATION:
        showNegotiation(r.payload?.negotiation_payload)
        if let turn { renderConversationTurn(turn) }
        // 若无 negotiation_payload、仅有认知 CTA：用 decision_consent 再打 route_and_run
        renderCognitionCards(r.payload?.ui_display?.cognition_cards)
    case .NEED_CONSENT:
        showConsent()  // 确认后 options.decision_consent = true
        renderCognitionCards(r.payload?.ui_display?.cognition_cards)
    case .FAILED, .TIMEOUT:
        showError(r.answer_text, td?.degraded_explanation)
    default:
        showError(r.answer_text, nil)
    }
}
```

### 发送一条消息

```swift
func send(userText: String, tripId: String?, history: [String]) async {
    let req = RouteAndRunRequest(
        request_id: "ios-\(UUID().uuidString)",
        user_id: currentUserId,                 // 或 "anonymous"
        trip_id: tripId,
        message: userText,
        conversation_context: ConversationContext(
            recent_messages: history,           // ["用户: …", "助手: …", ...]
            locale: "zh-CN",
            timezone: TimeZone.current.identifier
        ),
        options: AgentOptions(
            entry_point: "trip_detail_page",
            execution_mode: "ADVICE_ONLY",
            async_mode: isLikelyPlanning(userText) ? "AUTO" : "OFF",
            max_seconds: 60
        ),
        clarification_answers: nil
    )

    // 规划倾向：直接 async
    if isLikelyPlanning(userText) {
        let initTask = try await api.routeAndRunAsync(req)
        await runUntilDone(taskId: initTask.task_id)
        return
    }

    let (code, sync, meta) = try await api.routeAndRun(req)
    if let meta, let tid = Optional(meta.task_id) {
        await runUntilDone(taskId: tid)
    } else if let sync {
        renderFinal(sync)
    } else {
        showError("empty response \(code)", nil)
    }
}

func runUntilDone(taskId: String) async {
    // 并行：SSE 更新进度；每 2s poll 读 lease + 兜底结果
    async let stream: Void = {
        try? await api.streamTask(taskId: taskId) { ev in
            updateProgress(ev.message, ev.progress_percentage)
            if ev.type == "RESULT", let data = ev.data { renderFinal(data) }
            if ev.type == "ERROR" { showError(ev.error ?? ev.message ?? "failed", nil) }
        }
    }()

    while true {
        let st = try await api.taskStatus(taskId: taskId)
        if st.task_lease_v1?.lease_status == .STALE
            || st.task_lease_v1?.lease_status == .RESUMING {
            showRecovering()
        }
        if st.task_lease_v1?.lease_status == .EXHAUSTED {
            showError("多次恢复失败，请重新发起", nil)
            break
        }
        if st.status == .SUCCESS, let data = st.data {
            renderFinal(data)
            break
        }
        if st.status == .FAILED || st.status == .CANCELLED {
            showError(st.message ?? "failed", nil)
            break
        }
        try await Task.sleep(nanoseconds: 2_000_000_000)
    }
    _ = await stream
}
```

### 协商确认

```swift
func onUserPickAlternative(_ neg: NegotiationPayload, alternativeId: String) async {
    guard let sid = neg.negotiation_session_id,
          let hash = neg.expected_negotiation_hash else { return }
    do {
        let out = try await api.confirmNegotiation(
            ConfirmNegotiationRequest(
                session_id: sid,
                alternative_id: alternativeId,
                expected_negotiation_hash: hash
            )
        )
        showConfirmed(out.resolution_patch_summary)
        refreshTripTimeline()
    } catch is NegotiationExpiredError {
        toast("方案已过期，请重新对话")
        // 重新 route_and_run，勿重放旧 hash
    }
}
```

### 一键操作（`suggested_operations`）

「问一下大家谁愿意开车 / 发起投票」等会走 `SILENT_VOTE_CREATE_FAST_PATH`，响应形如：

```json
{
  "result": {
    "status": "OK",
    "answer_text": "可以发起团队匿名投票…",
    "payload": {
      "ui_surface": "consultation",
      "trip_id": "<uuid>",
      "suggested_operations": [{
        "id": "start_silent_vote",
        "label": "发起投票",
        "kind": "client_navigation",
        "payload": {
          "trip_id": "<uuid>",
          "route": "silent_vote_create",
          "action": "silent_vote_create"
        }
      }]
    }
  }
}
```

```swift
func renderSuggestedOperations(_ ops: [SuggestedOperation]?, tripId: String?) {
    guard let ops, !ops.isEmpty else { return }
    for op in ops {
        addChip(title: op.label ?? op.id ?? "操作") {
            switch op.kind {
            case "client_navigation":
                let route = op.payload?.route ?? ""
                let action = op.payload?.action ?? ""
                let tid = op.payload?.trip_id ?? tripId
                if route == "silent_vote_create"
                    || action == "silent_vote_create"
                    || action == "start_vote"
                    || action == "team.start_vote" {
                    openSilentVoteCreateDialog(tripId: tid) // 仅打开创建面板，勿直接 POST 创建
                } else if let r = op.payload?.route {
                    navigate(route: r, tripId: tid)
                }
            case "route_and_run_message":
                if let msg = op.payload?.message {
                    Task { await sendRouteAndRun(message: msg, tripId: op.payload?.trip_id ?? tripId) }
                }
            default:
                break
            }
        }
    }
}
```

---

## 6. 明确不要做

| 不要 | 原因 |
|------|------|
| 用 `{ success, data }` 解 `route_and_run` | 本接口是裸 DTO |
| `recent_messages` 只传 role/content 对象 | 后端 SSOT 是 **字符串**（`用户:` / `助手:`） |
| 解析 `decision_log.step` 当进度 | 用 `task_progress.label_zh` / SSE `message` |
| `FLAWED_DRAFT` 当已验证可订 | 禁止静默 Apply |
| 默认 `execution_mode: AUTO` | 对话默认 `ADVICE_ONLY` |
| 忽略 `suggested_operations` 只画 `answer_text` | 「发起投票」等 CTA 只在 `payload.suggested_operations`；不渲染则用户看不到按钮 |
| 页面直调 UWC Apply / orchestrator 内部 API | 写回走协商卫星或编排/UWC 产品链 |

---

## 7. Smoke

```bash
BASE=http://localhost:3000/api
TRIP=<trip-uuid>

curl -s -X POST "$BASE/agent/route_and_run" \
  -H 'Content-Type: application/json' \
  -d "{
    \"request_id\":\"ios-$(uuidgen)\",
    \"user_id\":\"anonymous\",
    \"trip_id\":\"$TRIP\",
    \"message\":\"给我看第 2 天行程\",
    \"conversation_context\":{\"recent_messages\":[],\"locale\":\"zh-CN\"},
    \"options\":{\"entry_point\":\"trip_detail_page\",\"execution_mode\":\"ADVICE_ONLY\",\"async_mode\":\"OFF\"}
  }" | jq '{status:.result.status, verdict:.result.payload.trusted_delivery_v1.delivery_verdict, text:.result.answer_text}'
```

---

## 8. iOS DoD（P0）

- [ ] 对话只打 `route_and_run` / `async` / `task/status` / `task/stream`
- [ ] 每条消息：`request_id` + `user_id` + `message`；改行程带 `trip_id`
- [ ] `recent_messages` 用 `"用户:"` / `"助手:"` 字符串
- [ ] 按 `result.status` + `delivery_verdict` 分支
- [ ] **优先渲染** `result.payload.conversation_turn_result`（七类卡 + `actions`）；缺失再 fallback 旧字段
- [ ] 进度用 `task_progress` / SSE，不读内部 step
- [ ] `NEED_CONFIRMATION` → `confirm_negotiation`（回传 hash）
- [ ] SSE 用 URLSession（可带 Bearer）+ poll lease 兜底
- [ ] 瑕疵草案 Banner；禁止静默写库
- [ ] `change_draft` / cognition：确认时带 apply 或 `options.decision_consent`
- [ ] `team_action` / `actions`：`client_navigation` + `silent_vote_create` 打开 SilentVoteCreateDialog（勿替用户创建投票）
- [ ] `decision_options`：渲染 `title_zh` / `composer_message_zh`；**禁止**把 `option.id`（如 `2WD`）填进输入框。优先 `select_decision_option`（payload 含 `decision_id`+`option_id`），否则用 `route_and_run_message` 的中文 `payload.message`
- [ ] Commit 后若有「生成调整草案」CTA：用 `route_and_run_message` 再入主链出 `change_draft`
- [ ] 若 payload 含 `client_auto_follow.enabled`：自动再发一次 `route_and_run`（message=`pending_route_and_run_message`），仍须用户确认 Apply
- [ ] 决策账本：`GET /agent/trips/:tripId/decision-status` 可展示开放题与已提交策略

---

*与 `AgentController` · `RouteAndRunRequestDto` · `FRONTEND_TRUSTED_DELIVERY.md` · `DECISION_COGNITION_IOS_HANDOFF.md` 同步维护。*

---

## 附录 · 会话层（骨架）

团队/个人 AI 对话抽屉请改用 **`/api/agent/chat/*`**（落库 + 权限 + SSE），见：

`src/agent/chat/AGENT_CHAT_API.md`

`route_and_run` 仍为执行引擎；对话产品勿再只靠客户端 `recent_messages`。
