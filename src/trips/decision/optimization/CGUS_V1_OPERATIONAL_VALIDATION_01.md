# CGUS V1 Operational Validation 01 — Decision Outcome Loop

> **阶段名**：CGUS V1 Operational Validation — Decision Outcome Loop  
> **Sprint 名**：CGUS V1 Operational Validation 01（**不是** CGUS Phase 3）  
> **核心问题**：CGUS 在真实旅行里，有没有帮助用户做出更好的决定？  
> **非问题**：CGUS 有没有实现图 13 的全部公式？

## 目标

让每一次真实 Trip 都能回答：

**Nara 推荐了什么 → 用户最后做了什么 → 实际结果怎样 → 如果错了，错在哪一层。**

完整链：

```
Decision Input → CGUS Search → Candidate Set → Feasibility
  → Utility Breakdown → Ranking → Recommendation
  ────────── 决策发生 ──────────
  → User Action → Chosen Candidate → Execution
  → Actual Outcome → Trip Review → Root Cause
```

## 三张票（本 Sprint 仅此）

| Ticket | 内容 | 代码落点 |
|--------|------|----------|
| **OPS-CGUS-01** Decision Action Capture | `user_action` / `chosen_candidate` | `applyCgusUserActionWriteback` → `POST .../action` |
| **OPS-CGUS-02** Outcome / Regret Writeback | `actual_outcome` / `decision_regret` | `applyCgusOutcomeWriteback` → `POST .../outcome` |
| **OPS-CGUS-03** Trip Review Diagnosis | `root_cause` / `review_note` / `reviewed_*` | `applyCgusTripReviewDiagnosis` → `POST .../diagnosis` |

### HTTP（已接线）

Base：`/decision/cgus/trip-review`

| Method | Path | 说明 |
|--------|------|------|
| GET | `/:tripRunId?decision_id=` | 读 Summary（推荐 vs 选择 vs Outcome） |
| POST | `/:tripRunId/action` | OPS-01 |
| POST | `/:tripRunId/outcome` | OPS-02 |
| POST | `/:tripRunId/diagnosis` | OPS-03 |

持久化：`DecisionKernelService.writeCgusDecisionOutcomeLoop` → DSO  
`optimizationHints.cgusDecisionTrace` + `systemState.cgusDecisionTraceLog`

类型契约：`cgus-decision-trace.types.ts`  
回写纯函数：`cgus-decision-outcome-loop.util.ts`  
DSO 投影：`cgus-trip-review.util.ts`  
控制器：`controllers/cgus-trip-review.controller.ts`

## 硬规则

1. **`override ≠ failure`** — 单独 Override 不足以立项；需要 evidence + diagnosed root cause。
2. **`recommended_candidate` 与 `chosen_candidate` 必须分离** — OVERRIDE 时二者不同。
3. **UX 行为不是决策结果** — 点开详情 / 展开解释 / 停留时长 ≠ `user_action`。
4. **Outcome ≠ Regret** — Override 后 Outcome 良好且 Regret=NONE 是合法组合。
5. **不自动 AI Judge** — 运营人工勾选 problematic + root_cause。

## user_action（V1）

| Action | 含义 |
|--------|------|
| `ACCEPT` | 采用 CGUS Top1 |
| `OVERRIDE` | 选择其他 candidate |
| `REJECT_ALL` | 所有方案都不要 |
| `NO_ACTION` | 未形成实际决策 |

## root_cause（冻结枚举）

`STATE` | `EVIDENCE` | `FEASIBILITY` | `UTILITY` | `WEIGHT` | `UX` | `CAPABILITY_BOUNDARY` | `NONE` | `UNKNOWN`

- **FEASIBILITY**：最高优先（可行性判错）
- **CAPABILITY_BOUNDARY**：防止「一失败就给 CGUS 加功能」
- **WEIGHT**：仅维度都对但权重系统性错时，才讨论 L5

## 解冻门（EU / L5）

| 模块 | 解冻条件（全部满足才可立项） |
|------|------------------------------|
| EU-200 / 300 / 500 | 重复 Wrong Ranking + `root_cause=UTILITY` + 现有机制无法修 + 重复案例 |
| L5 Weight | 多 Trip + 分项正确 + 排序持续错 + 根因反复 `WEIGHT` + 书面授权 |

## 运营指标（建议）

- Decision Success = Successful Assisted Decisions ÷ CGUS 参与决策数  
- Serious Regret = `decision_regret=HIGH` 计数  
- Wrong Recommendation = problematic=YES 且 root ∈ {FEASIBILITY, UTILITY, WEIGHT}  
- Override Diagnosis 分布（Normal Preference / State / …）  
- Unknown Rate = UNKNOWN ÷ reviewed  

**不把 Recommendation Acceptance Rate 当核心 KPI。**

## OUT OF SCOPE（明确禁止顺手做）

除非真实 Trip 已产生对应 Evidence：

- × EU-200 formula expansion  
- × EU-300 philosophy model  
- × Budget optimization  
- × Learned weight injection / automatic weight tuning  
- × new candidate generation strategy  
- × CGUS architecture refactor / scoring model redesign  

## 完成后状态

Trip Review 回写可用后，CGUS V1 进入：

> **除 Incident / 真实错误证据外，不主动开发。**

**进度**：后端 OPS-01/02/03 + 对话出站 ref **完成**；**iOS 已接线**。待办转为真实 Trip 数据与运营 Diagnosis（可 Web）。

不再以「审架构 / 补公式」推进。
