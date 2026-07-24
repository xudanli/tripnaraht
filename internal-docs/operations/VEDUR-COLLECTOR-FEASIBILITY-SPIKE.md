# Vedur Collector — Feasibility Spike (P0)

**Status:** RUN ON CANDIDATE HOST (not devbox)  
**Blocks:** Production Canary GO — Vedur authoritative ingestion

---

## Goal

Confirm at least one collector candidate can reach Vedur XML API before building the full collector service.

```
Collector Host → DNS → TCP 443 → TLS → HTTP 200 → save raw XML
```

---

## Run

On each **candidate** machine (Iceland/EU cloud, edge function, hourly ECS):

```bash
git clone <repo> && cd project
npm ci   # or copy script only
npx tsx scripts/vedur-collector-feasibility-spike.ts \
  --write-evidence \
  --collector-candidate=eu-west-1a
```

**Devbox (known fail):** TCP timeout to `130.208.87.200` — use as negative control only.

---

## Pass criteria (SPIKE_PASS)

| # | Evidence |
|---|----------|
| 1 | Collector egress IP recorded |
| 2 | DNS → `130.208.87.200` |
| 3 | TCP 443 connect |
| 4 | TLS handshake |
| 5 | HTTP 200 + valid `<station>` XML |
| 6 | Raw XML + SHA-256 saved |
| 7 | 3 consecutive requests stable |
| 8 | Latency p50 recorded |
| 9 | IP restriction hypothesis noted |

Exit code `0` = **SPIKE_PASS**

---

## Candidate environments

- Iceland or EU VPS (1 vCPU, 512MB–1GB)
- Temporary hourly ECS (eu-north-1 / eu-west-1)
- Existing server with Vedur reachability
- Cloudflare Worker — **only if** probe confirms TCP/TLS/HTTP to `130.208.87.200`

---

## After SPIKE_PASS

1. Freeze collector architecture (Scheme A)
2. Deploy minimal collector (fetch only, no business logic)
3. Enable `POST /internal/evidence/weather/vedur` on TripNARA
4. Verify `VEDUR_LIVE → NO_ACTION` on calm weather
5. **Then** formal 24h soak on Vedur authority config

---

## Evidence Ingest API (contract ready)

- **Path:** `POST /internal/evidence/weather/vedur`
- **Types:** `src/trips/guardian-decision-core/contracts/vedur-evidence-ingest.types.ts`
- **Env (TripNARA):**
  - `VEDUR_COLLECTOR_INGEST_ENABLED=1`
  - `VEDUR_COLLECTOR_HMAC_SECRET=<shared-secret>`
  - `VEDUR_COLLECTOR_ALLOWED_IDS=vedur-collector-pilot`
  - `VEDUR_COLLECTOR_INGEST_CANONICAL=0` until spike + integration verified

Signature covers: `method`, `path`, `requestId`, `timestamp`, `payloadSha256`, `collectorId`.

---

## If all candidates fail

Reassess whether Vedur can remain production authority source (Scheme B downgrade), rather than extending proxy architecture indefinitely.

**Timebox:** 72 hours — see `VEDUR_EGRESS_INVESTIGATION_HOURS`

---

## Observational soak (parallel)

Devbox prod canary may run **non-signoff** soak now:

```bash
npx tsx scripts/prod-canary-observational-soak-start.ts
```

Labels: `OBSERVATIONAL_SOAK`, `SIGNOFF_ELIGIBLE=false`, `WEATHER_AUTHORITY=open_meteo_fallback`

Does **not** unblock Production Canary GO.
