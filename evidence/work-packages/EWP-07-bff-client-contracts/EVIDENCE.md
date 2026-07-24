# EWP-07 — BFF presence & client contract matrix

**Status:** EVIDENCE_COMPLETE  
**Matrix v2 Claims:** C030, C030b  

## 1. Is this repo a BFF?

| Source | Statement |
|--------|-----------|
| `evidence/agent-interface-fact-pack/README.md` | NestJS **BFF/API**; no production client source |
| `openapi.json` | Multiple operations summarized as BFF aggregations |
| `src/main.ts` | Nest API `globalPrefix=api`, service `tripnara-api` |
| Root `README.md` | Full NestJS trip/decision system (not thin-only BFF wording) |

**Fact characterization:** Repo is a **NestJS API backend that also exposes BFF-style aggregation endpoints**. It is not a client monorepo.

## 2. Client contract matrix (backend-defined)

| Client surface | Contract artifact | Transport | Notes |
|----------------|-------------------|-----------|-------|
| Web/iOS Decision Space | `DECISION_SPACE_IOS_HANDOFF.md` | HTTP `/api` | contextHash in Swift samples |
| Web/iOS Arrange | `ARRANGE_ITINERARY_IOS_HANDOFF.md` | HTTP | `contextVersion` |
| Page Insight | `page-ai-contracts.ts` + PAGE_INSIGHT_API | HTTP | local `contextHash` |
| route_and_run delivery | FRONTEND_TRUSTED_DELIVERY / FLAWED | HTTP + optional SSE | delivery_verdict |
| TEP Self-drive | TEP-SELF-DRIVE-FRONTEND-HANDOFF | HTTP | |
| Causal / dual-read | SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF | HTTP | internal |
| TravelContext views | travel-context.controller + client types | HTTP `/api/travel-contexts` | revision-based |
| Reference TS clients | `frontend-*-api-client.ts` | — | samples, not apps |

## 3. Tests

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/bff-client-contract.matrix.spec.ts
```

## 4. Limitations

- BFF label is documentary + OpenAPI tagging; not a separate deployable “BFF-only” package proven here.
- Client adherence remains out of band.
