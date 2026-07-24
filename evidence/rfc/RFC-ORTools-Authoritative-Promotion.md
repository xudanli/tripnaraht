# RFC: OR-Tools Authoritative Promotion

| Field | Value |
|-------|--------|
| Status | **INTERNAL_REVIEW — NOT APPROVED** |
| ADR lineage | ADR-008 (Shadow) |
| Current authority | **Shadow only** (`shadowAuthority: false`) |
| Promotion | **Forbidden** until this RFC is approved and canary+kill-switch proven |
| Apply authority | **Not authorized** — lab/compare/metrics only (see EWP-05) |

## 1. Purpose

Keep OR-Tools in **Shadow** for lab/compare. Any elevation of `ortoolsShadow.shadowChanges` (or native solver proposals) to **authoritative plan write** requires completion of this RFC.

This document is **not** an architecture redesign of TripNARA. It gates a single authority promotion path.

## 2. Non-goals

- Microservice split, CQRS, GraphQL, global SSOT, or Proposal unification.
- Silently flipping `shadowAuthority` to true in production without canary + kill switch.

## 3. Current facts (committed)

| Fact | Anchor |
|------|--------|
| Apply uses `selectAuthoritativePlanProposalChanges` → `proposal.changes` only | `ortools-planning-shadow-apply.guard.ts` |
| Leak detector `isOrtToolsPlanningShadowApplyLeak` | same |
| Bridge stamps `shadowAuthority: false` | `ortools-planning-orchestrator-shadow.bridge.ts` |
| Gate matrix row `ortools_shadow` = `shadow_only` | `gate-verify-corridor-audit.matrix.ts` |

## 4. Required coverage before promotion

Any Authoritative Promotion implementation **must** document and test:

| Gate | Requirement |
|------|-------------|
| **Verification** | Pre-write verification equivalent to corridor VERIFY / PlanProposal.validation; no shadow-only apply |
| **Freshness** | Evidence / `contextVersion` / snapshot binding; discard stale shadow attachments |
| **Idempotency** | Stable idempotency key for effective plan write; replay-safe |
| **Rollback** | Documented rollback or compensating write path with audit |
| **Canary** | Whitelist / percentage rollout; dual-run compare vs Neptune/authority |
| **Kill Switch** | Instant env/flag disable returning to Shadow-only; no sticky authority |

## 5. Approval

| Role | Required |
|------|----------|
| Engineering Lead | Approve RFC before any `shadowAuthority` true path ships |
| Tech Architect | Approve Verification/Freshness/Rollback model |
| QA Lead | Approve canary + kill-switch test evidence |

## 6. Default stance

**OR-Tools remains Shadow.** Arrange Apply and related writers must continue to refuse `ortoolsShadow.shadowChanges` as authoritative input until §4 is satisfied and this RFC status becomes **APPROVED**.
