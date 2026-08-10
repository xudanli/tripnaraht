# Contract — HTTP API sketch (P0)

**Status:** FROZEN candidate (Q6 / Q7 applied 2026-07-25)  
**Base:** `/v1/trips/:tripId/observations`  
**Auth:** trip member; Apply is **not** on these endpoints

---

## 1. Create observation

```http
POST /v1/trips/:tripId/observations
```

Request:

```json
{
  "intent": "CHECK_ROAD",
  "dayIndex": 4,
  "capturedAt": "2026-07-25T15:23:10Z",
  "location": {
    "latitude": 64.0123,
    "longitude": -19.1034,
    "accuracyMeters": 8
  },
  "heading": 121,
  "mediaRefs": ["media_001"],
  "question": "这条路能走吗？"
}
```

Response `202` / `200`:

```json
{
  "observationId": "obs_001",
  "status": "EXTRACTING",
  "captureRevision": 1
}
```

---

## 2. Get status

```http
GET /v1/trips/:tripId/observations/:observationId
```

```json
{
  "observationId": "obs_001",
  "status": "ASSESSING",
  "progress": { "stage": "CHECKING_TRIP_IMPACT" },
  "verificationStatus": "UNVERIFIED",
  "captureRevision": 1
}
```

---

## 3. Get assessment (Q6)

```http
GET /v1/trips/:tripId/observations/:observationId/assessment
```

### When `status === COMPLETED`

`200` + latest `ObservationAssessment` (include `assessmentRevision`).

### When not yet `COMPLETED` (in-flight)

`409 Conflict`:

```json
{
  "code": "OBSERVATION_ASSESSMENT_NOT_READY",
  "observationId": "obs_001",
  "status": "ASSESSING",
  "progress": { "stage": "CHECKING_TRIP_IMPACT" },
  "retryAfterMs": 1200
}
```

iOS: update progress; honor `retryAfterMs`; **no error toast**.

### When terminal failure

`422 Unprocessable Entity` example:

```json
{
  "code": "OBSERVATION_CONTEXT_INSUFFICIENT",
  "status": "CONTEXT_MISSING",
  "recoverable": true,
  "action": "RECAPTURE_OR_ENABLE_LOCATION"
}
```

**Do not use** 404 / 202 / 200-partial / 204 for in-flight assessment.

---

## 4. Add media (recapture) — Q7

```http
POST /v1/trips/:tripId/observations/:observationId/media
```

```json
{
  "mediaRefs": ["media_002"],
  "capturedAt": "2026-07-25T15:30:00Z",
  "reason": "SYSTEM_RECAPTURE_REQUEST"
}
```

Effects:

- Same `observationId`
- Append `mediaRefs`
- Increment `captureRevision`
- Re-enter `EXTRACTING` (via `MEDIA_APPENDED`)
- Prior assessment revisions retained

---

## 6. PATCH context / Feedback（S9）

```http
PATCH /v1/trips/:tripId/observations/:observationId/context
POST /v1/trips/:tripId/observations/:observationId/assessment/feedback
```

PATCH body（示例）：`location`、`dayIndex`、`tripContext`、`confirmedIntent`、`reassess`。  
COMPLETED 默认重评估；`reassess: false` 仅合并。

Feedback body：`assessmentId`、`result`（HELPFUL|NOT_HELPFUL|WRONG|UNCLEAR）、可选 `userCorrection`。

---

## 7. Delete observation

```http
DELETE /v1/trips/:tripId/observations/:observationId
```

Effects:

- Immediate hide + revoke credentials  
- Object-store delete queue (P95 ≤ 15 min physical)  
- Return `deletionReceipt` (deleted vs retained)  
- Original TTL if not deleted: `LOOK_MEDIA_SHORT_TERM_V1`

---

## Non-endpoints (P0)

| Forbidden | Why |
|-----------|-----|
| `POST …/observations/:id/apply` | Q2 — Apply only via existing Confirm |
| `PATCH …/world-state` from Look | Vision cannot write authority |
| Admin “force VERIFIED” without evidence | Safety |

---

## Media upload

Prefer trip-files category `FIELD_OBSERVATION` (name TBD).  
Resume/retry; retention `min(72h, tripEnd+24h)`.
