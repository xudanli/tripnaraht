# 决策认知主链 · iOS 对接 Handoff

> **读者**：iOS 客户端  
> **主入口**：仍是 `POST /api/agent/route_and_run`（及 async / task）  
> **原则**：只消费**投影字段**，不解析内部工程节点名（`GATE_EVAL` / `PLAN_GEN` 等）。  
> **配套**：[FRONTEND_ROUTE_AND_RUN_IOS_HANDOFF.md](./FRONTEND_ROUTE_AND_RUN_IOS_HANDOFF.md) · DTO SSOT `src/agent/dto/route-and-run.dto.ts`

---

## 1. 你要对接什么

后端在编排结果上挂了「看清现实 → 发现关系 → 聚焦问题 → 预演未来 → 授权 → 写回」的**认知投影**。iOS 只需读三处（优先级从高到低）：

| 位置 | 字段 | 用途 |
|------|------|------|
| 展示主路径 | `result.payload.ui_display.cognition_cards` | **直接渲染卡片**（标题/正文/CTA 已中文化） |
| Cockpit | `explain.decision_cockpit.cognition_cards`（同源）+ `.cognition` | Decision Cockpit 页复用 |
| 观测/调试 | `result.payload.cognition` · `observability.cognition_v1` | echo 摘要（depth / markers / focus） |

**不要**自己拼工程 step 文案；卡片 `title_zh` / `body_zh` / `cta_zh` 已够用。

---

## 2. 响应字段形状（snake_case）

### 2.1 `cognition_cards`（schema: `tripnara.cognition_ui_cards@v1`）

```json
{
  "schema": "tripnara.cognition_ui_cards@v1",
  "decision_depth": "FULL_SIMULATION",
  "markers": ["REALITY_READY", "PROBLEM_FOCUSED", "FUTURE_SIMULATED", "DECISION_AUTHORIZED"],
  "cards": [
    {
      "id": "focus:focus_wind",
      "kind": "FOCUSED_PROBLEM",
      "title_zh": "当前决策焦点",
      "body_zh": "是否继续经过高风暴露路段？\n为何现在：…",
      "severity": "warn",
      "ref": "focus_wind",
      "cta_zh": "请确认后继续"
    },
    {
      "id": "future:NEED_CONFIRM",
      "kind": "FUTURE",
      "title_zh": "预演结果",
      "body_zh": "校验：NEED_CONFIRM · 推荐方案：alt_bypass",
      "severity": "warn"
    }
  ]
}
```

`kind` 枚举：`REALITY` | `RELATIONS` | `FOCUSED_PROBLEM` | `FUTURE` | `AUTHORIZATION` | `MILESTONE`  
`severity`：`info` | `warn` | `critical`

### 2.2 `cognition` / `cognition_v1` echo（schema: `tripnara/cognition_echo@v1`）

```json
{
  "schema": "tripnara/cognition_echo@v1",
  "decision_depth": "FULL_SIMULATION",
  "markers": ["REALITY_READY", "RELATIONS_READY", "PROBLEM_FOCUSED", "FUTURE_SIMULATED"],
  "reality": { "snapshotId": "…", "confidence": 0.78, "freshness": "VALID", "unknownCount": 0 },
  "relations": { "nodeCount": 4, "edgeCount": 3, "impactChainCount": 1 },
  "focused_problem": {
    "problemId": "focus_wind",
    "type": "RISK",
    "question": "是否继续高风路段？",
    "urgency": "NOW",
    "gateDisposition": "NEED_CONFIRM",
    "whyThisProblem": "…",
    "suppressedSecondaryProblems": ["午餐被压缩"]
  },
  "future": {
    "status": "NEED_CONFIRM",
    "recommendedAlternativeId": "alt_bypass",
    "alternativeCount": 1
  },
  "admission_audit": [
    { "phase": "plan_write", "ok": false, "missing": ["DECISION_AUTHORIZED"] }
  ]
}
```

`decision_depth`：`REALITY_ONLY` | `REALITY_AND_RELATIONS` | `FOCUSED_DECISION` | `FULL_SIMULATION`

### 2.3 写回门禁观测（可选读）

编排 metadata / 调试面可能出现：

- `cognition_write_admission: { ok, missing[] }`
- auto-apply 跳过：`itinerary_adjust_auto_apply.reason == "cognition_write_admission_denied"`

产品 UI **不必**展示这些；有「方案未写入」时可用 echo.markers 是否含 `PLAN_APPLIED`。

---

## 3. 请求：用户确认怎么回传

三种任一即可（可叠加）：

| 方式 | 字段 | 说明 |
|------|------|------|
| **推荐** 显式 consent | `options.decision_consent: true` | 用户点「确认推荐 / 接受风险」 |
| 澄清回答 | `clarification_answers: [{ questionId, value }]` | 与现有澄清卡同一套 |
| Early-warning 已确认 | （服务端从上一轮状态识别） | 通常随 clarification 一起 |

示例（确认上一轮 NEED_CONFIRM）：

