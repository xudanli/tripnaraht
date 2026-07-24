# Matrix v2 / V3.1 Hardening — PR open checklist

**Head:** `feat/v31-engineering-hardening` @ `c1b7df504`  
**Base:** `master`  
**Compare:** https://github.com/xudanli/tripnaraht/compare/master...feat/v31-engineering-hardening?expand=1  

## Title

`V3.1 Agent Interface Hardening + Claim Evidence Matrix v2 Freeze`

## Body (paste)

```markdown
## Scope

- V3.1 engineering hardening
- EWP-01–07 evidence packages
- WB-1 / RB-1 / CC-1 / BFF-1 / CTX-1
- CLAIM_EVIDENCE_MATRIX_v2.0 frozen
- V3.2 Delta Assessment complete

## Engineering baseline

- Implementation baseline: bc6e2e6d5a087a6a20c47576ebdba295370ebec1
- Evidence branch tip: e33e214c4308d60e5a43de84c3595556355555c6
- Annotated tag: claim-evidence-matrix-v2.0
- Tag target: c76fff36766e203065bd73e157e19fbf23fb02a7

## Verification

- 28 suites PASS
- 116 tests PASS
- dangling-import check: exit 0
- freeze-smoke gate: exit 0
- Artifacts: evidence/claim-evidence-matrix-v2/test-runs/

## Explicit exclusions

- No OR-Tools authoritative Apply
- No global TravelContext SSOT
- No Proposal unification
- No microservices / CQRS / GraphQL redesign
- No production Web/iOS compliance claim
- No Iceland/Mobile Apply rollback claim

## Release readiness pack

- evidence/release/v31-agent-interface-hardening/ (SCOPE, DECISION=CONDITIONAL_GO, LIMITATIONS, MONITORING)

## Required reviewers

- Engineering Lead
- Tech Architect
- QA Lead

## Post-approve checks

- [ ] EL / TA / QA clicked Approve (mirror SIGNATURES.md)
- [ ] Required Checks green
- [ ] tag object matches Matrix record
- [ ] After merge: record final merge commit; no unreviewed force-push
```

## Note

`gh` may be unauthenticated — use Compare URL above. In-repo Matrix SIGNATURES already APPROVE; GitHub UI completes the governance chain.
