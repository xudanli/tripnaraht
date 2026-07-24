/**
 * C005-ERRATA — VERIFIED_WITH_WARNINGS
 *
 * Research V3.1 errata: confirm real code + test status for delivery verdict
 * `VERIFIED_WITH_WARNINGS` (not aspirational docs-only).
 *
 * Freeze context: CLAIM_EVIDENCE_MATRIX_v1.0 / engineering hardening track.
 * This errata does NOT regenerate Matrix v1; it records additive evidence for v2.
 */

# Status: CONFIRMED IN CODE + TESTS

| Item | Path | Fact |
|------|------|------|
| Enum member | `src/agent/delivery/types/delivery-verdict.types.ts` | `DELIVERY_VERDICTS` includes `'VERIFIED_WITH_WARNINGS'` |
| Resolver | `resolveDeliveryVerdict` | When `resultStatus` is OK-family and `hasSoftWarnings===true` (and not flawed) → `VERIFIED_WITH_WARNINGS` |
| Projector note | `src/agent/delivery/utils/trusted-delivery.project.util.ts` | Soft warnings (e.g. SOFT gate) project to `VERIFIED_WITH_WARNINGS` |
| Frontend handoff | `src/agent/delivery/FRONTEND_TRUSTED_DELIVERY.md` | Banner guidance for warnings |
| Unit test | `delivery-verdict.types.spec.ts` | Maps OK + soft warnings → `VERIFIED_WITH_WARNINGS` |

## Reproduce

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/delivery/types/delivery-verdict.types.spec.ts \
  -t 'VERIFIED_WITH_WARNINGS|soft warnings'
```

## Research citation

- Treat as **FACT** supported by code+test above.
- Do not invent additional verdict members beyond `DELIVERY_VERDICTS`.
- Matrix v2 should add an explicit Claim for this errata (see CLAIM_EVIDENCE_MATRIX_v2).
