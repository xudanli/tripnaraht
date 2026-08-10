# ADR-011: Arrange ↔ UWC ↔ DecisionCore Boundary

**Status:** Accepted  
**Date:** 2026-07-25  
**Scope:** Writeback authority for itinerary Arrange vs DecisionCore  
**Related:** ADR-006 (Unified Decision Runtime) · UWC-1e · Agent Harness P0-1  
**Parent status:** [`evidence/work-packages/AGENT-HARNESS-P0/P0-1-STATUS.md`](../../evidence/work-packages/AGENT-HARNESS-P0/P0-1-STATUS.md)

---

## Context

TripNARA now has:

1. **Arrange** — deterministic proposal builders (`AUTO_ARRANGE`, ADD, MOVE, …) with optional `uwcPreview`
2. **UWC-1e** — shared Preview → Confirm → Apply write protocol (Web/iOS)
3. **DecisionCore** — authorize / execute Effective Plan, DecisionLedger, PlanVersion, verification gates

Legacy Arrange `proposals/:id/apply` is blocked under write chain. Same-day MOVE / ADD / from-candidates already complete on **Arrange → UWC** without DecisionCore. Risk remains of:

- losing ledger / PlanVersion / Adjustment audit when Arrange writes “only” itinerary rows
- double-writing via Arrange UWC **and** DecisionCore execute
- claiming full auto-arrange while multi-day / composite paths are still PARTIAL

---

## Decision

### 1. Ordinary deterministic Arrange **may** complete on Arrange → UWC alone

Allowed when **all** hold:

| Condition | Meaning |
|-----------|---------|
| Deterministic | Builder output is fully specified in `changes[]`; no open tradeoff ranking |
| Unbooked / unlocked | No paid, booked, or soft-locked items mutated |
| Corridor admitted | Slice on UWC first-batch / canary allowlist |
| Single atomic Apply | One Confirm → one txn → one durable outcome |
| OCC satisfied | Trip revision and/or PlanVersion expectation holds |

Examples (current RELEASE CANDIDATE): same-day time adjust, same-day ADD, single-day ADD-from-candidates.

### 2. Must escalate to DecisionCore when

| Trigger | Reason |
|---------|--------|
| Risk / hazard / policy conflict | Requires Problem / verification / guardian evaluation |
| Explicit tradeoff among candidates | Needs `DecisionCore.finalize` ranking / selection |
| Booked / paid / external side effects | Outside ITINERARY canary write targets |
| Effective Plan / PlanVersion is the product SSOT for the change | Must go `authorize` → `execute` |
| Verification required (`REQUIRES_VERIFICATION`) | UWC Apply must not bypass |
| Multi-objective repair beyond builder | Neptune / Guardian / RFC-001 paths |

Escalation shape: proposal carries unified triplet (`decisionId`, `planVersionId`, `expectedPlanVersionId`) → slice `unified_plan_version_only` **or** DecisionCore HTTP execute — **not** a second silent itinerary write.

### 3. Durability of DecisionLedger, PlanVersion, Adjustment

| Artifact | Rule |
|----------|------|
| **DecisionLedger** | Required for DecisionCore-escalated paths; Arrange-only UWC **must not** invent fake ledger rows. Optional audit reasonCodes / canary idem map on `Trip.metadata` for Arrange-only. |
| **PlanVersion** | Required when Effective Plan changes via UNIFIED / DecisionCore. ITINERARY canary may advance **trip revision** only; contract must state “revision-only” vs PlanVersion Diff explicitly (M2). |
| **Adjustment records** | Any user-visible adjustment that DecisionCore would have recorded **must** either (a) escalate and record, or (b) be explicitly marked Arrange-local with audit + trace — never drop silently. |

### 4. Dual-path prohibition

Same user Confirm must not:

1. Apply via ITINERARY UWC **and** DecisionCore execute for the same semantic change, or  
2. Chain multiple simple UWC slices to fake one composite (see M2).

### 5. Product claims

| Claim | Allowed when |
|-------|----------------|
| Same-day Arrange on UWC | RELEASE CANDIDATE / after M1 **PRODUCTION CANARY READY** |
| Full auto-arrange itinerary | Only after **M2 PASS** + explicit GO |
| Production Ready (full product) | Separate from M1/M2; remains **NO-GO** until broader gates pass |

---

## Consequences

### Positive

- Clear ship path for deterministic same-day canaries without blocking on DecisionCore
- Escalation criteria prevent silent risk writes
- Audit expectations explicit for revision-only vs PlanVersion paths

### Negative / follow-ups

- M2 contracts must name PlanVersion Diff vs revision-only per action
- Operators must not expand production users before M1 Staging canary PASS
- Arrange → DecisionCore AE “adapter” remains intentionally unimplemented until a path matches this ADR

---

## References

- [`M1-STAGING-MULTI-INSTANCE-CANARY.md`](../../evidence/work-packages/AGENT-HARNESS-P0/M1-STAGING-MULTI-INSTANCE-CANARY.md)
- [`M2-ARRANGE-CORRIDOR-BREADTH.md`](../../evidence/work-packages/AGENT-HARNESS-P0/M2-ARRANGE-CORRIDOR-BREADTH.md)
- ADR-006 Unified Decision Runtime
- UWC-1e: `ops/UWC_1E_API.md`
