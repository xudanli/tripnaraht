# S5-iOS-01 — Result card + evidence sheet + Preview entry

**Status:** IMPLEMENTED (backend-repo deliverable; no Swift sources in this repo)  
**Date:** 2026-07-25  
**Parent:** [`PROCESS_STATUS.md`](./PROCESS_STATUS.md)

---

## Delivered

| Item | Path |
|------|------|
| Result / Evidence / Preview models | `src/trips/travel-observation/dto/frontend-nara-look-result.ts` |
| Client: `getDecisionProblem` / `buildResult` / `previewLink` | `…/dto/frontend-nara-look-api-client.ts` |
| Tests | `…/dto/frontend-nara-look-result.spec.ts` |
| Handoff §11–12 | `…/NARA_LOOK_IOS_HANDOFF.md` |

---

## Coverage

- Four-layer RESULT VM (`status` · `whatHappened` · `impact` · `recommendation`)
- Evidence sheet from `evidenceIds` + verification
- Q2 Preview entry parse: `decision:` / `repair:` / `arrange:` / `navigation:` / `unsupported:`
- Deep links into existing surfaces — **no Look Apply**
- EXECUTION_BLOCK forbidden CTA guard
- `RESULT` ↔ `EVIDENCE_SHEET` screen transitions

---

## Reproduce

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/trips/travel-observation/dto/frontend-nara-look-result.spec.ts \
  src/trips/travel-observation/dto/frontend-nara-look-api-client.spec.ts
```

---

## Out of scope (shipping iOS app)

SwiftUI RESULT / Sheet implementation lives in the iOS repo. This ticket freezes view-model + Preview routing for that work.

---

## Next

- **S6-QA-01** — Golden Set + fault injection → Pilot Go/No-Go
