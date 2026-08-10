# S1-iOS-01 — Capture Mock handoff + reference client

**Status:** IMPLEMENTED (backend-repo deliverable; no Swift sources in this repo)  
**Date:** 2026-07-25  
**Parent:** [`PROCESS_STATUS.md`](./PROCESS_STATUS.md)

---

## Delivered

| Item | Path |
|------|------|
| iOS handoff | `src/trips/travel-observation/NARA_LOOK_IOS_HANDOFF.md` |
| Client types | `…/dto/frontend-nara-look-api.types.ts` |
| Reference client | `…/dto/frontend-nara-look-api-client.ts` |
| Client tests | `…/dto/frontend-nara-look-api-client.spec.ts` |
| Inventory | EWP-06 `client-protocol-handoff.inventory.contract.spec.ts` updated |

---

## Capture Mock coverage

- Screen state machine (`nextCaptureScreen`)
- 409 → progress poll (`waitForAssessment`)
- CTA / role / driving helpers
- No `apply` on client
- Scene guidance + analyzing stage copy

---

## Reproduce

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/trips/travel-observation/dto/frontend-nara-look-api-client.spec.ts \
  src/agent/contracts/client-protocol-handoff.inventory.contract.spec.ts
```

---

## Out of scope (shipping iOS app)

SwiftUI / AVFoundation implementation lives in the iOS repo. This ticket freezes protocol + reference client for that work.
