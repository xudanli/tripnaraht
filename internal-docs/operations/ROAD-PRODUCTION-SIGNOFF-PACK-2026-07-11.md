# Road Production Sign-off Pack

**Prepared:** 2026-07-11  
**Database:** `tripnara_prod`  
**Engineering commit (frozen):** `246366f9e1ddc798e4cd42ccd0aa95a0136dab6f`

> Do **not** use vague labels such as “Road Ready”. Engineering evidence and production release are separate gates.

---

## Status Clarifications (read before any sign-off)

These four lines are **not** interchangeable:

| Clarification | Meaning |
|---------------|---------|
| **Engineering evidence ≠ Production GO** | CLOSED/LIMITED drill PASS proves design closure — not release authorization |
| **Replay evidence ≠ Live hazard evidence** | `REAL-SHAPE-ROAD-REPLAY-*` fixtures prove pipeline semantics — not live Gagnaveita hazard at sign-off moment |
| **Pre-Signoff PASS ≠ Owner Sign-off** | Engineering drills PASS — human Owners must still sign |
| **Road GO ≠ Global Canonical Cutover** | `Road Production Canary GO` authorizes phased canary — not full production traffic cutover |

---

## Formal Status Names (SSOT)

| Status line | Value |
|-------------|-------|
| Road CLOSED Engineering Closure | **PASS** |
| Road LIMITED Traversability Engineering Closure | **PASS** |
| Road Live Collector Ingestion | **PASS** |
| Road Production Canary Pre-Signoff | **PASS** |
| Road Production GO | **PENDING** |

**Blocking gate:** Formal Vedur Soak (`formal-vedur-soak-2026-07-11.json`) — ends **2026-07-12T06:29:09Z** (= 2026-07-12 14:29:09 台北时间).

---

## Until soak ends — only three things

Road is in **wait-for-gate** mode. **No feature work.**

### 1. Non-invasive soak watch (read-only)

Confirm continuously until `2026-07-12T14:29:09` 台北时间:

| Check | How |
|-------|-----|
| Formal Vedur Soak running | `formal-vedur-soak-2026-07-11.json` → `status: RUNNING` |
| PM2 online | `pm2 list` → ingest + tunnel `online` |
| Restarts not growing | `restart_time` stable vs last watch checkpoint |
| `iceland_met` evidence updating | Weather canary `vedurPollCount` / last outcome advances after cron cycles |
| Collector + tunnel | devbox `:3000/health`; Frankfurt `curl :19080/health` via SSH |
| No Open-Meteo / Replay in formal soak path | `sourceProvider=iceland_met`, `replay count = 0` on soak check |
| Legacy write = 0 | Weather canary metadata unchanged plan; `legacyWriteInvocations: 0` |

Latest watch checkpoint: `evidence/formal-vedur-soak-watch-2026-07-11.json`

**Do not** use Agent or automation scripts as human sign-off substitutes.

### 2. Freeze runtime environment

Until soak ends:

- **No commits** that affect the running stack
- **No PM2 restart**
- **No DB schema changes**
- **No** weather thresholds, collector, cron, or authority changes
- **No** Road Effective Plan write drills

### 3. Prepare named sign-off owners

Three **named** humans required before formal GO:

| Role | Name (fill before sign-off) |
|------|----------------------------|
| Weather Engineering Owner | __________________ |
| Ops / Observer Owner | __________________ |
| Release Sign-off Owner | __________________ |

**Interim (single operator):** record honestly:

```
ENGINEERING SELF-ACCEPTANCE
FORMAL MULTI-OWNER SIGN-OFF = DEFERRED
```

Human signatures only — not Agent, not CI bot, not drill script output.

---

## Freeze (Road side — until Vedur Formal Soak ends)

Road side remains **frozen**. No changes to:

- Road auto-trigger enablement
- Road allowlist expansion (`ICELAND_CANARY_TRIP_ALLOWLIST` — drill-scoped only today)
- New Repair types
- Traversability rules / profiles / assessor
- Abu gate mapping
- Additional country road packs
- Weather Canary trip / env / cron
- Parallel drills that write Effective Plan

Engineering closure is sufficient. **Do not add features** during soak.

---

## 1. Commit & Schema Freeze

