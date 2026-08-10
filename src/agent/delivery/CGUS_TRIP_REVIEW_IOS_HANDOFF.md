# CGUS Trip Review · Outcome Loop · iOS 对接

> **读者**：iOS / 运营验证页  
> **阶段**：CGUS V1 Operational Validation 01（Decision Outcome Loop）  
> **iOS 状态**：**已接线**（Action 回写；完整 Review GET / Outcome / Diagnosis 按客户端发版范围）  
> **原则**：对话主链仍走 `route_and_run`；本接口只负责 **决策结果回写与 Trip Review**，不改 CGUS 打分。  
> **SSOT**：`CGUS_V1_OPERATIONAL_VALIDATION_01.md` · `cgus-decision-trace.types.ts`

---

## 0. 先分清两条线

| 场景 | 用什么 | 不要混用 |
|------|--------|----------|
| 对话里选方案（Consent / Decision Support） | `conversation_turn_result` → `decision_options` → `select_decision_option` 或 `POST /api/agent/decisions/:decisionId/select` | 不要当成 Trip Review 的 `user_action` |
| 运营 / 行程后复盘（推荐 vs 实选 vs 结果） | **本文件** ` /api/decision/cgus/trip-review/*` | 点开详情、展开解释、停留时长 **≠** `user_action` |

`override ≠ failure`：用户选了非 Top1，只记 `OVERRIDE`，不要自动标算法错误。

---

## 1. Base / 响应形状

| 项 | 值 |
|----|-----|
| Base | `{HOST}/api` |
| 路径前缀 | `/decision/cgus/trip-review` |
| 响应 | **`{ success, data }`**（与 `route_and_run` 裸 JSON **不同**） |
| Path 参数 | `tripRunId`：**优先** `observability.durable_trip_run_id`；也可用 `trip_id`（DSO 层会 resolve） |
| Query | `decision_id` 可选；省略则用当前 `optimizationHints.cgusDecisionTrace` |

从对话响应取 id：

```text
route_and_run 响应（优先顺序）
  1. observability.cgus_trip_review_v1
     或 payload.conversation_turn_result.cgus_trip_review
     → decision_id / recommended_candidate / ranking_top / trip_run_id_hint
  2. observability.durable_trip_run_id   // 回写 path；与 trip_run_id_hint 同义优先
  3. trip_id                             // DSO resolve 兜底
```

Swift 摘录：

```swift
struct CgusTripReviewRef: Decodable {
    let schema_id: String
    let decision_id: String
    let trip_id: String
    let decision_type: String
    let recommended_candidate: String?
    let ranking_top: [String]
    let top1_margin: Double?
    let trip_run_id_hint: String?
}
```

> V1：**已投影**轻量指针到对话出站：
> - `observability.cgus_trip_review_v1`
> - `result.payload.cgus_trip_review_v1`
> - `result.payload.conversation_turn_result.cgus_trip_review`
>
> 含 `decision_id` / `recommended_candidate` / `ranking_top` / `trip_run_id_hint`。  
> **完整分项对比**仍用 `GET /decision/cgus/trip-review/{id}`。

---

## 2. 接口一览

| Method | Path | 用途 |
|--------|------|------|
| GET | `/:tripRunId?decision_id=` | Trip Review 摘要 |
| POST | `/:tripRunId/action` | OPS-01 用户决策 |
| POST | `/:tripRunId/outcome` | OPS-02 事实结果 + Regret |
| POST | `/:tripRunId/diagnosis` | OPS-03 运营诊断 |

---

## 3. Swift 模型（snake_case / decodeIfPresent）

