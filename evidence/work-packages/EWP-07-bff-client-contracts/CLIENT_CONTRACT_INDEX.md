# BFF / Client Contract Index (BFF-1)

**Status:** DONE  
**Index SSOT (code):** `src/agent/contracts/bff-client-contract.index.ts`  
**Version:** `1.0.0`  

## OpenAPI pins

| Pin | Value |
|-----|-------|
| Fact-pack OpenAPI generation commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| Generation meta | `evidence/agent-interface-fact-pack/openapi/OPENAPI_GENERATION.txt` |
| Snapshot | `evidence/agent-interface-fact-pack/openapi/openapi.json` (~1839 paths) |
| Critical route_and_run fields | `src/agent/contracts/route-and-run-options.openapi.freeze.ts` |

Index delivery commit = hardening branch tip at merge (does **not** replace v1 freeze).

## Surfaces (summary)

| ID | Surface | Path |
|----|---------|------|
| decision_space_ios | Decision Space | `src/decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md` |
| arrange_ios | Arrange | `src/trips/arrange-itinerary/ARRANGE_ITINERARY_IOS_HANDOFF.md` |
| page_ai_contracts | Page AI | `src/trips/copilot/contracts/page-ai-contracts.ts` |
| page_insight_api | Page Insight API | `src/trips/copilot/PAGE_INSIGHT_API.md` |
| trusted_delivery | Trusted delivery | `src/agent/delivery/FRONTEND_TRUSTED_DELIVERY.md` |
| flawed_draft_delivery | Flawed draft FE | `src/agent/delivery/FRONTEND_FLAWED_DRAFT_DELIVERY.md` |
| tep_self_drive | TEP FE | `internal-docs/frontend/TEP-SELF-DRIVE-FRONTEND-HANDOFF.md` |
| slice4_dual_read_bff | Dual-read BFF | `internal-docs/frontend/SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF.md` |
| travel_context_http | TravelContext HTTP | `src/travel-context/travel-context.controller.ts` |
| travel_context_client_types | TravelContext types | `src/travel-context/client/travel-context-api.types.ts` |
| sample_arrange_client | Arrange sample client | `src/trips/arrange-itinerary/dto/frontend-arrange-itinerary-api-client.ts` |
| sample_page_insight_client | Page Insight sample | `src/trips/copilot/dto/frontend-page-insight-api-client.ts` |
| fact_pack_openapi | OpenAPI snapshot | fact-pack `openapi/openapi.json` |
| route_and_run_options_freeze | Options field freeze | `route-and-run-options.openapi.freeze.ts` |

## Limitations

- Index proves **backend contract artifacts exist**; not shipping Web/iOS compliance (C025b).
- Repo remains NestJS BFF/API, not a client monorepo.

## Tests

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/bff-client-contract.index.spec.ts \
  src/agent/contracts/bff-client-contract.matrix.spec.ts
```
