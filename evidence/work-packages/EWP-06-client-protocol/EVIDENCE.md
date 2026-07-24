# EWP-06 — Web / iOS client protocol compliance

**Status:** EVIDENCE_COMPLETE (backend-contract only)  
**Matrix v2 Claims:** C025, C025b  

## 1. Facts

| Fact | Evidence |
|------|----------|
| No production React/Swift/Kotlin app in this repo | 0 `.swift`; FRONTEND_INSIGHT_CARD.md L3; evidence pack README |
| Protocol defined via handoffs + Page AI contracts + frontend-*-api-client.ts | see inventory below |
| Compliance of **shipping clients** cannot be proven from this repo alone | NEEDS_MORE_EVIDENCE |

## 2. Protocol inventory (backend)

| Surface | Path |
|---------|------|
| Decision Space iOS | `src/decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md` |
| Arrange iOS | `src/trips/arrange-itinerary/ARRANGE_ITINERARY_IOS_HANDOFF.md` |
| Page Insight | `src/trips/copilot/PAGE_INSIGHT_API.md`, `page-ai-contracts.ts` |
| Trusted delivery | `src/agent/delivery/FRONTEND_TRUSTED_DELIVERY.md` |
| TEP FE | `internal-docs/frontend/TEP-SELF-DRIVE-FRONTEND-HANDOFF.md` |
| Reference clients | `src/**/frontend-*-api-client.ts` (TypeScript samples) |

## 3. Tests

Contract that inventory files exist + page-ai-contracts export:

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/client-protocol-handoff.inventory.contract.spec.ts
```

## 4. Limitations

- Research must mark client conclusions as **not source-reviewed**.
- Do not upgrade handoff existence to “client compliant”.