```swift
import Foundation

// MARK: - Envelope（本接口用 success/data）

struct StandardAPIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: APIErrorBody?
}

struct APIErrorBody: Decodable {
    let code: String?
    let message: String?
}

// MARK: - Enums

enum CgusUserAction: String, Codable {
    case accept = "ACCEPT"
    case override = "OVERRIDE"
    case rejectAll = "REJECT_ALL"
    case noAction = "NO_ACTION"
}

enum CgusDecisionRegret: String, Codable {
    case none = "NONE"
    case low = "LOW"
    case medium = "MEDIUM"
    case high = "HIGH"
    case unknown = "UNKNOWN"
}

enum CgusRootCause: String, Codable {
    case state = "STATE"
    case evidence = "EVIDENCE"
    case feasibility = "FEASIBILITY"
    case utility = "UTILITY"
    case weight = "WEIGHT"
    case ux = "UX"
    case capabilityBoundary = "CAPABILITY_BOUNDARY"
    case none = "NONE"
    case unknown = "UNKNOWN"
}

enum CgusProblematic: String, Codable {
    case no = "NO"
    case yes = "YES"
    case unsure = "UNSURE"
}

// MARK: - GET data

struct CgusTripReviewGetData: Decodable {
    let ok: Bool?
    let traces: [CgusDecisionTrace]?
    let summary: CgusTripReviewSummary?
    let error: String?
}

struct CgusTripReviewSummary: Decodable {
    let decision_id: String
    let trip_id: String
    let decision_type: String
    let recommended_candidate: String?
    let user_action: CgusUserAction?
    let chosen_candidate: String?
    let actual_outcome: CgusActualOutcome?
    let decision_regret: CgusDecisionRegret?
    let recommendation_problematic: CgusProblematic?
    let root_cause: CgusRootCause?
    let review_note: String?
    let score_compare: [CgusScoreCompareRow]
    let is_wrong_recommendation: Bool
}

struct CgusScoreCompareRow: Decodable {
    let candidate_id: String
    let scores: CgusScoreBreakdown
    let is_recommended: Bool
    let is_chosen: Bool
}

struct CgusScoreBreakdown: Decodable {
    let safety: Double?
    let experience: Double?
    let philosophy: Double?
    let risk_penalty: Double?
    let budget_penalty: Double?
    let time_penalty: Double?
    let expected_utility: Double?
    let utility: Double?
}

struct CgusActualOutcome: Codable {
    var completed: Bool
    var safetyIncident: Bool
    var majorDelayMinutes: Int?
    var unexpectedCost: Double?
    var userReportedIssue: String?
}

struct CgusDecisionTrace: Decodable {
    let decision_id: String
    let recommended_candidate: String?
    let user_action: CgusUserAction?
    let chosen_candidate: String?
    // 其余字段按需 decodeIfPresent
}

// MARK: - Write response

struct CgusTripReviewWriteData: Decodable {
    let ok: Bool?
    let persisted: Bool?
    let summary: CgusTripReviewSummary?
    let error: String?
}
```

---

## 4. 调用顺序（产品）

### A. 用户刚做完选择（行程中 / 决策后立刻）

只打 **action**，不要假装有 Outcome：

```http
POST /api/decision/cgus/trip-review/{durable_trip_run_id}/action
Content-Type: application/json

{
  "decision_id": optional,
  "user_action": "ACCEPT" | "OVERRIDE" | "REJECT_ALL" | "NO_ACTION",
  "chosen_candidate": "B",          // OVERRIDE 必填且 ≠ recommended
  "override_reason": "想多看海岸"   // 可选
}
```

映射建议：

| UI | `user_action` | `chosen_candidate` |
|----|---------------|-------------------|
| 「就按 Nara 推荐」 | `ACCEPT` | 可省略（服务端填 recommended） |
| 选了其它候选 | `OVERRIDE` | 该候选 id |
| 「都不合适」 | `REJECT_ALL` | 省略 |
| 关掉且未选 | `NO_ACTION` | 省略 |

**禁止**：把「查看详情 / 展开解释」写成 `ACCEPT`。

### B. 行程日 / 行程结束后补写 Outcome

```http
POST /api/decision/cgus/trip-review/{id}/outcome

{
  "decision_id": "...",
  "actual_outcome": {
    "completed": true,
    "safetyIncident": false,
    "majorDelayMinutes": 0,
    "userReportedIssue": null
  },
  "decision_regret": "NONE"
}
```

注意：`OVERRIDE` + `decision_regret: NONE` 合法（用户改选且结果满意 ≠ 系统错误）。

