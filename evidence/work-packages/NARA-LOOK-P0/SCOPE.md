# NARA-LOOK-P0 SCOPE

**Status:** FROZEN candidate (Open Questions CLOSED 2026-07-25)  
**Phase:** P0 MVP · TRAVELING only

---

## IN

### Scenarios (P0)

1. `CHECK_VEHICLE` — vehicle class / drivetrain cues vs planned roads  
2. `CHECK_ROAD` — road signs / surface / closure cues vs route + vehicle + official status  
3. `CHECK_ACTIVITY_ENTRY` — operator / entry sign vs booking meeting point  
4. `CHECK_PARKING` — parking sign OCR + local time / official rules (RealityOS P0-A；V1.1 keys)  
5. `CHECK_RENTAL_HANDOVER` — rental pickup/return EvidencePackage (RealityOS P0-B；V1.2 keys；no liability / no auto-send / PDF = P0.5)

### Product surfaces

- iOS: scene select → camera / library → confirm → analyzing → result  
- Entry points: execution overview shortcut, Ask NARA chips, risk detail “补充现场照片”, activity card “确认集合点”  
- Evidence sheet, recapture sheet, Preview entry (no Apply without confirm)  
- User delete of original media  
- Analytics events listed in PRD §十七

### Backend / AI

- Thin Nest module `src/travel-observation/` (or equivalent path under `src/trips/`)  
- Contracts: `TravelObservationEvent`, `ObservationContext`, `ObservationAssessment`, `RawVisualObservation`  
- `ObservationChannel = 'LOOK_FIELD'` (not Assessment Lane)  
- P0 Semantic Keys (frozen list)  
- Schema-gated multimodal + OCR extraction  
- Grounding + reconciliation into existing evidence / constraint / decision paths  
- HTTP: create / get status / get assessment (409 until COMPLETED) / add media / delete  
- Media TTL eng default: `LOOK_MEDIA_SHORT_TERM_V1 = min(72h, tripEnd+24h)`

---

## OUT / FORBIDDEN (P0)

- Continuous video understanding / always-on camera  
- Background audio / emotion / medical inference  
- Full AR navigation / HUD / car cameras  
- AI glasses as required terminal  
- Auto-modify itinerary without Confirm  
- Vision model writing authoritative World State directly  
- General-purpose “识图聊天” outside Look intents  
- Parallel authoritative write corridor for Look-only Apply  
- Fourth decision ledger store  
- Claiming road is “absolutely safe” from image alone  
- Global TravelContext SSOT refactor  
- OR-Tools authoritative Apply  
- Microservice split / GraphQL for Look

---

## Deferred (P1+)

| Item | Earliest |
|------|----------|
| Rental contract / insurance OCR | P1 |
| Dashboard fault cues | P1 |
| Short video observation | P1 |
| Offline OCR | P1 |
| Glasses capture + short result | P1 (after Go/No-Go) |
| AR entry guidance | P2 |
| B2B rental handover | P2 |

---

## Acceptance (S0 package)

- [ ] Contracts reviewed (CS + Arch)  
- [ ] SCOPE IN/OUT agreed (PM + Arch)  
- [ ] Privacy/safety defaults agreed or DEFER-with-default (SEC)  
- [ ] Open questions closed (`OPEN_QUESTIONS.md`)  
- [ ] Signatures recorded  

Code implementation is **out of S0**; S0 only freezes contracts and boundaries.
