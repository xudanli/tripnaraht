# Contract — ObservationAssessment

**Status:** FROZEN candidate (Q2 / Q8 applied 2026-07-25)  
**UI contract:** four layers — status · whatHappened · impact · recommendation  
**Writeback:** actions open Preview / Navigation / Recapture only; `writesPlanVersion = false`  
**CTA freeze:** [`CTA_AND_ROLES.md`](./CTA_AND_ROLES.md)

---

## Shape

```ts
type AssessmentStatus =
  | 'INFO'
  | 'NOTICE'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'EXECUTION_BLOCK'
  | 'UNKNOWN';

type DecisionProblemKind =
  | 'INFEASIBILITY'
  | 'RISK'
  | 'EXECUTION_DEVIATION'
  | 'DATA_UNCERTAINTY';

/** Q2 — discriminated actions only; no APPLY / EXECUTE / UPDATE_PLAN */
type ObservationAction =
  | { type: 'NAVIGATION'; routeRef: string; label: string }
  | { type: 'PREVIEW'; previewRef: string; label: string }
  | { type: 'ACKNOWLEDGE'; label: string }
  | { type: 'RECAPTURE'; captureInstruction: string; label: string };

interface ObservationAssessment {
  assessmentId: string;
  observationId: string;
  assessmentRevision: number; // Q7 — never overwrite prior revisions
  latestAssessmentRevision?: boolean;

  summary: {
    whatHappened: string;
    impact: string;
    recommendation: string;
  };

  status: AssessmentStatus;

  decisionProblem?: {
    type: DecisionProblemKind;
    semanticKey: string;
    linkedDecisionProblemId?: string;
  };

  evidenceIds: string[];

  actions: ObservationAction[];

  dataFreshness?: {
    roadStatusUpdatedAt?: string;
    weatherUpdatedAt?: string;
    assessedAt: string;
  };

  verificationStatus: VerificationStatus;

  /** Invariant for Look-produced assessments */
  writesPlanVersion: false;

  /** RealityOS §10.4 */
  authority: AssessmentAuthority;

  /** GRD-FR-008 */
  contextHash: string;
}
```

```ts
type AssessmentAuthority =
  | 'VISUAL_ONLY'
  | 'CONTEXT_GROUNDED'
  | 'OFFICIAL_CORROBORATED'
  | 'USER_CONFIRMED'
  | 'PROFESSIONAL_CONFIRMED';
```

`VISUAL_ONLY` must not alone form high-risk “allowed to continue”. `EXECUTION_BLOCK` / `SUGGEST_REPLACE` require ≥ `OFFICIAL_CORROBORATED` or status is downgraded.

---

## Preview routing priority (Q2)

```text
1. Existing DecisionProblem → Decision detail / proposal
2. Repair Preview can express → Repair Preview
3. Arrange UWC can express → Arrange Preview
4. Else → UNSUPPORTED_ACTION_CORRIDOR (RFC; no Look Apply)
```

---

## Status ↔ CTA (summary)

Full bilingual tables: [`CTA_AND_ROLES.md`](./CTA_AND_ROLES.md).

| AssessmentStatus | Primary CTA (zh) | Notes |
|------------------|------------------|-------|
| INFO | 返回今日行程 | + 查看识别依据 |
| NOTICE | 我知道了 | + 查看影响 |
| NEED_CONFIRM | 查看详情 | + 稍后处理 |
| SUGGEST_REPLACE | 查看替代方案 | Keep plan only if still executable |
| EXECUTION_BLOCK | 查看安全方案 | No continue / ignore / keep plan |
| UNKNOWN | 补拍照片 | + 查看已识别内容 |
| CONFLICTING (verification) | 查看冲突证据 | + 稍后重新检查 |
| No GPS degrade | 开启定位后重试 | + 仅查看标志说明 |

Role gate: Member / Advisor **must not** Confirm Apply. Driver needs `CAN_CONFIRM_EXECUTION_CHANGE` + not driving.

---

## Safety rules

| # | Rule |
|---|------|
| 1 | `EXECUTION_BLOCK` cannot be cleared by ACKNOWLEDGE into itinerary write |
| 2 | Formal road/vehicle conclusions require `evidenceIds.length ≥ 1` |
| 3 | `CONFLICTING` ⇒ no deterministic “可以继续进入” |
| 4 | Vision must not assert safety/permission in `recommendation` |
| 5 | Itinerary mutation only via existing Preview → Confirm |
| 6 | No GPS ⇒ no road-based `EXECUTION_BLOCK` / formal road-fit (Q5) |
| 7 | `planVersionWriteCount` from Look path must remain `0` |
