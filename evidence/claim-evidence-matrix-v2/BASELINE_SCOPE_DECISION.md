# BASELINE_SCOPE_DECISION — Matrix v2 / V3.1 engineering baseline

| Field | Value |
|-------|--------|
| **V3.1 feature tip** | `bc6e2e6d5a087a6a20c47576ebdba295370ebec1` |
| **Matrix v2 freeze delivery** | `a50acf7fe3fed65b0330001cdb86026fdc625a63` |
| **Annotated tag** | `claim-evidence-matrix-v2.0` |
| **Parent OpenAPI / v1 research freeze** | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| **v1 Matrix** | Remains FROZEN; still valid for historical citation |
| **Architecture capability adds** | **STOPPED** for this freeze window |

## Decisions

1. **New engineering baseline** = V3.1 tip `bc6e2e6d5…` (plus Matrix v2 freeze delivery commit when tagged).  
2. **BFF-1** dual-pins historical OpenAPI (`a7e9bdca5`) **and** engineering baseline + `OPENAPI_CONTRACT_DELTA_INDEX`.  
3. **C018** remains historically `BASELINE_INCOMPLETE` at v1; live loadability is **C018R PASS** on this baseline.  
4. **C001** evidence upgraded to **PASS** on this baseline (ao-p0 loads).  
5. Research **must not** cite Matrix v2 until `SIGNATURES.md` EL/TA/QA **APPROVE**.  
6. After APPROVE: research may start **V3.2 Delta Assessment only** (no mega-architecture).  
7. After V3.2 Delta: convene **Release Readiness Review**.

## Out of scope (unchanged from gate)

See `DEFER_BLOCKED_REGISTRY.md`.
