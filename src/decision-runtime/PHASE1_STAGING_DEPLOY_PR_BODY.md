# PR: [Staging] Canonical Authority Phase 1 — `EFFECTIVE_PLAN_WRITE_GUARD=SHADOW`

> **用法**：`gh pr create --title "..." --body-file src/decision-runtime/PHASE1_STAGING_DEPLOY_PR_BODY.md`  
> **Playbook**：`CANONICAL_AUTHORITY_AUDIT.md` §13 · **Env**：`.env.canonical-authority-staging.example`

## Summary

- Enable **Phase 1** of the Canonical Authority production ramp on **staging only**.
- Set `EFFECTIVE_PLAN_WRITE_GUARD=SHADOW` to establish write-guard observability baseline before Phase 2 `ENFORCE`.
- **No ingress / Gateway flag changes** in this PR (`CONSTRAINT_GATEWAY_MODE` stays `OFF` or unchanged).
- P0 egress guards remain **`ENFORCE`** (Legacy / Async / Agentic mutation commit guards).
- Branch includes **ingress observability prep**: SM VERIFY constraint evaluations attach `constraint_gateway_ingress_v1` and merge `evaluationId` into `authority_audit_v1` when gateway runs inside the request scope.

## What changes

| Surface | Change |
|---------|--------|
| Staging env / Secret | `EFFECTIVE_PLAN_WRITE_GUARD=SHADOW` |
| Application code | **None required for Phase 1 deploy** (guard + ops + ingress audit already in branch) |
| Production | **Untouched** |

### Staging env block (copy-paste)

```bash
# Canonical Authority — Phase 1 (see .env.canonical-authority-staging.example)
LEGACY_MUTATION_WRITE_GUARD=ENFORCE
ASYNC_MUTATION_WRITE_GUARD=ENFORCE
AGENTIC_MUTATION_WRITE_GUARD=ENFORCE
EFFECTIVE_PLAN_WRITE_CHAIN=1
RFC001_SHADOW_MODE=0

EFFECTIVE_PLAN_WRITE_GUARD=SHADOW
```

## Behavior under SHADOW

- `EffectivePlanWriteGuardService.assertSetEffectiveAllowed()` **does not throw** when `setEffective` runs outside `execute`/`rollback` authority.
- SHADOW bypasses are **logged** (`[EffectivePlanWriteGuard:SHADOW]`) and queryable via `GET /ops/runtime/write-chain/shadow-bypasses`.
- **Purpose of Phase 1**: wire flag on staging, validate deploy pipeline, record **baseline metrics** before Phase 2 hard block.
- **P0 mutation guards** (route_and_run response layer) remain **ENFORCE** — Legacy/Async/Agentic silent writes still blocked.

## Pre-deploy checklist

- [ ] `npm run harness:authority` green on CI (67+ tests)
- [ ] Staging currently on commit that includes Authority Sprint artifacts (Gateway audit, mutation guards, replay strict seal, status V2 attach, ingress audit)
- [ ] Rollback owner assigned (Platform / Decision Runtime on-call)
- [ ] Baseline dashboard or log slice ready for `authority_gateway_v1.conclusion`

## Post-deploy verification (staging)

### 1. Ops status — write chain mode

```bash
curl -s "$STAGING_BASE/api/decision-runtime/ops/write-chain" | jq .
# Expect: .effectivePlanWriteGuardMode == "SHADOW"
# Expect: .writeChainEnabled == true
# Expect: .legacyMutationGuardMode == "ENFORCE"
# Expect: .effectivePlanWriteGuardShadowBypassTotal >= 0
```

### 2. SHADOW bypass ring buffer (after write-path traffic)

```bash
curl -s "$STAGING_BASE/api/decision-runtime/ops/write-chain/shadow-bypasses?limit=20" | jq .
```

### 3. Authority harness (optional smoke on staging runner)

```bash
npm run harness:authority
```

### 4. Observability sampling (24–48h)

Collect on **write-path** `route_and_run` / decision apply traffic:

| Field | Baseline action |
|-------|-----------------|
| `observability.authority_gateway_v1.conclusion` | Record % `BYPASS` / `PARTIAL` / `READ_ONLY` |
| `observability.authority_audit_v1.constraintGateway.evaluationId` | Count non-null on SM write paths |
| `observability.constraint_gateway_ingress_v1.primary.phase` | Expect `VERIFY` when gateway ran in SM |
| `observability.result_status_v2` | Four-axis status attached at gateway exit |
| `observability.authority_audit_v1.bypassDetected` | Count true on mutation intent |
| Trip adjust / apply-repair error rate | Compare to pre-deploy 7d avg |

### 5. Regression spot checks

- [ ] Iceland decision center: F208 road-close still surfaces BLOCK + repair candidates
- [ ] `POST .../decision-problems/:id/apply` (canonical path) still succeeds
- [ ] `replay_from_trace`: `replay_strict_seal_v1.sealed=true`, no `fallback_used`

## Go / No-Go (hold ≥ 3 business days before Phase 2)

| Criterion | Target |
|-----------|--------|
| Staging error rate (5xx / trip adjust) | ≤ pre-deploy baseline + 0.5% |
| Unexpected `setEffective` bypass sources | Documented or ticketed (via shadow-bypasses endpoint) |
| `authority_gateway_v1.conclusion=BYPASS` on write paths | Baseline recorded |
| User reports of silent itinerary mutation | **0** new |
| Harness authority | green on release commit |

## Rollback

```bash
# Staging only — remove or set:
EFFECTIVE_PLAN_WRITE_GUARD=OFF
# Redeploy staging; verify ops endpoint shows effectivePlanWriteGuardMode=OFF
```

**Do not** roll back P0 guards (`LEGACY_MUTATION_WRITE_GUARD`, etc.) unless separate incident.

## Out of scope (follow-up PRs)

- Phase 2: `EFFECTIVE_PLAN_WRITE_GUARD=ENFORCE` on staging
- Phase 3: `CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE`
- Production env changes
- status_v2 assembler / three-persona runtime refactor

## References

- `src/decision-runtime/CANONICAL_AUTHORITY_AUDIT.md` §13 Rollout Playbook
- `.env.canonical-authority-staging.example`
- `npm run harness:authority`
