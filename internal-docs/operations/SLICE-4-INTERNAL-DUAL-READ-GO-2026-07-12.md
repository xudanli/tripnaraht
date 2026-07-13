# Slice 4 Internal Dual-Read — GO (2026-07-12)

**Status:** **ACTIVE · Smoke Test PASS** (2026-07-12 devbox)  
**Prerequisite:** Slice 3 Native E2E **PASS** (evidence archived)  
**Next gate:** 24–48h observation → Internal Primary Projection

**Smoke evidence:** [`evidence/slice4-internal-dual-read-smoke-closure-2026-07-12.json`](./evidence/slice4-internal-dual-read-smoke-closure-2026-07-12.json)

---

## 1. What started

| Capability | State |
|------------|-------|
| Internal Dual-Read API | **ACTIVE** |
| Weather Continuous Live Allowlist | **ACTIVE** |
| Road Promotion | **OFF** |
| Notifications | **OFF** |
| Primary SSO (`ATTENTION_ROOT_CAUSE_PRIMARY_SSO`) | **OFF** |
| Visible Queue Cutover | **NO** |

---

## 2. Deploy env (Nest :3002)

Source:

```bash
config/decision-runtime/slice4-internal-dual-read.env
```

Or one-shot:

```bash
bash scripts/start-nest-3002-slice4-dual-read.sh
```

| Variable | Value |
|----------|-------|
| `ASSERTION_PROMOTION_SHADOW_MODE` | **0** (continuous live) |
| `ASSERTION_PROMOTION_WEATHER_ENABLED` | **1** |
| `ASSERTION_PROMOTION_ROAD_ENABLED` | **0** |
| `ASSERTION_PROMOTION_TRIP_ALLOWLIST` | `a0a99999-9999-4999-8999-999999999999,c0c77777-7777-4777-8777-777777777777` |
| `ATTENTION_ROOT_CAUSE_ORCHESTRATION` | **1** |
| `ATTENTION_ROOT_CAUSE_PRIMARY_SSO` | **0** |
| `ATTENTION_INTERNAL_DUAL_READ_ENABLED` | **1** |

**Rollback (one command):**

```bash
bash scripts/start-nest-3002-slice4-rollback.sh
```

Restores `ASSERTION_PROMOTION_SHADOW_MODE=1` via `assertion-promotion.env` and disables dual-read.

---

## 3. Internal Dual-Read API

**Endpoint:** `GET /api/trips/{tripId}/internal/attention-dual-read`

**Auth:** JWT + trip member + internal allowlist (`@tripnara.dev` / configured user ids / ADMIN|OPERATOR)

**Trip allowlist (default):**

| Trip | Purpose |
|------|---------|
| `c0c77777-7777-4777-8777-777777777777` | Execution Slip canary |
| `a0a99999-9999-4999-8999-999999999999` | Weather canary |

**Response shape:**

```json
{
  "currentQueueItems": [],
  "attentionPrimaryItems": [],
  "comparison": {
    "currentVisibleCount": 3,
    "attentionVisibleCount": 1,
    "reductionCount": 2,
    "hiddenProblemIds": [],
    "primaryProblemIds": [],
    "missedProblemIds": [],
    "openClusterCount": 1,
    "canonicalProblemCount": 3
  }
}
```

**Boundaries (frozen):**

- Does **not** replace `GET /trips/{tripId}/decision-queue`
- Does **not** send Attention notifications
- Does **not** enable Primary SSO
- Canonical problems remain in read model; frontend must **not** cluster locally

---

## 4. Internal UI checklist

- [ ] Side-by-side: **Current Queue** vs **Attention Primary Projection**
- [ ] Show `comparison.reductionCount`, `hiddenProblemIds`, `missedProblemIds`
- [ ] Confirm entry still via existing `decision-queue/{problemId}` + `accept-recommended`
- [ ] Poll 24–48h: no duplicate cards, no leaks, resolved items exit projection

---

## 5. Observation window (24–48h)

| Check | Pass criteria |
|-------|---------------|
| Duplicate cards | Zero — attention projection ≤ current queue |
| Missed cards | `comparison.missedProblemIds` empty under normal wind chain |
| Primary selection | `primaryProblemIds` matches expected (Execution Slip over Weather when infeasible) |
| Resolved exit | Resolved problems drop from `attentionPrimaryItems` |
| Rollback | `start-nest-3002-slice4-rollback.sh` restores shadow promotion |

After observation PASS → **Internal Primary Projection** (default UI shows Attention Primary, toggle to raw canonical).

---

## 6. Smoke Test（devbox PASS 2026-07-12）

```bash
bash scripts/start-nest-3002-slice4-dual-read.sh
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/slice4-internal-dual-read-smoke.ts
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/slice4-internal-dual-read-smoke.ts --phase=rollback
```

| Gate | Result |
|------|--------|
| Service Health | **PASS** |
| Internal Access Control | **PASS** |
| Canary Trip Restriction | **PASS** |
| Execution Canary Dual-Read | **PASS** |
| Weather Canary Dual-Read | **PASS** |
| Canonical Problem Mutation | **ZERO** |
| Queue Mutation | **ZERO** |
| Notification | **ZERO** |
| Road Promotion | **ZERO** |
| Rollback | **PASS** |

**Observation seed note:** 当前 Canary DB 状态 legacy queue 有 3（Exec）/ 2（Weather）可见项，但 attention ingest 仅 1 条 RFC001 canonical；24–48h 观察期需用强风链 seed 才能验证 merge/Primary 收敛。

---

## 7. References

- [**SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF.md**](../frontend/SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF.md) — Internal Comparison UI / BFF
- [SLICE-4-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md](./SLICE-4-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md) §11.1
- [ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md](../architecture/ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md)
- [WEATHER-PRODUCTION-CANARY-GO-2026-07-12.md](./WEATHER-PRODUCTION-CANARY-GO-2026-07-12.md)
