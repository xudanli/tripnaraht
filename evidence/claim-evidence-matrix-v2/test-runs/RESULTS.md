# Matrix v2 regression results

**Overall:** PASS  
**Env:** `regression.env.txt`  
**Summary:** `REGRESSION_SUMMARY.json`

| Step | Command | Exit |
|------|---------|------|
| Dangling imports | `LLM_USE_MOCK=true CI=true npm run ci:dangling-imports` | 0 |
| Freeze smoke | `LLM_USE_MOCK=true CI=true npm run ci:freeze-smoke-gate` | 0 |
| Jest matrix batch | `npx jest --runInBand --forceExit --ci` (see console) | 0 |

**Jest:** 28 suites / 116 tests PASS (`matrix-v2-jest.json`)

Artifacts: `ci-dangling.*`, `ci-freeze-smoke.*`, `matrix-v2-jest.*`
