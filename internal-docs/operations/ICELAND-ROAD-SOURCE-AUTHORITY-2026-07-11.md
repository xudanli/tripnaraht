# Iceland Road Source Authority — Frozen

**Effective:** 2026-07-11  
**Status:** FROZEN (Gagnaveita spike PASS with PARTIAL adapter alignment)  
**Evidence:** `internal-docs/operations/evidence/gagnaveita-f208-spike-2026-07-10.json`

## Production Status (formal names — do not use “Road Ready”)

| Line | Status |
|------|--------|
| Road CLOSED Engineering Closure | **PASS** |
| Road LIMITED Traversability Engineering Closure | **PASS** |
| Road Live Collector Ingestion | **PASS** |
| Road Production Canary Pre-Signoff | **PASS** |
| Road Production GO | **PENDING** (blocked on Formal Vedur Soak) |

Sign-off pack: `internal-docs/operations/ROAD-PRODUCTION-SIGNOFF-PACK-2026-07-11.md`

**Freeze until soak ends (`2026-07-12T06:29:09Z`):** no Road auto-trigger, allowlist expansion, Repair/Traversability/Abu changes, new country packs, Weather Canary changes, or parallel Effective-Plan drills.

---

## Authoritative Live Source

| Field | Value |
|-------|-------|
| Provider | Vegagerðin Gagnaveita |
| Endpoint | `https://gagnaveita.vegagerdin.is/api/faerd2017_1` |
| Transport | Frankfurt ECS collector egress (`47.87.131.183`, region `de-frankfurt`) |
| Canonical provider id | `vegagerdin_gagnaveita` |
| Content-Type | `application/json; charset=utf-8` |
| Refresh cadence (target) | 15 minutes (align with Vedur collector cron pattern) |

**Frankfurt reachability:** HTTP 200, ~358 KB (2026-07-10).  
**Devbox reachability:** DNS FAIL — must not be used as live egress.

---

## Deprecated / Non-Operational

| Endpoint | Status | Notes |
|----------|--------|-------|
| `https://api.road.is/api/condition` | **LEGACY_ENDPOINT / UNRESOLVABLE** | DNS EAI_AGAIN on devbox and Frankfurt |
| `https://www.road.is` DATEX II | **LEGACY_ENDPOINT** | `IcelandRoadStatusAdapter` target; not viable for RFC-001 live chain |
| `static_seasonal_data` fallback | **NON_SIGNOFF** | Must not be used as Live or Replay sign-off evidence |

Do **not** place `api.road.is` in RFC-001 primary live configuration.

---

## F208 Identification (Gagnaveita)

Gagnaveita does not emit a literal `F208` field. F208 is resolved from segment naming:

| Signal | Example | Maps to |
|--------|---------|---------|
| `FulltNafnButs` prefix | `Fjallabaksleið nyrðri: Búland - Eldgjá` | `F208` |
| Segment id | `IdButur` e.g. `913020036` | `segmentId` |
| Road name | `FulltNafnButs` / `StuttNafnButs` | `roadName` |

Live snapshot (2026-07-10) found **4** F208 north segments. Rollup status: **LIMITED** (worst segment `FAERT_FJALLABILUM`).

---

## Status Mapping (Frozen)

| Gagnaveita `AstandYfirbord` | `AstandLysingEn` (typical) | Canonical | RFC-001 `RoadStatusChanged` | Decision semantics |
|----------------------------|----------------------------|-----------|----------------------------|------------------|
| `LOKAD` | Closed | `closed` | `CLOSED` | Hard block |
| `OFAERT_ANNAD` | Impassable | `closed` | `CLOSED` | Hard block (not all non-normal → CLOSED) |
| `FAERT_FJALLABILUM` | Mountain vehicles | `limited` | `LIMITED` | 2WD infeasible; 4WD may proceed |
| `GREIDFAERT` | Easily passable | `open` | `OPEN` | Normal / recovery candidate |
| `EKKI_I_THJONUSTU` | Not known | `unknown` | `UNKNOWN` | Data gap — not safe |
| `OTHEKKT` | Unknown | `unknown` | `UNKNOWN` | Data gap — not safe |

**Observed-at:** prefer `DagsKeyrtUt` (publish time), fallback `DagsSkrad`.  
**Restriction type:** `FrkvLysingEn` / `AstandVidbotaruppl` when present (often null on F208).  
**Geometry:** not present in `faerd2017_1` — route matching uses trip `rfc001IcelandRoadBindings`.

**Traversability (design):** `LIMITED` 语义须结合路面类型与车辆能力，不能单独作为「可通行 WARNING」。见 [ADR-ROAD-TRAVERSABILITY-MODEL.md](../architecture/ADR-ROAD-TRAVERSABILITY-MODEL.md) — `FAERT_FJALLABILUM` 在 2WD 场景目标 gate 为 `REJECT` / `SUGGEST_REPLACE`，4WD 场景为 `NEED_CONFIRM`。

**Static profile SSOT (T0):** `data/destination-packs/is/road/is-road-segment-profiles.json` — F208 frozen reference + `RING_ROAD` + `F26`; loaded via `roadProfileBundles` in `destination.pack.json`.

