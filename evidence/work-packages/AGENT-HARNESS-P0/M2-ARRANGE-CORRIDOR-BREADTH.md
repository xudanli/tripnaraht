# M2 — Arrange Corridor Breadth Expansion

**Date opened:** 2026-07-25  
**Status:** **PASS** (steps 1–5 complete; product still NO-GO pending separate GO)  
**Parent:** [`P0-1-STATUS.md`](./P0-1-STATUS.md)  
**Boundary ADR:** [`ADR-011-Arrange-UWC-DecisionCore-Boundary.md`](../../../internal-docs/architecture/ADR-011-Arrange-UWC-DecisionCore-Boundary.md)

---

## Goal

Extend Arrange → UWC beyond same-day MOVE / ADD / from-candidates so **Full Arrange** can leave **PARTIAL**, without simulating composites via chained simple corridors.

---

## Suggested order

| Step | Action | Notes |
|------|--------|-------|
| 1 | **REMOVE** | **PASS** — [`P0-1-ARRANGE-REMOVE-UWC-SLICE.md`](./P0-1-ARRANGE-REMOVE-UWC-SLICE.md) · [`m2-contracts/REMOVE.md`](./m2-contracts/REMOVE.md) |
| 2 | **REORDER** | **PASS** — [`P0-1-ARRANGE-REORDER-UWC-SLICE.md`](./P0-1-ARRANGE-REORDER-UWC-SLICE.md) · [`m2-contracts/REORDER.md`](./m2-contracts/REORDER.md) |
| 3 | **MOVE+ADD atomic composite** | **PASS** — [`P0-1-ARRANGE-MOVE-ADD-UWC-SLICE.md`](./P0-1-ARRANGE-MOVE-ADD-UWC-SLICE.md) · [`m2-contracts/MOVE_AND_ADD.md`](./m2-contracts/MOVE_AND_ADD.md) |
| 4 | **REDUCE_INTENSITY** | **PASS** — [`P0-1-ARRANGE-REDUCE-INTENSITY-UWC-SLICE.md`](./P0-1-ARRANGE-REDUCE-INTENSITY-UWC-SLICE.md) · [`m2-contracts/REDUCE_INTENSITY.md`](./m2-contracts/REDUCE_INTENSITY.md) |
| 5 | **Multi-day AUTO_ARRANGE** | **PASS** — [`P0-1-ARRANGE-MULTI-DAY-AUTO-ARRANGE-UWC-SLICE.md`](./P0-1-ARRANGE-MULTI-DAY-AUTO-ARRANGE-UWC-SLICE.md) · [`m2-contracts/MULTI_DAY_AUTO_ARRANGE.md`](./m2-contracts/MULTI_DAY_AUTO_ARRANGE.md) |

---

## Mandatory contract per action

Before coding each step, freeze a slice contract with **all** of:

| Field | Requirement |
|-------|-------------|
| Preview I/O | Request shape + `uwcPreview` / draft fields |
| Authoritative Action Type | Canary `operation` / UWC `slice` id |
| Affected entities | Trip, ItineraryItem, candidates, PlanVersion, … |
| OCC version condition | `RESOURCE_VERSION_SET` and/or `PLAN_VERSION` |
| VERIFY pre/post | What must be true before Apply / after commit |
| Confirm Token | Sealed confirmation; immutable fields |
| Atomic transaction boundary | Single DB txn (or documented 2PC equivalent) |
| Compensation behavior | On abort / authorized compensating path |
| PlanVersion Diff | Diff payload or explicit “revision-only” for ITINERARY canary |
| Idempotency semantics | Key scope; replay vs conflict |
| Audit + Trace | `requestId`, `traceId`, corridor audit row |

Template file per action:  
`evidence/work-packages/AGENT-HARNESS-P0/m2-contracts/<ACTION>.md`

---

## Hard rules — composites

| Rule | Enforcement |
|------|-------------|
| One Preview → one Confirm → **one atomic Apply** → **one PlanVersion** | Admit + executor reject partial / multi-stage client fan-out |
| **Must not** emulate composite by sequencing simple corridors | Protocol + CI / contract tests |
| Multi-day AUTO_ARRANGE is **all-or-nothing** | Single txn across days; fail → zero days written |

---

## DecisionCore escalation

Ordinary deterministic Arrange may complete on Arrange → UWC alone (ADR-011).  
Escalate to DecisionCore when risk / conflict / tradeoff / verification gates require ledgered decisions.  
M2 slices that touch booked/paid/locked or policy tradeoffs **must** declare escalate-or-reject in the action contract.

---

## Exit criteria (Full Arrange beyond PARTIAL)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Steps 1–5 each have frozen contract + tests + evidence | **PASS** |
| 2 | Composite rules verified (no corridor chaining) | **PASS** |
| 3 | Multi-day AUTO_ARRANGE atomicity proven | **PASS** |
| 4 | ADR-011 alignment reviewed | **PASS** (revision-only ITINERARY; dual-path ban enforced in admit) |
| 5 | Product may claim “full Arrange on UWC” only after explicit GO | OPEN (await GO) |

M2 PASS does **not** auto-flip full product to Production Ready (UWC breadth elsewhere, Iceland/Mobile, etc. may remain).

---

## Out of scope until explicit auth

- Iceland / Mobile writeback  
- Client auto-undo  
- Global corridor AUTHORITATIVE expansion beyond canary  
- Silent Arrange → DecisionCore AE HTTP adapter without ADR-011 path
