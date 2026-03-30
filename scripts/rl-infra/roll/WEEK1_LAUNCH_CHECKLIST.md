# RL Fully Online Week-1 Launch Checklist

This checklist is execution-oriented and maps to the guardrails/workflows already in this repo.

## Day 1 - Environment Baseline

- [ ] Confirm `.env.staging` and `.env.prod` values:
  - `ROLL_STRICT_MODE=true`
  - `ROLL_ALLOW_SIMULATION=false`
  - `ROLL_BRIDGE_TIMEOUT_MS` explicitly set
- [ ] Verify compose overlays exist:
  - `docker-compose.staging.yml`
  - `docker-compose.prod.yml`
- [ ] Run staging strict gate manually once:
  - `.github/workflows/roll-staging-gate.yml`

Exit criteria:

- staging fast/strict gate both green.

## Day 2 - Staging Burn-in Start

- [ ] Trigger `.github/workflows/roll-staging-burnin.yml`
- [ ] Use default `48h`, or reduced dry-run for smoke validation first
- [ ] Ensure artifact upload works (`burnin-summary.jsonl`)

Exit criteria:

- burn-in workflow starts and emits artifact.

## Day 3 - Contract and Error Visibility

- [ ] Confirm bridge contract reference:
  - `BRIDGE_CONTRACT.md`
- [ ] Verify structured events are visible in logs:
  - `bridge_call_success`
  - `bridge_call_failure`
  - `policy_fallback_used` / `policy_fallback_blocked`
  - `simulation_blocked`

Exit criteria:

- events are queryable in log platform.

## Day 4 - Canary Drill

- [ ] Trigger `.github/workflows/roll-canary-release.yml` with:
  - rollout: `new_model_version=v-canary-test`, `traffic_percent=5`
- [ ] Trigger rollback path (`rollback=true`)
- [ ] Download `canary-state` artifact and confirm fields updated

Exit criteria:

- canary rollout + rollback both pass.

## Day 5 - Prod Ramp Gate Rehearsal

- [ ] Trigger `.github/workflows/roll-prod-ramp-gate.yml` with observed metrics
- [ ] Validate threshold behavior:
  - one run should pass
  - one run should fail (intentional bad metric)

Exit criteria:

- gate correctly blocks non-compliant ramp input.

## Day 6 - SRE Drill

- [ ] Run `run-sre-drill.sh` in controlled environment
- [ ] Capture evidence logs and outputs
- [ ] Fill report template:
  - `SRE_ACCEPTANCE_REPORT_TEMPLATE.md`

Exit criteria:

- drill completed and report drafted.

## Day 7 - Go/No-Go Review

- [ ] Review week metrics:
  - real policy rate
  - fallback rate
  - simulation rate
  - p95 latency
  - error rate
- [ ] Final decision:
  - Go canary (10%)
  - Hold and fix

Exit criteria:

- signed Go/No-Go with owners and rollback plan.

## Required Workflow Checks

- `staging-fast-gate`
- `staging-strict-gate`
- `prod-fast-gate`
- `prod-strict-gate`
- `prod-ramp-gate` (manual gate before raise traffic)
