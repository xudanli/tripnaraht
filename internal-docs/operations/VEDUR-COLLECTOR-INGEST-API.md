# Vedur Collector — Evidence Ingest API (Contract v1)

**Endpoint:** `POST /internal/evidence/weather/vedur`  
**Schema:** `vedur.raw.v1`

---

## Request

See `VedurEvidenceIngestRequest` in:

`src/trips/guardian-decision-core/contracts/vedur-evidence-ingest.types.ts`

Required fields include `tripId`, `dayIndex`, raw XML `payload`, `payloadSha256`, HMAC `signature`.

---

## Server responsibilities

1. Verify HMAC signature (not static API key alone)
2. Verify timestamp window (default 300s)
3. Verify payload SHA-256
4. Anti-replay via `requestId` ledger
5. Persist **immutable** raw XML + metadata
6. Mark `sourceProvider=iceland_met`, `transport=remote_collector`, `authoritative=true`
7. Phase 2: normalize → EvidenceEnvelope → Canonical chain

---

## Collector MUST NOT

- Decide hazard tiers
- Modify thresholds
- Create DecisionProblem / Repair
- Rewrite timestamps or source
- Send Open-Meteo data as Vedur
- Send “calm weather” on fetch failure → **VEDUR_UNAVAILABLE** only

---

## Collector failure semantics

| Collector state | TripNARA |
|-----------------|----------|
| Fetch fail | No ingest call (or explicit unavailable marker when implemented) |
| Ingest reject | No calm recovery, no Vedur risk clearance |
| Open-Meteo fallback | Assist only; cannot clear active Vedur risk |

---

## Environment

| Variable | Purpose |
|----------|---------|
| `VEDUR_COLLECTOR_INGEST_ENABLED` | Gate endpoint |
| `VEDUR_COLLECTOR_HMAC_SECRET` | Shared HMAC secret |
| `VEDUR_COLLECTOR_ALLOWED_IDS` | Allowlist collector IDs |
| `VEDUR_COLLECTOR_SIGNATURE_WINDOW_SEC` | Anti-replay window (default 300) |
| `VEDUR_COLLECTOR_INGEST_CANONICAL` | `0` until post-spike integration |

---

## Acceptance chain (post-collector)

```
Vedur XML → Collector → signed POST → raw persist → EvidenceEnvelope
  → WorldStateAssertion → Problem / NO_ACTION
```

Replay path: `replayMode=VEDUR_REAL_PAYLOAD_REPLAY` — Vedur-shaped, explicitly marked, not live poll.