### C. 运营 Trip Review（可后做，甚至先 Web）

```http
POST /api/decision/cgus/trip-review/{id}/diagnosis

{
  "recommendation_problematic": "NO" | "YES" | "UNSURE",
  "root_cause": "STATE" | ... | "NONE",  // YES 时必填，且不能是 NONE
  "review_note": "……",
  "reviewed_by": "ops@…"
}
```

iOS 用户端 **V1 可不做 Diagnosis**；留给运营台。用户端至少做 **A（action）**，有条件再做 **B（outcome）**。

---

## 5. Trip Review 页该渲染什么

`GET` → `data.summary`：

1. **Nara 推荐** = `recommended_candidate`  
2. **用户选择** = `user_action` + `chosen_candidate`  
3. **实际结果** = `actual_outcome` + `decision_regret`  
4. **对比表** = `score_compare[]`（safety / experience / … / expected_utility）  
5. 运营区（可选）：problematic + root_cause  

不要把算法参数（MC sample、λ、权重学习）铺满一屏。

---

## 6. 最小 Client 伪代码

```swift
final class CgusTripReviewClient {
    let baseURL: URL
    let session: URLSession
    var token: String?

    func review(tripRunId: String, decisionId: String? = nil) async throws -> CgusTripReviewSummary {
        var url = baseURL.appendingPathComponent("decision/cgus/trip-review/\(tripRunId)")
        if let decisionId {
            url = url.appending(queryItems: [.init(name: "decision_id", value: decisionId)])
        }
        let (data, _) = try await session.data(for: authorizedGET(url))
        let env = try JSONDecoder().decode(StandardAPIResponse<CgusTripReviewGetData>.self, from: data)
        guard env.success, let summary = env.data?.summary else {
            throw URLError(.badServerResponse)
        }
        return summary
    }

    func postAction(
        tripRunId: String,
        decisionId: String?,
        action: CgusUserAction,
        chosen: String?,
        reason: String?
    ) async throws -> CgusTripReviewSummary {
        struct Body: Encodable {
            let decision_id: String?
            let user_action: CgusUserAction
            let chosen_candidate: String?
            let override_reason: String?
        }
        // POST .../action → decode StandardAPIResponse<CgusTripReviewWriteData>
        // return data.summary
        fatalError("wire like other StandardAPI clients")
    }
}
```

对话页在用户点选方案后：

```swift
// 1) 若是 Decision Support 卡：先走 select_decision_option（现有主链）
// 2) 额外（运营验证期）：有 cgus_trip_review 时回写 CGUS action
let ref = response.observability?.cgus_trip_review_v1
       ?? response.result?.payload?.conversation_turn_result?.cgus_trip_review
if let runId = ref?.trip_run_id_hint ?? response.observability?.durable_trip_run_id {
    let recommended = ref?.recommended_candidate
    let action: CgusUserAction = (chosenId == recommended) ? .accept : .override
    _ = try await cgusClient.postAction(
        tripRunId: runId,
        decisionId: ref?.decision_id,
        action: action,
        chosen: chosenId,
        reason: nil
    )
}
```

---

## 7. 检查清单

- [ ] 解包用 `{ success, data }`，不是裸 `RouteAndRunResponse`  
- [ ] 从 `cgus_trip_review_v1` / `conversation_turn_result.cgus_trip_review` 取 `decision_id`  
- [ ] Path 优先 `trip_run_id_hint` 或 `durable_trip_run_id`  
- [ ] `OVERRIDE` 时 `chosen_candidate ≠ recommended`  
- [ ] UX 浏览事件不上报为 `user_action`  
- [ ] Outcome 与 Regret 分列；不把 Override 自动写成 HIGH regret  
- [ ] Diagnosis 可留给运营；用户端 V1 至少 Action  

---

## 8. OUT OF SCOPE（iOS 也别顺手做）

- 改 CGUS 权重 / 本地重算 EU  
- 把 Acceptance Rate 当核心 KPI UI  
- 自动 AI Judge root_cause  