**Acceptance scenarios (T2):** [SLICE-2 §11 RT-F208-*](./SLICE-2-ICELAND-ROAD-CLOSE-CANARY-ACCEPTANCE.md#11-traversability-扩展--rt-f208-adr-road-traversability-model) — evidence tag `ROAD_TRAVERSABILITY_ENGINEERING_EVIDENCE`; fixture `gagnaveita-f208-real-shape.json`（LIMITED）与 CLOSED Pre-Signoff **分层**。

---

## Adapter Alignment Verdict

```
ADAPTER_ALIGNMENT = PARTIAL
```

| Component | Verdict |
|-----------|---------|
| `IcelandRoadStatusAdapter` | **FAIL** — DATEX / road.is shapes only |
| `RoadStatusRealtimeService` | **FAIL** — primary path `api.road.is/api/condition` |
| `gagnaveita-faerd.mapper.ts` | **PASS** — thin mapping layer for real JSON |

**Required before Live sign-off:**

1. ~~Frankfurt Gagnaveita collector (mirror Vedur pattern)~~ ✅ 2026-07-10 E2E PASS
2. ~~Wire mapper into ingest / realtime service~~ ✅ collector ingest + `RoadStatusRealtimeService`
3. Raw evidence persistence (road collector raw record) — ✅ `rfc001GagnaveitaCollectorRawEvidence`
4. ~~Remove `api.road.is` from primary config~~ ✅ default `ROAD_STATUS_LIVE_SOURCE=gagnaveita`

## RoadStatusRealtimeService (Wired 2026-07-10)

| Item | Value |
|------|-------|
| Default live source | `ROAD_STATUS_LIVE_SOURCE=gagnaveita` |
| Endpoint | `https://gagnaveita.vegagerdin.is/api/faerd2017_1` |
| Mapper | `gagnaveita-faerd.mapper.ts` + `gagnaveita-collector-parse.util.ts` |
| dataSource | `vegagerdin_gagnaveita` |
| confidence | 0.88 |
| Legacy rollback | `ROAD_STATUS_LIVE_SOURCE=road.is` (UNRESOLVABLE — falls back to Gagnaveita) |
| Evidence resolver | `mapRoadDataSourceToSourceProvider()` → `vegagerdin_gagnaveita` |

## Frankfurt Live E2E — PASS (2026-07-10)

Evidence: `internal-docs/operations/evidence/prod-canary-frankfurt-gagnaveita-collector-e2e-2026-07-10.json`

| Field | Live value |
|-------|------------|
| bytes | 357,975 |
| records | 701 |
| F208 rollup | **LIMITED** (live snapshot) |
| outcome | `ASSERTION_EMITTED` |
| transport | Frankfurt → tunnel 19080 → devbox ingest |

---

## REAL-SHAPE Fixtures

| File | Purpose |
|------|---------|
| `scripts/fixtures/gagnaveita-faerd2017_1-live-2026-07-10.json` | Full live snapshot (701 records) |
| `scripts/fixtures/gagnaveita-f208-real-shape.json` | F208 segments, live=true |
| `scripts/fixtures/gagnaveita-f208-closed-real-shape.json` | Replay CLOSED scenario |

**CLOSED replay note:** Live snapshot does not show F208 as `LOKAD`. Replay fixture splices live `LOKAD` enum values from record `913350036` onto F208 segment identity `913020036` — same field names and enum vocabulary as authority API.

---

## Replay Drill Chain (Target)

```
REAL-SHAPE Gagnaveita
  → gagnaveita-faerd.mapper
  → ROAD_STATUS_CHANGED
  → EvidenceEnvelope / Assertion
  → Problem (FEASIBILITY_FAILURE)
  → 3 Repair candidates
  → W-01 Effective Plan write guard
  → Revalidation
```

**Staging Replay:** `npm run prod-canary:road-close-staging-replay` — PASS 2026-07-10

## Collector Ingest (Wired 2026-07-10)

| Item | Value |
|------|-------|
| Ingest path | `POST /internal/evidence/road/gagnaveita` |
| Schema | `gagnaveita.raw.v1` |
| HMAC env | `GAGNAVEITA_COLLECTOR_HMAC_SECRET` (fallback: `VEDUR_COLLECTOR_HMAC_SECRET`) |
| Collector id | `gagnaveita-collector-pilot` |
| Devbox server | Same PM2 ingest on port 3000 (`vedur-collector-ingest` + Gagnaveita route) |
| Frankfurt script | `scripts/gagnaveita-collector-minimal.sh` |
| Frankfurt E2E | `scripts/frankfurt-gagnaveita-collector-e2e.sh` |
| Drill | `npm run prod-canary:gagnaveita-collector-ingest-drill` |

Canonical ingest emits `WorldStateAssertion` only — does **not** auto-run road-close pipeline or Effective Plan write.

---

## Change Control

Any change to status mapping, F208 resolution rules, or authoritative endpoint requires:

1. New Frankfurt live snapshot + SHA-256
2. Spike re-run: `npx tsx scripts/gagnaveita-f208-parse-spike.ts`
3. Replay drill PASS
4. Update this document effective date
