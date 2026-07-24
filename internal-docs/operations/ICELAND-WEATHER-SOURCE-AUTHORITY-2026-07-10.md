# Iceland Weather Source Authority — Frozen Policy

**Effective:** 2026-07-10  
**Status:** **FROZEN** pending Vedur egress resolution  
**SSOT:** [FORMAL-STATUS-SSOT-2026-07-10.md](./FORMAL-STATUS-SSOT-2026-07-10.md)

---

## Decision

**Vedur remains the authoritative Iceland weather risk source.**

Open-Meteo is an **availability fallback**, not a substitute for Vedur authority in production Canary sign-off.

---

## Source Tiers

| Tier | Label | May create hazard | May upgrade risk | May recover/clear Vedur risk | Production ordinary trips |
|------|-------|-------------------|------------------|------------------------------|---------------------------|
| **VEDUR_LIVE** | `vedur.is` / `iceland_met` | ✅ | ✅ | ✅ | ✅ (when monitoring enabled) |
| **OPEN_METEO_FALLBACK** | `open-meteo` / `global_weather` | ❌ alone | ❌ alone | ❌ | assist + NO_ACTION only |
| **REAL_SHAPE_REPLAY** | drill replay | drill only | drill only | drill only | ❌ forbidden |

### OPEN_METEO_FALLBACK rules

- May persist observation for audit
- May produce **SILENT / NO_ACTION** when calm
- May assist display / diagnostics
- **Must not** alone downgrade an active, unexpired **VEDUR_LIVE** PROHIBITED/ELEVATED assertion
- **Must not** drive calm-recovery streak that closes a Vedur-origin Problem

### REAL_SHAPE_REPLAY rules

- Explicit `ICELAND_VEDUR_REPLAY_ENABLED=1` or drill harness only
- Canary / engineering evidence only
- Must not enter ordinary production user trips

---

## Current Status Labels (strict)

| Label | Current (2026-07-10) |
|-------|----------------------|
| **Live API ingestion** | **GO** — Open-Meteo fallback path on prod canary |
| **Vedur authoritative ingestion** | **NO-GO** — TCP timeout to `130.208.87.200:443` |
| **REAL-SHAPE HAZARD REPLAY** | **GO** — Canary A/C drill evidence |

**Do not** write "Iceland official weather chain production-verified" until **Vedur authoritative ingestion GO**.

---

## Scheme A — Collector 路径（P0）

→ [VEDUR-COLLECTOR-FEASIBILITY-SPIKE.md](./VEDUR-COLLECTOR-FEASIBILITY-SPIKE.md)  
→ [VEDUR-COLLECTOR-INGEST-API.md](./VEDUR-COLLECTOR-INGEST-API.md)

| 组件 | 状态 |
|------|------|
| Feasibility spike 脚本 | **READY** — 待在 EU/冰岛候选主机执行 |
| Ingest API 契约 + 验签 | **READY** — `POST /internal/evidence/weather/vedur` |
| 最小 Collector | **BLOCKED** — 待 SPIKE_PASS |
| Observational soak | **STARTED** — `SIGNOFF_ELIGIBLE=false` |

Devbox = **negative control**（TCP timeout 已知）。

---

## Architecture Options (timebox: 72h)

### Scheme A — Vedur collector / proxy (recommended)

```
Vedur XML API (130.208.87.200)
  → independent collector (Iceland-reachable host)
  → signed raw payload + timestamp
  → TripNARA Evidence ingest API
```

Collector responsibilities only: fetch official XML, persist raw response, sign provenance. **No business judgment.**

### Scheme B — Open-Meteo as Canary primary (downgraded claim)

Canary may continue for **generic weather + execution loop** validation only.

**Cannot** claim Vedur official risk authority chain is production-verified.

---

## Code Enforcement

| Module | Behavior |
|--------|----------|
| `weather-source-authority.util.ts` | Blocks fallback tier downgrade of active Vedur risk |
| `weather-problem-recovery.util.ts` | Calm recovery requires `sourceProvider=iceland_met` |
| `evidence-resolver.service.ts` (dist) | Records `weatherSource`, `vedurDirectPass`, transition log |
| `iceland-weather.adapter.ts` | Reads `VEDUR_REQUEST_TIMEOUT_MS` |

Metric (structured log today, Prometheus later):

```
weather_source_transition_total{from="vedur",to="open_meteo",reason="timeout"}
```

---

## Before Formal 24h Soak

1. ✅ Freeze authority policy (this doc)
2. ⏳ Resolve Vedur egress **or** formally adopt Scheme B with downgraded claim
3. ⏳ Sync SSOT docs
4. ⏳ Start **formal** 24h soak on **final** source config only

Observational soak (non-sign-off) may run in parallel to surface Cron/lock/resource issues — it **does not** count toward Production Canary Sign-off.

---

## References

- [PRODUCTION-CANARY-GO-READINESS.md](./PRODUCTION-CANARY-GO-READINESS.md)
- [evidence/prod-canary-live-ingestion-2026-07-10.json](./evidence/prod-canary-live-ingestion-2026-07-10.json)