```json
{
  "request_id": "ios-<uuid>",
  "user_id": "<uid>",
  "trip_id": "<trip-uuid>",
  "message": "确认按推荐绕行方案执行",
  "conversation_context": {
    "recent_messages": ["用户: 明天强风怎么调整南岸？", "助手: …"],
    "locale": "zh-CN"
  },
  "options": {
    "entry_point": "trip_detail_page",
    "execution_mode": "ADVICE_ONLY",
    "decision_consent": true
  },
  "clarification_answers": [
    { "questionId": "early_warning_relaxations", "value": ["reroute_south_coast"] }
  ]
}
```

成功后预期 markers 含 `DECISION_AUTHORIZED`；若写回成功再含 `PLAN_APPLIED`。

> 注意：`decision_consent` **不是**浏览器授权（`allow_webbrowse`）。协商多方案仍走 `POST /agent/confirm_negotiation`。

---

## 4. Swift · Codable（增量）

接到现有 `FRONTEND_ROUTE_AND_RUN_IOS_HANDOFF.md` 的模型上即可。

```swift
import Foundation

// MARK: - Request 增量

extension AgentOptions {
    /// 用户确认推荐方案 / 风险放宽 → 服务端 DECISION_AUTHORIZED
    var decision_consent: Bool?
}

// MARK: - Cognition UI cards

struct CognitionUiCards: Decodable {
    var schema: String?
    var decision_depth: String?
    var markers: [String]
    var cards: [CognitionUiCard]

    enum CodingKeys: String, CodingKey {
        case schema, decision_depth, markers, cards
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schema = try c.decodeIfPresent(String.self, forKey: .schema)
        decision_depth = try c.decodeIfPresent(String.self, forKey: .decision_depth)
        markers = try c.decodeIfPresent([String].self, forKey: .markers) ?? []
        cards = try c.decodeIfPresent([CognitionUiCard].self, forKey: .cards) ?? []
    }
}

struct CognitionUiCard: Decodable, Identifiable {
    var id: String
    var kind: CognitionCardKind
    var title_zh: String
    var body_zh: String
    var severity: CognitionSeverity?
    var ref: String?
    var cta_zh: String?
}

enum CognitionCardKind: String, Decodable {
    case REALITY, RELATIONS, FOCUSED_PROBLEM, FUTURE, AUTHORIZATION, MILESTONE
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = CognitionCardKind(rawValue: raw) ?? .unknown
    }
}

enum CognitionSeverity: String, Decodable {
    case info, warn, critical
}

// MARK: - Cognition echo

struct CognitionEcho: Decodable {
    var schema: String?
    var decision_depth: String?
    var markers: [String]?
    var reality: CognitionRealityEcho?
    var relations: CognitionRelationsEcho?
    var focused_problem: CognitionFocusedProblemEcho?
    var future: CognitionFutureEcho?
    var admission_audit: [CognitionAdmissionAudit]?
}

struct CognitionRealityEcho: Decodable {
    var snapshotId: String?
    var confidence: Double?
    var freshness: String?
    var unknownCount: Int?
}

struct CognitionRelationsEcho: Decodable {
    var nodeCount: Int?
    var edgeCount: Int?
    var impactChainCount: Int?
}

struct CognitionFocusedProblemEcho: Decodable {
    var problemId: String?
    var type: String?
    var question: String?
    var urgency: String?
    var gateDisposition: String?
    var whyThisProblem: String?
    var suppressedSecondaryProblems: [String]?
}

struct CognitionFutureEcho: Decodable {
    var status: String?
    var recommendedAlternativeId: String?
    var alternativeCount: Int?
}

struct CognitionAdmissionAudit: Decodable {
    var phase: String?
    var ok: Bool?
    var missing: [String]?
}

// MARK: - 挂到现有 Payload / UIDisplay / explain

extension ResultPayload {
    /// `tripnara/cognition_echo@v1`
    var cognition: CognitionEcho?
}

extension UIDisplay {
    var cognition_cards: CognitionUiCards?
}

struct DecisionCockpitPayload: Decodable {
    var cognition: CognitionEcho?
    var cognition_cards: CognitionUiCards?
    // …既有 trace / risk 等字段 decodeIfPresent
}

extension RouteAndRunResponse {
    // 若 explain 已建模：
    // var explain: ExplainBlock? 其中 decision_cockpit: DecisionCockpitPayload?
}
```

---

## 5. UI 怎么画（推荐）