| Item | Value |
|------|-------|
| Git commit | `246366f9e1ddc798e4cd42ccd0aa95a0136dab6f` |
| ADR | `internal-docs/architecture/ADR-ROAD-TRAVERSABILITY-MODEL.md` |
| Segment profiles | `data/destination-packs/is/road/is-road-segment-profiles.json` |
| Authority doc | `internal-docs/operations/ICELAND-ROAD-SOURCE-AUTHORITY-2026-07-11.md` |
| Acceptance spec | `internal-docs/operations/SLICE-2-ICELAND-ROAD-CLOSE-CANARY-ACCEPTANCE.md` |

Pre-signoff confirmation must verify commit unchanged vs this SHA.

---

## 2. Road Collector Deployment

| Item | Value |
|------|-------|
| Authority API | `https://gagnaveita.vegagerdin.is/api/faerd2017_1` |
| Provider id | `vegagerdin_gagnaveita` |
| Frankfurt egress | `47.87.131.183` (`de-frankfurt`) |
| Devbox ingest | PM2 `vedur-collector-ingest` → `:3000` |
| Ingest route | `POST /internal/evidence/road/gagnaveita` |
| Tunnel | PM2 `vedur-collector-tunnel` → Frankfurt `:19080` |
| HMAC | `GAGNAVEITA_COLLECTOR_HMAC_SECRET` (fallback: `VEDUR_COLLECTOR_HMAC_SECRET`) |
| PM2 config | `ecosystem.vedur-collector.config.js` |
| Install script | `scripts/install-devbox-collector-pm2.sh` |

### Evidence

| Drill | File | Verdict |
|-------|------|---------|
| Gagnaveita ingest | `evidence/prod-canary-gagnaveita-collector-ingest-2026-07-10.json` | `GAGNAVEITA_COLLECTOR_INGEST_PASS` |
| Frankfurt E2E | `evidence/prod-canary-frankfurt-gagnaveita-collector-e2e-2026-07-10.json` | (see file) |
| Frankfurt egress | `evidence/road-is-egress-de-frankfurt-2026-07-10.json` | HTTP 200 |
| Collector stack | `evidence/prod-canary-collector-stack-2026-07-10.json` | — |

**PM2 at pack time (2026-07-11):** ingest + tunnel `online`, restarts `0`.

---

## 3. CLOSED Engineering Closure

**Scenario:** F208 CLOSED replay — road closure → plan infeasible → repair chain.

| Item | Value |
|------|-------|
| Fixture | `scripts/fixtures/gagnaveita-f208-closed-real-shape.json` |
| SHA-256 | `b696bb9fffad5538cf9f04c4bdf68d1a6cd9be58bff54dd31a2e889077601c38` |
| liveSource | `REAL-SHAPE-ROAD-REPLAY-F208-CLOSED` |
| Evidence label | `ROAD_PROD_CANARY_PRE_SIGNOFF_ENGINEERING_EVIDENCE` |

### Evidence files

| Phase | File | Result |
|-------|------|--------|
| Suite ABC | `evidence/prod-canary-road-pre-signoff-abc-2026-07-11.json` | `verdict: PASS` |
| A Observe | `evidence/prod-canary-road-observe-a-pre-signoff-2026-07-11.json` | PASS |
| B Suggest | `evidence/prod-canary-road-suggest-b-pre-signoff-2026-07-11.json` | PASS |
| C Execute | `evidence/prod-canary-road-execute-c-pre-signoff-2026-07-11.json` | PASS |
| Rollback | `evidence/prod-canary-road-rollback-pre-signoff-2026-07-11.json` | PASS |

Staging replay (pre-prod): `evidence/staging-replay-road-close-abc-2026-07-10.json` — PASS.

---

## 4. LIMITED Traversability Engineering Closure

**Scenario:** F208 LIMITED replay — vehicle-capability-dependent traversability + Abu gate.

| Item | Value |
|------|-------|
| Fixture | `scripts/fixtures/gagnaveita-f208-real-shape.json` |
| SHA-256 | `cafcd72acd5fd471943179cc11e8146f7a1f5a92a220efe8223cb87c35e0a72a` |
| liveSource | `REAL-SHAPE-ROAD-REPLAY-F208-LIMITED` |
| Evidence label | `ROAD_TRAVERSABILITY_ENGINEERING_EVIDENCE` |

### 2WD (RT-F208-001)

