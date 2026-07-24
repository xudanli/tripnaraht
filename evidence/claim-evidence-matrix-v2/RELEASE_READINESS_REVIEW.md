# Release Readiness Review — checklist

**Status:** READY_TO_CONVENE (V3.2 Delta COMPLETE)  
**Prerequisite met:** Matrix v2 SIGNATURES APPROVE + [`V32_DELTA_ASSESSMENT.md`](./V32_DELTA_ASSESSMENT.md)  

| Check | Owner | Result |
|-------|-------|--------|
| Delta Assessment complete (Claim IDs only) | TA | **DONE** — see V32_DELTA_ASSESSMENT.md |
| DEFER/BLOCKED impacts accepted for this release | EL | _pending session_ |
| Regression `test-runs/` still green on baseline tag | QA | **DONE at freeze** — reconfirm on tag `claim-evidence-matrix-v2.0` in session |
| OR-Tools remains Shadow | TA | **DONE** — C026 / C031 |
| No unauthorized architecture capability adds | EL | **DONE** — freeze window STOPPED |
| Go / No-Go | EL+TA+QA | _pending session_ |

## Suggested session agenda

1. Walk remediations C018R / C001 / C005E  
2. Accept DEFER rows as known release gaps (or reopen via Trigger)  
3. Reaffirm BLOCKED (OR-Tools Apply, global SSOT)  
4. Record Go/No-Go and any release notes Claim IDs
