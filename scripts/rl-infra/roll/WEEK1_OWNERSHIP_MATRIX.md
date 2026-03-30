# RL Fully Online Week-1 Ownership Matrix

This matrix maps Week-1 tasks to owners, deliverables, and acceptance criteria.

## 1) Backend Owner

Scope:

- Runtime contract implementation in Nest service layer
- Error classification and structured event emission
- Fallback behavior correctness

Tasks:

- [ ] Validate `RollClientService` contract handling and timeout behavior
- [ ] Validate `RollPolicyAdapterService` fallback gates
- [ ] Confirm all required `roll_event` logs are emitted

Deliverables:

- Runtime verification note with sample logs
- Confirmed error-code mapping (`TIMEOUT/HTTP_4XX/HTTP_5XX/WORKER_UNAVAILABLE/UNKNOWN`)

Acceptance:

- No simulation path in staging/prod
- Structured logs present and searchable

## 2) RL-Infra Owner

Scope:

- Bridge + Ray worker availability
- Compose overlays and env consistency
- Burn-in execution and artifact generation

Tasks:

- [ ] Verify staging/prod env baselines
- [ ] Execute staging burn-in workflow
- [ ] Confirm worker status endpoint stability during burn-in

Deliverables:

- `burnin-summary.jsonl` artifact
- Availability summary (uptime, worker readiness)

Acceptance:

- Burn-in workflow completes
- `simulation_rate=0` during burn-in

## 3) SRE Owner

Scope:

- Production guardrails and ramp gate
- Drill execution (rollback, guardrail, incident path)
- Alertability and operational readiness

Tasks:

- [ ] Run prod guardrails workflow
- [ ] Run prod ramp gate rehearsal (pass + fail cases)
- [ ] Run `run-sre-drill.sh` and capture evidence

Deliverables:

- Drill output evidence
- Alert routing validation note

Acceptance:

- Guardrail and ramp gate both behave as expected
- Rollback path validated

## 4) Product / Decision Owner

Scope:

- Go/No-Go governance
- Success metric definition and business readiness

Tasks:

- [ ] Confirm KPI thresholds for rollout approval
- [ ] Review Week-1 KPI panel and burn-in outputs
- [ ] Host final Go/No-Go review

Deliverables:

- Signed release decision
- Risk register update

Acceptance:

- Decision recorded with owner sign-off
- Rollback trigger conditions clearly documented

## 5) Shared KPI Board (Required in Review)

- Real policy rate
- Fallback rate
- Simulation rate
- P95 latency
- Error rate

## 6) Final Week-1 Exit Gate

- [ ] `staging-fast-gate` green
- [ ] `staging-strict-gate` green
- [ ] burn-in completed with artifact
- [ ] canary rollout/rollback drill completed
- [ ] `prod-fast-gate` green
- [ ] `prod-strict-gate` green
- [ ] `prod-ramp-gate` behavior verified
- [ ] SRE acceptance template drafted