| Item | Value |
|------|-------|
| Assessor | `VEHICLE_INCOMPATIBLE` |
| Abu gate | `SUGGEST_REPLACE` |
| Suite | `evidence/road-traversability-pre-signoff-2wd-2026-07-11.json` |
| structuralVerdict | **PASS** |

### 4WD (RT-F208-002)

| Item | Value |
|------|-------|
| Assessor | `PASSABLE_WITH_CAUTION` |
| Abu gate | `NEED_CONFIRM` |
| Suite | `evidence/road-traversability-pre-signoff-4wd-2026-07-11.json` |
| structuralVerdict | **PASS** |

Rollback: `evidence/road-traversability-rollback-2026-07-11.json` — PASS.

> CLOSED and LIMITED evidence must **not** be mixed. Separate fixtures, separate drill suites.

---

## 5. Weather Canary Isolation

| Trip | ID | Role |
|------|-----|------|
| Weather Canary | `a0a99999-9999-4999-8999-999999999999` | Vedur Formal Soak only — **do not use for Road** |
| Road Canary | `b0b88888-8888-4888-8888-888888888888` | Road drills only |
| Road Canary user | `b0b88888-8888-4888-8888-888888888801` | — |

### Untouched proof (post traversability drill)

Source: `evidence/prod-canary-road-weather-baseline-post-traversability-2026-07-11.json`

| Check | Before | After |
|-------|--------|-------|
| `weatherTripUpdatedAt` | `2026-07-10T17:00:28.155Z` | unchanged |
| `vedurPollCount` | 7 | 7 |
| `legacyWriteInvocations` | 0 | 0 |
| `weatherEffectivePlanVersionId` | `plan_1` | `plan_1` |

---

## 6. Allowlist State

| Item | Value |
|------|-------|
| Runtime global allowlist | **not expanded** — Road auto-trigger not enabled for prod traffic |
| Drill scope | `ICELAND_CANARY_TRIP_ALLOWLIST=b0b88888-8888-4888-8888-888888888888` set **only in drill process env** |
| Rollback proof | `allowlistClearedInProcessEnv: true` in rollback evidence |

---

## 7. Capability Summary (for Owners)

TripNARA Road on Iceland now closes two engineering loops:

1. **CLOSED** — when a road segment closes, the system knows the original plan is not executable and enters the repair / revalidation chain.
2. **LIMITED** — when passage is restricted, the system produces **vehicle-specific** traversability conclusions (2WD blocked vs 4WD cautious pass) via assessor + Abu gate.

This is not static road-info display; it is **live authority → individualized executability → plan repair**.

---

## 8. Post-soak formal execution order

**Soak end:** `2026-07-12T06:29:09Z` (台北 14:29:09)

```
保持环境冻结
  → 等 Vedur Soak 到期
  → 执行 Soak Check
  → Weather Owner Sign-off
  → Road 最小确认性重跑
  → Road Owner Sign-off
  → Road Production Canary GO 决策
  → 分阶段放量
```

### Step 1 — Vedur Soak Check

```bash
npm run prod-canary:formal-vedur-soak-check
```

**Must preserve:**

- Full command stdout/stderr
- Output evidence JSON (`formal-vedur-soak-check-*.json`)
- Commit SHA at check time
- Check timestamp (UTC)
- Actual soak file used
- Confirmation checker excluded `abort` / `check` / voided old files

Checker uses latest `formal-vedur-soak-*.json` excluding `abort` and `check` suffixes (same rule as road baseline).

### Step 2 — Weather Gate (decision before any Road step)

**PASS only if all true:**

| Criterion | Required |
|-----------|----------|
| Full 24h coverage | elapsed ≥ 24h from `startedAt` |
| Collector live Vedur data | sustained `iceland_met` ingest |
| No long collection outage | no sustained gap > 15min |
| Fingerprint health | no abnormal duplicate fingerprints |
| Multi-instance / cron / lock | cron ~96 runs, locks normal |
| Legacy write | = 0 |
| Allowlist pollution | none |
| Manual DB repair | none during soak |
| Replay count | = 0 on formal path |
| Authority source | `vedur_live_collector` / `iceland_met` only — no Open-Meteo override |

**On PASS — freeze:**

```
Formal Vedur Soak = PASS
Weather Production Canary = GO / READY_FOR_SIGNOFF
```

**On FAIL — stop Road GO immediately:**

