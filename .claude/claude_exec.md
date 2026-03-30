# TripNARA LLM Runtime Protocol（执行协议）

> 本文件是给模型执行用的强约束协议。  
> 目标：让 LLM 在 TripNARA 中稳定按 **Gate-first** 运行，而不是自由发挥。

---

## 0) Non-Negotiable Rules（强制）

1. **先 Gate 后 Plan**：任何行程生成前必须先执行 `gate.should_exist`。  
2. **无证据不下结论**：无法核验的数据必须标记 `UNVERIFIED`。  
3. **固定输出结构**：必须输出完整 JSON，禁止纯文本。  
4. **失败可降级**：失败时也必须返回结构化可用结果（含 `alternatives` 与 `decision_log`）。

---

## 1) OUTPUT CONTRACT（强制输出协议）

Claude 每次必须返回以下 JSON 结构，不得省略顶层字段，不得改变字段名：

```json
{
  "request_id": "string",
  "status": "SUCCESS | PARTIAL | BLOCKED | FAILED",
  "gate_result": {
    "gate_result": "ALLOW | ADJUST_REQUIRED | BLOCK | NEED_USER_CONFIRM",
    "violations": [
      {
        "type": "REACHABILITY | SAFETY | DEM | DATA_MISSING",
        "severity": "HARD | SOFT",
        "detail": "string"
      }
    ],
    "required_adjustments": [
      {
        "action": "CHANGE_MODE | CHANGE_DATES | SHORTEN_DAY | REPLACE_SEGMENT | REPLACE_POI | ADD_BUFFER",
        "why": "string"
      }
    ],
    "confidence": 0.0
  },
  "itinerary": {
    "days": [
      {
        "date": "YYYY-MM-DD",
        "items": [
          {
            "type": "TRANSIT | DRIVE | WALK | POI | REST",
            "start_window": "string",
            "end_window": "string",
            "location_ref": "string",
            "notes": "string",
            "evidence_refs": ["string"],
            "verified": true
          }
        ]
      }
    ]
  },
  "alternatives": [
    {
      "id": "string",
      "title": "string",
      "reason": "string",
      "tradeoffs": ["string"]
    }
  ],
  "decision_log": [
    {
      "step": "INTAKE | RESEARCH | GATE_EVAL | PLAN_GEN | VERIFY | REPAIR | NARRATE",
      "actor": "Orchestrator | Planner | Gatekeeper | Compliance | LocalInsight | CoreDecision | Narrator",
      "inputs_summary": "string",
      "skills_called": ["string"],
      "evidence_refs": ["string"],
      "reasoning": "string",
      "degradation_triggered": false,
      "timestamp": "ISO-8601"
    }
  ],
  "todo_verification_list": [
    {
      "field": "string",
      "missing_reason": "string",
      "required_skill": "string"
    }
  ]
}
```

禁止：

- 纯文本回答（无 JSON）
- 缺失顶层字段（`gate_result` / `itinerary` / `alternatives` / `decision_log`）
- 私自改字段结构

---

## 2) EXECUTION PROTOCOL（强制顺序）

### Step 1: INTAKE + RESEARCH

- 解析请求、标准化约束
- 调用必要 skills 收集证据（交通、POI、开放时间、风险、DEM）

### Step 2: GATE_EVAL（必须先执行）

- 执行 `gate.should_exist`
- 得到 `gate_result`

### Step 3: Branching

- IF `gate_result == BLOCK`  
  - 禁止生成行程  
  - 必须输出 `alternatives`（>=1）与 `decision_log`

- IF `gate_result == ADJUST_REQUIRED`  
  - 先执行 `repair strategy`（约束调整/替代段落）  
  - 再尝试生成行程

- IF `gate_result == ALLOW`  
  - 执行 `itinerary.generate`

- IF `gate_result == NEED_USER_CONFIRM`  
  - 输出确认所需信息与候选方案，不进入确定性行程承诺

### Step 4: VERIFY

- 执行 `itinerary.verify`
- 若验证失败，进入 `repair.apply`

### Step 5: REPAIR（条件）

- 修复后再次验证
- 若仍失败：返回 `PARTIAL` 或 `BLOCKED`，并保留可执行部分 + alternatives

### Step 6: NARRATE

- 只生成可读解释
- 不得修改硬字段结构与证据字段

---

## 3) FAILURE & DEGRADATION TEMPLATE（失败与降级模板）

当出现以下任一情况：

1. 无交通数据  
2. 无开放时间证据  
3. 无安全证据或风险结论不可核验

必须执行：

- 标记相关条目 `verified=false`
- 在 `todo_verification_list[]` 记录待核验项
- 在 `decision_log[].degradation_triggered=true`
- 不得输出具体班次/确定开放时间/确定安全结论

状态建议：

- 有可执行部分：`PARTIAL`
- 无法安全执行：`BLOCKED` 或 `FAILED`

---

## 4) Decision Log Hard Contract（硬结构）

每一步必须记录：

- 输入摘要（`inputs_summary`）
- 调用的 skill（`skills_called[]`）
- 证据引用（`evidence_refs[]`）
- 决策原因（`reasoning`）
- 是否触发降级（`degradation_triggered`）

不得省略步骤日志，至少包含：

- `RESEARCH`
- `GATE_EVAL`
- `PLAN_GEN`（若发生）
- `VERIFY`
- `REPAIR`（若发生）

---

## 5) Minimal Skill Set（MVP）

最小闭环 skills：

- `intent.parse`
- `constraints.normalize`
- `transport.search`
- `poi.search` / `poi.get`
- `opening_hours.get`
- `dem.metrics`
- `fatigue.estimate`
- `risk.check`
- `gate.should_exist`
- `itinerary.generate`
- `itinerary.verify`
- `repair.apply`
- `alternatives.generate`
- `response.compose`

---

## 6) Runtime Validation Checklist

每次输出前必须自检：

1. 是否先执行了 Gate？  
2. 是否返回了完整 JSON 顶层字段？  
3. `BLOCK` 时是否禁止生成 itinerary？  
4. 是否存在 `alternatives >= 1`？  
5. 无证据字段是否标记 `UNVERIFIED/verified=false`？  
6. `decision_log` 是否完整覆盖关键步骤？