```swift
func renderCognition(from res: RouteAndRunResponse) {
    // 1) 优先 ui_display 卡片（对话内嵌）
    let cards = res.result.payload?.ui_display?.cognition_cards
        ?? res.explain?.decision_cockpit?.cognition_cards

    if let cards, !cards.cards.isEmpty {
        // 焦点卡置顶；severity=critical/warn 用强调样式
        for card in cards.cards {
            showCognitionCard(card)
        }
    }

    // 2) CTA：有「请确认后继续」→ 弹出确认 → 再发 route_and_run
    if cards?.cards.contains(where: { $0.cta_zh?.contains("确认") == true }) == true
        || res.result.status == .NEED_CONFIRMATION
        || res.result.status == .NEED_CONSENT {
        // 确认按钮绑定 decision_consent = true（可同时带回 clarification_answers）
    }

    // 3) markers 徽标（可选）：DECISION_AUTHORIZED / PLAN_APPLIED
    let markers = cards?.markers
        ?? res.result.payload?.cognition?.markers
        ?? []
    if markers.contains("PLAN_APPLIED") {
        showToast("方案已写入行程")
    }
}

func confirmDecision(tripId: String?, history: [String], focusQuestionId: String?) async {
    let req = RouteAndRunRequest(
        request_id: "ios-\(UUID().uuidString)",
        user_id: currentUserId,
        trip_id: tripId,
        message: "确认按推荐方案继续",
        conversation_context: ConversationContext(
            recent_messages: history,
            locale: "zh-CN",
            timezone: TimeZone.current.identifier
        ),
        options: AgentOptions(
            entry_point: "trip_detail_page",
            execution_mode: "ADVICE_ONLY",
            decision_consent: true   // ← 关键
        ),
        clarification_answers: focusQuestionId.map {
            [ClarificationAnswer(questionId: $0, value: ["confirm"])]
        }
    )
    let (code, sync, meta) = try await api.routeAndRun(req)
    // …同既有 async/同步分支
}
```

### 卡片渲染建议

| kind | UI |
|------|-----|
| `FOCUSED_PROBLEM` | 主卡片：问题 + 为何现在；`cta_zh` 做主按钮 |
| `FUTURE` | 次级：校验状态 + 推荐方案 id（文案用 body_zh） |
| `REALITY` | 折叠/脚注：置信度与新鲜度 |
| `AUTHORIZATION` / `MILESTONE` | 进度点或时间线小节点 |

**浅深度**（`REALITY_ONLY`）：可能只有 REALITY 卡，属正常，勿当错误。

---

## 6. 与既有确认流的关系

| 场景 | 走哪条 |
|------|--------|
| 多方案协商（negotiation_payload） | `confirm_negotiation` + hash（不变） |
| 风险/焦点 NEED_CONFIRM、认知卡 CTA | **再打** `route_and_run` + `decision_consent: true` |
| 澄清题 | `clarification_answers`（可同时 `decision_consent`） |
| UWC / Apply 写库 | 仍走 UWC 产品链；认知门禁是编排侧前置条件 |

---

## 7. Smoke（本地）

```bash
BASE=http://localhost:3000/api
TRIP=<trip-uuid>

# 1) 发起会触发决策的调整
curl -s -X POST "$BASE/agent/route_and_run" \
  -H 'Content-Type: application/json' \
  -d "{
    \"request_id\":\"ios-cog-$(uuidgen)\",
    \"user_id\":\"anonymous\",
    \"trip_id\":\"$TRIP\",
    \"message\":\"明天强风，怎么调整南岸行程？\",
    \"conversation_context\":{\"recent_messages\":[],\"locale\":\"zh-CN\"},
    \"options\":{\"entry_point\":\"trip_detail_page\",\"execution_mode\":\"ADVICE_ONLY\",\"async_mode\":\"AUTO\"}
  }" | jq '{
    status: .result.status,
    cards: .result.payload.ui_display.cognition_cards,
    echo: .result.payload.cognition,
    cockpit: .explain.decision_cockpit.cognition_cards
  }'

# 2) 用户确认
curl -s -X POST "$BASE/agent/route_and_run" \
  -H 'Content-Type: application/json' \
  -d "{
    \"request_id\":\"ios-cog-consent-$(uuidgen)\",
    \"user_id\":\"anonymous\",
    \"trip_id\":\"$TRIP\",
    \"message\":\"确认按推荐方案执行\",
    \"options\":{\"decision_consent\":true,\"execution_mode\":\"ADVICE_ONLY\"},
    \"clarification_answers\":[{\"questionId\":\"early_warning_relaxations\",\"value\":[\"confirm\"]}]
  }" | jq '{
    markers: .result.payload.cognition.markers,
    cards: .result.payload.ui_display.cognition_cards.cards[:3]
  }'
```

后端单测冒烟（无 HTTP）：

```bash
npx jest src/decision/kernel/decision-cognition.smoke.spec.ts
```

---

## 8. iOS DoD（认知增量）

- [ ] Decode `ui_display.cognition_cards`（未知 `kind` 不崩溃）
- [ ] 焦点卡 + `cta_zh` 可点；确认时带 `options.decision_consent: true`
- [ ] Decision Cockpit 复用同源 `cognition_cards` / `cognition`
- [ ] 不展示内部 step；markers 仅作徽标
- [ ] `REALITY_ONLY` 仅现实卡视为正常
- [ ] 与 `confirm_negotiation` / UWC Apply 职责不混用

---

*契约实现：`build-cognition-ui-cards.util.ts` · `decision-cognition.util.ts` · Assembler `payload.cognition` / `observability.cognition_v1`。*
