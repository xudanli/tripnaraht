# Signatures — NARA-LOOK-P0 Sprint 0 / S1 Entry

**Open Questions:** CLOSED 2026-07-25  
**S1 Code Entry:** APPROVED (scoped mock / contract implementation)  
**Production media policy:** Legal CONDITIONAL (eng default frozen)

---

## Decision ownership (Q1–Q8)

| Function | Required sign-off on | Status |
| -------- | -------------------- | ------ |
| Architecture | Q1, Q2, Q6, Q7 | **REQUIRED** |
| PM | Q2, Q5, Q8 | **REQUIRED** |
| Chief Scientist | Q3, Q5 | **REQUIRED** |
| Security | Q4 | **REQUIRED** |
| Legal | Q4 | **CONDITIONAL FOR PRODUCTION, NOT BLOCKING S1 MOCK IMPLEMENTATION** |
| iOS Lead | Q6, Q8 | **REQUIRED** |

---

## Joint review sign-off

| Role | Name | Decision | Date | Covers |
|------|------|----------|------|--------|
| Chief Scientist | | APPROVE / REQUEST_CHANGES | | Q3, Q5 + Semantic Keys |
| Tech Architect | | APPROVE / REQUEST_CHANGES | | Q1, Q2, Q6, Q7 + integration bans |
| Product Manager | | APPROVE / REQUEST_CHANGES | | Q2, Q5, Q8 + CTA_AND_ROLES |
| Security / Privacy | | APPROVE / REQUEST_CHANGES | | Q4 eng default `LOOK_MEDIA_SHORT_TERM_V1` |
| Legal | | APPROVE / DEFER | | Q4 production TTL (may shorten only) |
| iOS Lead | | APPROVE / REQUEST_CHANGES | | Q6 409 client behavior + Q8 copy |

---

## S1 entry vs production

| Gate | Requirement |
|------|-------------|
| Start S1 scoped coding | Open Questions CLOSED (done) + Arch/PM/CS/iOS/Security eng defaults acknowledged |
| Ship Pilot / production media | Legal APPROVE or written DEFER accepting eng TTL; Security APPROVE |
| Glasses | Unrelated — PRD §二十五 |

Glasses / continuous video remain **HOLD** regardless of these signatures.

---

## Change control

After APPROVE, edits to frozen Semantic Keys, write bans, CTA/role matrix, or retention formula require a new dated amendment and re-sign of affected roles.  
Implicit drift in implementation is **forbidden** — use RFC.

### Amendments

| Date | Change | Roles re-signed |
|------|--------|-----------------|
| 2026-07-25 | Open Questions CLOSED; Q4 TTL → `min(72h, tripEnd+24h)`; Q8 CTA/roles freeze | Decision record applied to package |
