# Release Readiness Review — V3.1 Agent Interface Hardening

**Status:** READY_TO_CONVENE  
**Release claim:** 智能体接口工程加固基线具备发布评审条件（**非整系统就绪**）  
**Recommended decision draft:** **CONDITIONAL GO** — see [`../release/v31-agent-interface-hardening/RELEASE_READINESS_DECISION.md`](../release/v31-agent-interface-hardening/RELEASE_READINESS_DECISION.md)

## Attendees (suggested)

| Role | Required |
|------|----------|
| 产品负责人 | Yes |
| Tech Architect | Yes |
| Engineering Lead | Yes |
| QA Lead | Yes |
| 运维 / 发布负责人 | Yes |
| Web/iOS 负责人 | Only if this train ships client Apply |
| 研究机构 | No（除非解释 V3.2 Delta 单条 Claim） |

## Agenda (not architecture debate)

1. Freeze **Release Scope** ([RELEASE_SCOPE.md](../release/v31-agent-interface-hardening/RELEASE_SCOPE.md))  
2. Walk Gates 1–5 → confirm **CONDITIONAL GO** conditions  
3. Accept DEFER/BLOCKED as non-blocking **if** exclusions enforced  
4. Sign `RELEASE_READINESS_DECISION.md`  
5. Confirm post-release monitoring + no blanket DEFER reopen  

## Checklist

| Check | Owner | Result |
|-------|-------|--------|
| GitHub PR EL/TA/QA Approve (mirror SIGNATURES) | EL | _pending_ |
| Required Checks green | QA | _pending_ |
| Tag `claim-evidence-matrix-v2.0` → `c76fff367…` | EL | **DONE** |
| Final merge commit recorded | EL | _pending merge_ |
| Release Scope frozen IN/OUT | PO+EL | draft ready |
| Gates 1–5 narrative | TA/QA | draft **GO** / conditional |
| OR-Tools Shadow | TA | **DONE** |
| No unauthorized architecture adds | EL | **DONE** |
| Decision signed CONDITIONAL_GO / NO-GO | PO+EL+TA+QA+Ops | _pending session_ |
