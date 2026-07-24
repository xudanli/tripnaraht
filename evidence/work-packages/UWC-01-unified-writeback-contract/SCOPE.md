# UWC-01 SCOPE

## IN

- `AuthoritativeWriteCommand` / `AuthoritativeWriteResult` / shared error codes  
- `WriteTarget` profiles for ITINERARY_ADJUST, UNIFIED_EXECUTE, ACTIONS_COMMIT  
- Lightweight `AuthoritativeWriteGateway` (validate + optional handler)  
- Contract tests aligned to `WRITEBACK_CORRIDOR_AUDIT_MATRIX`  
- Explicit Preview → Confirm → Apply outcome vocabulary  

## OUT / FORBIDDEN

- Global TravelContext SSOT  
- Proposal unification  
- Microservice / CQRS / GraphQL  
- OR-Tools authoritative Apply  
- Iceland / Mobile writeback expansion  
- External commercial compensation (hotel / activity / car)  
- Collapsing mixed writers into one store  

## Acceptance (1a / 1b)

- [x] Types + registry + gateway committed  
- [x] Contract spec PASS  
- [x] Handlers bound (ACTIONS → ADJUST → UNIFIED)  
- [x] Default mode SHADOW_VALIDATE; zero writes  
- [x] AUTHORITATIVE hard-blocked until UWC-1c  
- [x] Per-corridor DISABLED kill switch  
- [x] Shadow/legacy diffs auditable (`getShadowProbeAuditEntries`)  
- [x] OCC ExpectedWriteVersion + per-corridor strategies (1c)  
- [x] Idempotency before freshness → ALREADY_APPLIED  
- [x] Cross-corridor concurrency proofs (≤1 success)  
- [x] AUTHORITATIVE still blocked (dual gates; switch auth false)  
- [x] UWC-1d recovery layers + profiles + COMPENSATION_CONFLICT  
- [x] Compensation exec gate closed; Cutover: ACTIONS canary first  
- [ ] ACTIONS_COMMIT Canary review (no auto-unlock of other corridors)  
