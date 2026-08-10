# Contract — Observation pipeline status machine

**Status:** FROZEN candidate (Q6 / Q7 applied 2026-07-25)

---

## Happy path

```text
DRAFT
  → UPLOADING
  → EXTRACTING
  → GROUNDING
  → ASSESSING
  → COMPLETED
```

| Status | Meaning | Client progress copy |
|--------|---------|----------------------|
| DRAFT | Local / server draft before submit | — |
| UPLOADING | Media transfer | （可隐藏或“正在上传”） |
| EXTRACTING | Vision + OCR | 正在识别现场 |
| GROUNDING | Trip / GPS / vehicle / booking | 正在匹配当前位置 |
| ASSESSING | Reconcile + assess | 正在核对车辆与道路要求 / 正在检查行程影响 |
| COMPLETED | Assessment available for GET | — |

---

## Recapture path (Q7)

```text
INSUFFICIENT | COMPLETED(UNKNOWN) | …
  → MEDIA_APPENDED
  → EXTRACTING
  → GROUNDING
  → ASSESSING
  → COMPLETED  (new assessmentRevision)
```

`MEDIA_APPENDED` may be a brief transitional status or an event on the same entity; S1 must expose `captureRevision` either way.

---

## Terminal / error

| Status | Meaning | Assessment GET |
|--------|---------|----------------|
| UPLOAD_FAILED | Media upload failed | 422 |
| IMAGE_INVALID | Quality gate failed | 422 |
| CONTEXT_MISSING | Required trip context absent | 422 |
| MODEL_FAILED | Provider / Schema failure | 422 — **no fabricated result** |
| ASSESSMENT_FAILED | Grounding/assess exception | 422 |
| CANCELLED | User cancelled | 422 or 410 |

In-flight (not COMPLETED, not terminal) → Assessment GET **409** (`OBSERVATION_ASSESSMENT_NOT_READY`).

---

## Progress stages (API `progress.stage`)

```text
UPLOADING_MEDIA
EXTRACTING_SCENE
MATCHING_LOCATION
CHECKING_VEHICLE_ROAD_FIT
CHECKING_TRIP_IMPACT
FINALIZING
```

After ~8s wall time: “网络较慢，正在使用压缩图片继续分析”.  
User may leave; completion via in-app status.

---

## Transitions (normative)

- No skip from `UPLOADING` → `ASSESSING` without `EXTRACTING` + `GROUNDING`.  
- `COMPLETED` requires an `ObservationAssessment` row (may be `UNKNOWN`).  
- Re-assess **appends** revision; does not overwrite.  
- `MODEL_FAILED` must not populate fake `VERIFIED` facts.  
