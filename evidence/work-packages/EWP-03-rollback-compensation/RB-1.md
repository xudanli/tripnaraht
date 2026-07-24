# RB-1 — Unified rollback HTTP + Actions stub product label

**Status:** DONE  
**Parent gate:** `POST_EWP_DECISION_GATE.md`  
**Claims:** C023, C023b, C023c (additive confirmation)

## Changes

| Item | Path |
|------|------|
| Product constants | `src/agent/contracts/rollback-corridor.product.constants.ts` |
| Unified HTTP chain contract | `src/decision-runtime/gateway/contracts/unified-rollback-http.contract.spec.ts` |
| Actions stub product contract | `src/agent/contracts/actions-rollback-stub.product.contract.spec.ts` |
| Service uses stub constants | `src/agent/services/action-execution.service.ts` |
| Swagger labels stub | `src/agent/actions.controller.ts` |
| Unified OpenAPI description | `unified-decision.controller.ts` |

## Product fact (Actions)

`ACTIONS_ROLLBACK_PRODUCT_STATUS = STUB_NO_SIDE_EFFECTS`  
HTTP 200 **does not** reverse commits or side effects.

## Non-goals (honored)

- No real Actions compensation implementation  
- No cross-corridor rollback bus  
- No Iceland/Mobile apply rollback invention  

## Tests

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/decision-runtime/gateway/contracts/unified-rollback-http.contract.spec.ts \
  src/agent/contracts/actions-rollback-stub.product.contract.spec.ts \
  src/agent/contracts/rollback-compensation.corridor.matrix.spec.ts
```
