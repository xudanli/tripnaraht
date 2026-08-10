# UWC-OCC-UNLOCK-01 — Global OCC Dual-Gate Unlock

**Date:** 2026-07-24  
**Decision:** Explicit authorization after Agent Harness P0-1 / UWC D1–D3 APPROVED  
**Scope:** Flip Gate B only — **Compensation remains LOCKED**

---

## Change

| Constant | Before | After |
|----------|--------|-------|
| `UWC_1C_OCC_CODE_COMPLETE` | `true` | `true` (unchanged) |
| `UWC_1C_OCC_SWITCH_AUTHORIZED` | `false` | **`true`** |
| `UWC_1C_OCC_UNLOCKED` | `false` | **`true`** |
| `UWC_1D_COMPENSATION_EXEC_AUTHORIZED` | `false` | **`false`** (unchanged) |

Source: `src/decision-runtime/execution/authoritative-write/corridor-write-mode.config.ts`

---

## Companion adjustments (required)

UWC-1e previously **refused Preview** when global OCC was unlocked (`UWC_1E_REFUSES_WHEN_GLOBAL_OCC_UNLOCKED_UNEXPECTED`). That safety rail is removed so 1e continues under unlocked OCC.

Also updated:
- `x-uwc-locks.globalOccUnlock` → `true` (OpenAPI freeze + evidence JSON)
- `UWC_1E_CLIENT_COMMIT_POLICY.globalOccUnlock` → `true`
- Handler reason codes: `NO_GLOBAL_OCC_UNLOCK` → `GLOBAL_OCC_UNLOCK_AUTHORIZED`
- `uwc1eLocksStillHeld()` reports OCC unlocked; still throws if compensation opens

---

## Still held

- Compensation exec **LOCKED**
- mixedTargets / auto-undo / Iceland·Mobile writeback **EXCLUDED**
- Pages must not call Apply / mutate sealed tokens (1e commit gate)
- Corridor set unchanged (still ACTIONS / ITINERARY / UNIFIED only)

---

## Effect vs D1–D3

All three v1 corridors were already `isCorridorAuthoritativeAuthorized=true`. Global unlock does **not** expand the corridor catalog; it clears the dual-gate hard-block for AUTHORITATIVE mode resolution and aligns status with production cutover intent.

---

## Verification

```bash
npx jest \
  src/decision-runtime/execution/authoritative-write/uwc-1c-occ.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-1e-client-protocol.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-1e-http.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/authoritative-write-gateway.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-cutover-01-d1.contract.spec.ts \
  src/agent/contracts/uwc-1e-client-contract.matrix.spec.ts \
  --runInBand
```

---

## Next (not this decision)

- Compensation unlock — separate explicit auth only  
- Confirm multi-instance live proof  
- UWC corridor expansion beyond first batch
