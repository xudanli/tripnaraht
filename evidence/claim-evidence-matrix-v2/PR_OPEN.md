# Matrix v2 / EWP — PR notes

**Head branch:** `feat/v31-engineering-hardening`  
**Contents:** V3.1 hardening + EWP-01…07 + Matrix v2 DRAFT + Post-EWP Decision Gate + OR-Tools RFC INTERNAL_REVIEW  

## Title
`evidence: EWP-01…07 + Matrix v2 DRAFT + Post-EWP decision gate`

## Body (paste)

```markdown
## Summary
- Seven Evidence Work Packages with real paths, contract tests, limitations, Claim IDs
- CLAIM_EVIDENCE_MATRIX v2.0 DRAFT (additive; v1 remains FROZEN / research-approved)
- Post-EWP Decision Gate: OPEN_SCOPED_TASK / DEFER / BLOCKED — no mega-refactor
- OR-Tools RFC: INTERNAL_REVIEW, Shadow only, Apply not authorized

## Test plan
- [x] `LLM_USE_MOCK=true npx jest --runInBand --forceExit` EWP batch (see `evidence/work-packages/_shared/RESULTS.md`) — 11 suites / 34 PASS
- [ ] EL / TA / QA sign `evidence/claim-evidence-matrix-v2/SIGNATURES.md`
- [ ] File only OPEN_SCOPED_TASK tickets after gate sign-off

## Non-goals
- Global SSOT / Proposal unification / OR-Tools authority / microservice-CQRS-GraphQL
```

## Note
Until Matrix v2 SIGNATURES APPROVE, research must continue citing **v1** Claim IDs only.
