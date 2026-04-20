## Fixture regeneration contract (TD-05 / CGUS replay)

### Scope

This repo maintains two kinds of E2E fixtures:

- **Human-authored fixtures** (example `.ts` files): readable intent + expected behavior
- **Engine-captured fixtures** (`*.engine-dso.json`): machine-generated snapshots used for offline CGUS / ranking replay

For CGUS Step3 / Winner‑Protected MC Rerank verification, **engine-captured DSO snapshots are the source of truth** when present.

### When you MUST regenerate `*.engine-dso.json`

Regenerate whenever the *meaning* or *shape* of the snapshot inputs change:

- `TripDecisionEngineService` changes that affect **planDraft projection** (Plan → planDraft(days/items))
- any change to the `DecisionRunLog.cgusDsoSnapshot` shape / fields / semantics
- changes to `DecisionState` fields used by CGUS replay (`environmentState`, `tripState.planDraft`, `constraints.violations`)
- changes to replay tooling that **requires new fields** from the snapshot

### When you usually do NOT need regeneration

- pure CGUS ranking strategy changes (gates/flags/thresholds)
- replay diagnostics metrics expansion (new aggregates derived from existing fields)
- registry selection logic changes (as long as it still accepts existing generated fixtures)

### How to regenerate

- Golden fixtures:

```bash
TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register scripts/capture-golden-with-engine-dso.ts
```

- Synthetic fixtures:

```bash
TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register scripts/capture-synthetic-with-engine-dso.ts
```

### CI hints (non-blocking)

`npm run fixtures:check` includes an optional **hint-only** regeneration reminder when:

- `CI=true`, or
- `FIXTURES_REGEN_HINT=1` / `true`

To force-disable hints even in CI:

- `FIXTURES_REGEN_HINT=0` / `false`

It compares `git diff` against a merge base, trying (in order):

- `FIXTURES_REGEN_HINT_BASE` (if set), then `origin/master`, `origin/main`, `master`, `main`
- falls back to `HEAD~1...HEAD` if merge-base diffs are unavailable

It also includes **local uncommitted** changes (`git diff` + `git diff --cached`) so dev machines get the reminder before pushing.

This is intentionally **not** a hard failure.

### Minimal JSON Schema (P2)

`fixtures:check` also validates each `*.engine-dso.json` against a **small** JSON Schema:

- `src/trips/decision/evaluation/schemas/engine-dso-fixture-minimal.schema.json`

It only asserts a **minimal contract** (metadata shell + `cgusDsoSnapshot.environmentState` / `tripState.planDraft.days[].items`), not full DSO semantics. When snapshot shape evolves in a compatible way (extra fields), the schema should usually stay permissive (`additionalProperties: true`). When you introduce a **breaking** shape change, bump `cgusDsoFixtureVersion` and tighten the schema only if needed.

### Versioning expectations

Generated fixtures should carry:

- `metadata.cgusDsoFixtureVersion` (currently `engine-dso-v1`)
- `metadata.cgusDsoGeneratedAt`
- `metadata.cgusDsoSourceCaseId`

If you bump snapshot semantics in a non-backward-compatible way, bump the fixture version and regenerate.