| Status line | Value |
|-------------|-------|
| Road CLOSED Engineering Closure | remains **PASS** |
| Road LIMITED Traversability Engineering Closure | remains **PASS** |
| Road Production Canary Pre-Signoff | remains **PASS** |
| Road Production GO | **PENDING / BLOCKED_BY_WEATHER_OPS_GATE** |

Do **not** skip Weather Gate because Road engineering already passed.

Re-run Road confirmation only if failure implicates shared ops (DB, PM2, tunnel, locks, fingerprints, authority writes, schema/commit drift).

### Step 3 — Weather Owner Sign-off

**Weather Engineering Owner** (named human) signs coverage of:

- Data source authenticity (`iceland_met` / Vedur live)
- 24h operational stability
- No authority bypass (Open-Meteo must not override active Vedur risk)
- Rollback / recovery capability
- Evidence completeness (soak + check JSON + command output)

### Step 4 — Road minimal confirmation (not full engineering re-run)

Purpose: prove **environment drift did not invalidate** pre-signoff evidence.

#### 4a. CLOSED semantics (hard infeasibility)

```bash
npx tsx scripts/prod-canary-road-pre-signoff-baseline.ts --label=pre-confirmation

ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-pre-signoff-setup.ts --reset
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-pre-signoff-abc.ts --phase=A
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-pre-signoff-abc.ts --phase=B
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-pre-signoff-abc.ts --phase=C
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-pre-signoff-rollback.ts --baseline-label=pre-confirmation
```

| Phase | Sanity checks |
|-------|---------------|
| **A Observe** | exactly one Problem; **no** Effective Plan write |
| **B Suggest** | three repair candidates; gateway correct; **no** write |
| **C Execute** | W-01 guard; Effective Plan write; Revalidation PASS; Problem **RESOLVED** |
| **Rollback** | allowlist cleared in process env; initial state restored |

Expected semantic: **CLOSED → hard infeasibility**

#### 4b. LIMITED semantics (vehicle-specific)

```bash
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-setup.ts --reset --vehicle=2WD
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-abc.ts --vehicle=2WD --phase=A
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-rollback.ts --baseline-label=pre-confirmation

ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-setup.ts --reset --vehicle=4WD
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-abc.ts --vehicle=4WD --phase=A
ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-rollback.ts --baseline-label=pre-confirmation
```

| Profile | Expected assessor |
|---------|-------------------|
| LIMITED + 2WD | `VEHICLE_INCOMPATIBLE` |
| LIMITED + 4WD | `PASSABLE_WITH_CAUTION` |

```bash
npx tsx scripts/prod-canary-road-pre-signoff-baseline.ts --label=post-confirmation
```

**Pass criteria:** each phase PASS; `legacyWriteInvocations: 0`; Weather canary unchanged; `gitCommit` still frozen SHA.

Evidence label: `ROAD_PRODUCTION_CONFIRMATION_EVIDENCE`

### Step 5 — Road three-party sign-off

Before signing, confirm:

- Road Canary Trip independent (`b0b88888-…`)
- Weather Canary untouched (`a0a99999-…`)
- Road live auto-trigger still **off** or controlled per design
- `legacyWriteInvocations = 0`
- Rollback PASS
- commit / schema / env match pre-signoff pack §1

| Owner | Signs |
|-------|-------|
| **Weather Engineering Owner** | (completed Step 3) |
| **Ops / Observer Owner** | Collector, PM2, DB, rollback operability |
| **Release Sign-off Owner** | Authorize or hold Road Production Canary GO |

Use §10 templates. **Named humans only.**

### Step 6 — Road Production GO decision

Only after Steps 1–5:

```
Road Production GO = GO
```

Interpret as **`Road Production Canary GO`** — **not** global canonical cutover.

---

## 9. Phased rollout after Road GO

Do **not** full-cutover immediately. Ramp in three stages:

| Stage | Behavior |
|-------|----------|
| **Observe** | Assertion / Problem only — no user-facing display, no plan write |
| **Suggest** | Show repair options to **internal canary users** — no Effective Plan write |
| **Execute** | W-01 Effective Plan write **only after user confirmation** |

Start with internal trips; expand `ICELAND_CANARY_TRIP_ALLOWLIST` incrementally.

---

## 10. Owner Sign-off Template

### Weather Engineering Owner

