# CC-1 — Arrange apply stale dual-signal

**Status:** DONE  
**Parent gate:** `POST_EWP_DECISION_GATE.md`  
**Claims:** C024 (additive)

## Fact

On Arrange apply freshness failure:

| Signal | Value |
|--------|-------|
| Orchestration **phase** | `CONTEXT_STALE` |
| Proposal **status** | `STALE` |
| HTTP **409** body `code` / `errorCode` | `CONTEXT_VERSION_CONFLICT` |

These are **not** the same token. Handoffs previously said `409 CONTEXT_STALE`; corrected to match code.

## Artifacts

| Item | Path |
|------|------|
| Constants | `src/trips/arrange-itinerary/contracts/arrange-apply-stale.dual-signal.constants.ts` |
| Behavior spec | `src/trips/arrange-itinerary/contracts/arrange-apply-stale.dual-signal.spec.ts` |
| Doc contract | `src/agent/contracts/arrange-apply-stale.dual-signal.contract.spec.ts` |
| API / iOS handoff fix | `ARRANGE_ITINERARY_API.md`, `ARRANGE_ITINERARY_IOS_HANDOFF.md` |

## Non-goals

- No global lock / cross-corridor concurrent write suite  
- No change to apply success path  

## Tests

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/trips/arrange-itinerary/contracts/arrange-apply-stale.dual-signal.spec.ts \
  src/agent/contracts/arrange-apply-stale.dual-signal.contract.spec.ts
```

Result: **PASS**
