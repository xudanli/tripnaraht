# CLIENT_CONTRACT_INDEX (BFF-1)

**Index SSOT:** `src/agent/contracts/bff-client-contract.index.ts` **v1.2.0**

## Dual pins

| Pin | Commit | Role |
|-----|--------|------|
| Historical OpenAPI snapshot | `a7e9bdca588431143e04e98d7c1c1204299c6e54` | fact-pack `openapi/openapi.json` generation |
| Engineering baseline | `bc6e2e6d5a087a6a20c47576ebdba295370ebec1` | V3.1 + EWP + scoped tickets tip |
| Delta index | `OPENAPI_CONTRACT_DELTA_INDEX.txt` | `a7e9bdca5..bc6e2e6d5` client-contract-relevant paths |

Do **not** treat historical OpenAPI alone as the current contract tip.

## Tests

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/bff-client-contract.index.spec.ts \
  src/agent/contracts/bff-client-contract.matrix.spec.ts
```
