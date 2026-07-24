# DEFER / BLOCKED registry — Matrix v2

**Baseline tip:** `bc6e2e6d5a087a6a20c47576ebdba295370ebec1`  
**Rule:** Items here are **not** authorized work during Matrix v2 freeze. Reopen only via listed Trigger.

| ID | Gate | Claim(s) | Owner | Release Impact | Reopen Trigger |
|----|------|----------|-------|----------------|----------------|
| CTX-global-SSOT | **BLOCKED** | C021, C021b | Tech Architect | Would change runtime SSOT; high blast radius across route_and_run | Signed RFC for TravelContext main-chain wire + EL approve |
| Multi-corridor concurrent write e2e | **DEFER** | C024b | QA Lead | Missing proof of cross-corridor isolation under load; does not block Shadow-only release | Product asks for shared-trip multi-writer SLA **or** incident proves cross-corridor race |
| Shipping Web/iOS compliance | **DEFER** | C025b | Engineering Lead (Client) | Cannot assert FE correctness from this repo | External client-repo review pack attached to a Claim ID |
| Iceland Apply rollback | **DEFER** | C023f | Eng Lead (Iceland) | Unknown compensation for committed Iceland apply | Iceland apply in freeze tree + rollback path + tests |
| Mobile verified-apply rollback | **DEFER** | C023g | Eng Lead (Mobile) | Unknown compensation for mobile verified apply | Mobile verified-apply HTTP + rollback evidence |
| OR-Tools authoritative Apply | **BLOCKED** | C026, C031, C023h | Tech Architect | Authority flip without gates risks bad plan writes | RFC APPROVED + Verification/Freshness/Idempotency/Rollback/Canary/Kill Switch evidence |
| Microservice / CQRS / GraphQL / Proposal unification | **BLOCKED** | (prohibited) | Tech Architect | Architecture mega-refactor | Explicit new research RFC after V3.2 Delta + Release Readiness |
| Actions stub → real compensation | **DEFER** | C023b | Eng Lead (Actions) | Clients may misread HTTP 200 as compensated | Product decision to implement compensation **or** forever-stub FE contract |
| New architecture capability (freeze window) | **BLOCKED** | C035 / prohibited | Engineering Lead | Contaminates baseline | Matrix v2 signed + V3.2 Delta complete + Release Readiness Review opens work |

## Owners (role defaults)

| Role | Default Owner label |
|------|---------------------|
| Engineering Lead | EL |
| Tech Architect | TA |
| QA Lead | QA |

Update this table when ownership is reassigned; do not delete rows—mark `closed_via` Claim if resolved.
