# Gold scenario v1 fields

```json
{
  "schemaId": "tripnara.planning_gold_scenario@v1",
  "scenarioId": "iceland.road_close.f208_single_day_demo",
  "status": "active" | "stub" | "retired",
  "countryCode": "IS",
  "family": "road_close" | "wind" | "blue_ice" | "parking_full" | "hotel_change" | "reservation_delay",
  "title": "human title",
  "seed": 42,
  "stabilityRuns": 20,
  "maxChangedActivities": 4,
  "provenance": "synthetic_template_v1" | "staging_replay" | "real_ops",
  "evidencePackRef": "repo-relative path (required for staging_replay|real_ops)",
  "solverProblemRef": "relative path under repo root OR omit if solverProblem inline",
  "solverProblem": { "...SolverProblem..." },
  "notes": []
}
```

- **Candidate Stability**：同一 `seed` 连续 `stabilityRuns`（Lab 默认≥20，M4 签核≥100）次求解，候选 `nodeIds` 序列哈希一致率 100%。  
- **Repair Locality**：相对 base order，触及活动数 ≤ `maxChangedActivities`（若声明）。  
- **M4 real_gold_replay**：`provenance` ∈ {staging_replay, real_ops} 且 `evidencePackRef` 文件存在（见 `evidence/`）。  
- stub 族仅占位，Replay 跳过。
