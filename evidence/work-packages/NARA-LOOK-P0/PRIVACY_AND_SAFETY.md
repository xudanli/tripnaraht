# Privacy & Safety — NARA Look P0

**Status:** Eng default **FROZEN** (Q4, 2026-07-25); Legal confirmation required for production ship  
**Product rule:** Opt-in capture only; no always-on monitoring

---

## Permissions (iOS)

| Permission | When requested |
|------------|----------------|
| Camera | First open of camera scene |
| Photo Library | Only when user taps album |
| Precise Location | First submit needing geo (or first road/entry scene) |
| Upload / network | Implicit on submit; show privacy sheet first run |

**Forbidden:** request all permissions at app launch for Look.

---

## First-run privacy copy (PM may edit wording)

> NARA Look 只在你主动拍摄并提交后分析图片。  
> 系统会结合位置和当前行程进行判断。  
> 请避免拍摄无关人员、护照和其他敏感信息。

---

## Retention — FROZEN eng default (Q4)

```ts
LOOK_MEDIA_SHORT_TERM_V1 = min(
  capturedAt + 72 hours,
  tripEnd + 24 hours
);
```

| Data | Policy | ID |
|------|--------|-----|
| Unsubmitted draft (device) | 24h then purge | `LOOK_DRAFT_24H` |
| Original cloud media | `min(72h, tripEnd+24h)` | `LOOK_MEDIA_SHORT_TERM_V1` |
| Redacted thumbnail | User setting; default follow trip | `LOOK_THUMB_TRIP` |
| Structured Observation | Follow trip lifetime | `LOOK_EVENT_TRIP` |
| Risk Assessment in ledger | Follow Decision Ledger / audit | `LOOK_ASSESS_LEDGER` |
| User delete | Immediate hide + revoke + delete queue; deletionReceipt | `LOOK_DELETE_NOW` |

**Targets:** API access revoked immediate; physical object delete P95 ≤ 15 minutes.  
**Legal:** may shorten TTL; must not lengthen without re-review.  
UI after delete must state what was removed vs retained (ledger redacted summary).

---

## Sensitive content

On detect (or high suspicion), prompt user before / after submit:

- Face / child  
- License plate  
- Passport / driver license  
- Payment card  
- Full contract / insurance sensitive pages  

P0: warn + optional redaction flag; do not build full PII classifier beyond flags if capacity limited — **minimum** is user-facing warning + delete.

---

## Driving safety

### Detect (proposed thresholds — SEC/PM confirm)

| Signal | Threshold |
|--------|-----------|
| Speed | > 8 km/h (or CoreMotion automotive + speed) |
| Role | Current driver |
| Device motion | Automotive moving |

### When blocked

Canonical copy (Q8):

> 当前车辆正在移动。请在安全停车后使用 NARA Look，或交由同行成员操作。

CTA: `稍后处理` / `由同行成员操作` — **不得**提供“仍然打开相机”。

| Action while moving | Allowed? |
|---------------------|----------|
| Full photo confirm + submit | No (driver) |
| Complex Preview / edit itinerary | No |
| Passenger (non-driver) use | Yes |
| “稍后处理” | Yes |
| Resume after stop | Yes |

---

## Decision safety (repeat of architecture)

- Image ≠ authoritative World State  
- High-risk conclusions need multi-source reconciliation  
- Official conflict → `CONFLICTING` / uncertainty  
- Show data update timestamps on formal conclusions  
- No fabricated results on model failure  