I confirm Formal Vedur Soak operational closure on `tripnara_prod`:

- 24h `iceland_met` live collector stability
- No authority bypass; no Open-Meteo override of active Vedur risk
- Evidence complete (soak start + soak check + command output)
- Rollback / recovery path understood

| Field | Value |
|-------|-------|
| **Name** | __________________ |
| Date | __________________ |
| Soak check evidence file | __________________ |
| Signature | __________________ |

### Ops / Observer Owner

I confirm collector operations are production-ready:

- Frankfurt cron `*/15 * * * *` active
- PM2 ingest + tunnel stable (restart budget acceptable)
- Rollback drill PASS; DB `tripnara_prod` consistent post-drill
- Legacy write count = 0 on Weather Canary during Road drills

| Field | Value |
|-------|-------|
| **Name** | __________________ |
| Date | __________________ |
| PM2 restarts at sign-off | __________________ |
| Signature | __________________ |

### Engineering Owner (Road)

I confirm Road **CLOSED** and **LIMITED Traversability** engineering + post-soak confirmation match frozen design:

- ADR-ROAD-TRAVERSABILITY-MODEL; SLICE-2 scenarios
- CLOSED → hard infeasibility; LIMITED 2WD/4WD semantics unchanged
- Independent Road Canary; Weather Canary untouched
- Evidence: `ROAD_PROD_CANARY_PRE_SIGNOFF_ENGINEERING_EVIDENCE`, `ROAD_TRAVERSABILITY_ENGINEERING_EVIDENCE`, `ROAD_PRODUCTION_CONFIRMATION_EVIDENCE`

| Field | Value |
|-------|-------|
| **Name** | __________________ |
| Date | __________________ |
| Commit verified | `246366f9e1ddc798e4cd42ccd0aa95a0136dab6f` ☐ |
| Signature | __________________ |

### Release Sign-off Owner

I authorize **Road Production Canary GO** (or document hold reason):

- Formal Vedur Soak PASS evidence attached
- Road minimal confirmation PASS (post-soak)
- No allowlist expansion beyond approved canary scope
- Road auto-trigger policy: __________________

| Field | Value |
|-------|-------|
| **Name** | __________________ |
| Date | __________________ |
| Decision | **Road Production Canary GO** ☐ / HOLD ☐ |
| Initial rollout stage | Observe ☐ / Suggest ☐ / Execute ☐ |
| Signature | __________________ |

### Interim — single operator

If multi-owner sign-off is not yet available:

```
ENGINEERING SELF-ACCEPTANCE
FORMAL MULTI-OWNER SIGN-OFF = DEFERRED
Recorded by: __________________  Date: __________________
```

This does **not** substitute for named Owner signatures at GO decision.

---

## 11. If Weather Soak Fails

Road engineering status **does not roll back**.

| Status line | On soak failure |
|-------------|-----------------|
| Road CLOSED Engineering Closure | remains **PASS** |
| Road LIMITED Traversability Engineering Closure | remains **PASS** |
| Road Production Canary Pre-Signoff | remains **PASS** |
| Road Production GO | **PENDING / BLOCKED_BY_WEATHER_OPS_GATE** |

Re-run Road drills **only if** failure implicates:

- DB consistency
- PM2 / ingest / tunnel stability
- Advisory lock health
- Evidence fingerprint duplication
- Authority write path
- Schema or commit change

Traversability logic itself is not invalidated by a Vedur soak failure.

---

## 12. Evidence Index (quick links)

All under `internal-docs/operations/evidence/`:

```
formal-vedur-soak-2026-07-11.json          # active soak (RUNNING)
formal-vedur-soak-watch-2026-07-11.json    # non-invasive watch checkpoint
formal-vedur-soak-abort-2026-07-11.json    # voided prior attempt
prod-canary-road-pre-signoff-abc-2026-07-11.json
road-traversability-pre-signoff-{2wd,4wd}-2026-07-11.json
road-traversability-rollback-2026-07-11.json
prod-canary-road-rollback-pre-signoff-2026-07-11.json
prod-canary-road-weather-baseline-{pre,post}-traversability-2026-07-11.json
prod-canary-gagnaveita-collector-ingest-2026-07-10.json
```

**Voided / do not cite for sign-off:** `formal-vedur-soak-2026-07-10.json`, `formal-vedur-soak-check-2026-07-10.json`.
