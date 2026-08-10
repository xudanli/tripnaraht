# UWC-01 SCOPE

## IN

- `AuthoritativeWriteCommand` / `AuthoritativeWriteResult` / shared error codes  
- `WriteTarget` profiles for ITINERARY_ADJUST, UNIFIED_EXECUTE, ACTIONS_COMMIT  
- Lightweight `AuthoritativeWriteGateway` (validate + optional handler)  
- Contract tests aligned to `WRITEBACK_CORRIDOR_AUDIT_MATRIX`  
- Explicit Preview → Confirm → Apply outcome vocabulary  
- Three frozen corridor canaries (ACTIONS → ITINERARY → UNIFIED PlanVersion-only)  

## OUT / FORBIDDEN

- Global TravelContext SSOT  
- Proposal unification  
- Microservice / CQRS / GraphQL  
- OR-Tools authoritative Apply  
- Iceland / Mobile writeback expansion  
- External commercial compensation (hotel / activity / car)  
- Collapsing mixed writers into one store  
- Expanding canary admission beyond frozen scopes  
- One-shot global AUTHORITATIVE / compensation unlock when canaries pass  

## Acceptance

### Contract layers (code)

- [x] Types + registry + gateway  
- [x] Handlers bound; SHADOW_VALIDATE default; AUTHORITATIVE hard-blocked  
- [x] OCC + recovery contract; compensation exec gate closed  
- [x] UWC-CANARY-01/02/03 **code complete + FROZEN**  

### Ops (ordered — do not skip)

- [ ] ACTIONS canary pass → `advanceCutoverAfterActionsCanaryPass()`  
- [ ] ITINERARY independent review → `beginItineraryAdjustCanary()` → pass → `advanceCutoverAfterItineraryCanaryPass()`  
- [ ] UNIFIED → `approveUnifiedExecuteForCanary()` → env (percent 0 + trip allowlist) → `beginUnifiedExecuteCanary()` → pass → `advanceCutoverAfterUnifiedCanaryPass()`  

### After all three canaries

- [x] Global AUTHORITATIVE still LOCKED  
- [x] Compensation exec still LOCKED  
- [x] **UWC-CUTOVER-01** D1/D2/D3 APPROVED — not global unlock  
- [x] **UWC-1e** client protocol FROZEN (`UWC-1e.md`)  

See `PROCESS_STATUS.md` and `CANARY_OPS_RUNBOOK.md`.
