# Matrix v2 / V3.1 Hardening — PR open checklist

**Head tip (pre-merge):** `5d922d8b0` on `feat/v31-engineering-hardening`  
**Base:** `master`  
**Compare:** https://github.com/xudanli/tripnaraht/compare/master...feat/v31-engineering-hardening?expand=1  

**Formal status:** see `evidence/release/v31-agent-interface-hardening/PROCESS_STATUS.md`  
（Engineering COMPLETE · Matrix FROZEN · Delta COMPLETE · PR Approval **PENDING** · Decision **CONDITIONAL_GO** · Coding **NOT REQUIRED**）

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
- Evidence branch tip: 5d922d8b0
- Annotated evidence tag: claim-evidence-matrix-v2.0
- Tag target: c76fff36766e203065bd73e157e19fbf23fb02a7
- Release tag: create after merge only (do not move evidence tag)

## Verification

- 28 suites PASS
- 116 tests PASS
- dangling-import check: exit 0
- freeze-smoke gate: exit 0
- Artifacts: evidence/claim-evidence-matrix-v2/test-runs/

## Explicit exclusions (OUT / DEFER / BLOCKED)

### OUT OF RELEASE SCOPE
- Production Web/iOS protocol compliance conclusions
- Cross-corridor large concurrent writeback guarantees
- Iceland Confirm/Apply
- Mobile Verified Apply
- Iceland/Mobile Rollback
- OR-Tools authoritative Apply
- Global TravelContext SSOT
- Proposal unification
- Microservices / CQRS / GraphQL redesign

### DEFER (not blocking if excluded from marketing)
- C025b Web/iOS shipping compliance
- C024b multi-corridor concurrent write e2e
- C023f Iceland Apply rollback
- C023g Mobile verified-apply rollback

### BLOCKED
- C031 / C026 OR-Tools authoritative Apply
- Global TravelContext SSOT wire
- Proposal unification / microservice-CQRS-GraphQL

## Release readiness pack

- evidence/release/v31-agent-interface-hardening/
- Draft decision: CONDITIONAL_GO (not formal GO yet)

## Required reviewers (GitHub Approve — required)

- Engineering Lead
- Tech Architect
- QA Lead

In-repo SIGNATURES.md APPROVE does **not** replace platform Approve; reviewers must match.

## Post-approve / post-merge

- [ ] EL / TA / QA clicked Approve
- [ ] Required Checks green
- [ ] Merge without unreviewed force-push
- [ ] Fill MERGE_RECORD.md (pr_url, final_merge_commit, approved_by, checks)
- [ ] Tag `v31-agent-interface-hardening-rc1` (or `-release`) on merge commit only
- [ ] Leave `claim-evidence-matrix-v2.0` unchanged
```
