# Phase 2.4 — Calibration observation (retrieval vs resolve)

- **Run:** `artifacts/poi-planning-calibration-phase24-run.json`
- **Date:** 2026-04-19

## Observation table

| case | coverage | topAnchorRanks | unresolvedAnchorReasons | decision |
|------|------------|----------------|-------------------------|----------|
| 1_gc_normal_600 | 0 | all null | thingvellir/geysir/gullfoss: `not_in_topn` | retrieval |
| 2_gc_relaxed_600 | 0 | all null | same | retrieval |
| 3_gc_tight_360 | 0 | all null | same | retrieval |
| 4_gc_must_secret_lagoon | 0 | all null | same | retrieval |
| 5_gc_exclude_kerid | 0 | all null | same | retrieval |
| 6_gc_region_keyword | 0 | all null | same | retrieval |
| 7_no_gc_reykjavik | 1 | null | null | healthy |
| 8_repeat_like_1 | 0 | all null | same | retrieval |

## Verdict

**Batch:** **retrieval-dominant.** All Golden Circle cases show three anchors as `not_in_topn`; no batch of `name_unresolved` or `slug_unmatched`.

**Next step:** prioritize **candidate retrieval** (recall, required-anchor injection point, research POI merge order, anchor retention before TopN cut). Do **not** tune boost weights or add a second region until a later readout shows resolve-side dominance or healthy GC coverage.
