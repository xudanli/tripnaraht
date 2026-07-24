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

## Acceptance (1a)

- [x] Types + registry + gateway committed  
- [x] Contract spec PASS  
- [ ] Handlers bound behind flag (1b)  
- [ ] OCC fields enforced (1c)  
