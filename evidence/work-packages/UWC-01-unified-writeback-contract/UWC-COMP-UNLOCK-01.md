# UWC-COMP-UNLOCK-01 — Compensation Exec Unlock

**Date:** 2026-07-24  
**Decision:** Explicit authorization after UWC-OCC-UNLOCK-01  
**Scope:** Flip compensation exec gate only — client auto-undo / mixedTargets / external refunds remain **EXCLUDED**

---

## Change

| Constant | Before | After |
|----------|--------|-------|
| `UWC_1D_COMPENSATION_CONTRACT_COMPLETE` | `true` | `true` |
| `UWC_1D_COMPENSATION_EXEC_AUTHORIZED` | `false` | **`true`** |
| `mayExecuteWrites` | `false` | **`true`** |

Source: `src/decision-runtime/execution/authoritative-write/compensation-auth.gate.ts`

---

## Companion adjustments (required)

1. **UWC-1e** — removed `UWC_1E_REFUSES_WHEN_COMPENSATION_EXEC_AUTHORIZED` rail so Preview continues.
2. **Canary executors** (ITINERARY / UNIFIED) — removed early reject when exec authorized; reason `COMPENSATION_EXEC_AUTHORIZED`.
3. **Pipeline** — distinguish shadow-only vs gate-closed:
   - authorized + `shadowOnly` → `SHADOW_ONLY_NO_WRITE` / `WOULD_APPLY_IF_NOT_SHADOW`
   - authorized + `shadowOnly=false` → `COMPENSATION_APPLIED` (`writesPerformed=true` in decision layer)
4. OpenAPI / commit policy `compensationExec: true`

---

## Still held

- Client `autoUndo` / `auto_compensation` capability **false / excluded**
- mixedTargets / Iceland·Mobile writeback **EXCLUDED**
- Pages must not call Apply / mutate sealed tokens
- External refund/ticketing → still `EXTERNAL_COMPENSATION_UNSUPPORTED`
- Snapshot restore / universal rollback bus still forbidden

---

## Verification

```bash
npx jest \
  src/decision-runtime/execution/authoritative-write/uwc-1d-recovery.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-1e-client-protocol.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-canary-02.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-canary-03.contract.spec.ts \
  --runInBand
```

---

## Next

Confirm multi-instance live proof; product UWC coverage expansion.  
Production Ready still gated on Confirm proof + corridor breadth — not on these dual locks.
