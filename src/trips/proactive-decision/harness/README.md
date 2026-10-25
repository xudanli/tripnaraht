# Proactive Decision V1 — Harness 种子索引

对照 RFC-PD-001 §10 F1–F10。统一套件：

`src/trips/proactive-decision/harness/proactive-decision-v1.harness.spec.ts`

| F# | 本套件断言 | 既有种子（不复制逻辑） |
|---|---|---|
| F1 | OBSERVED → IMPACT_DETECTED | vedur / weather evidence specs |
| F2 | `decisionRequired` + `affectedItems` | iceland-weather-activity-l2；road-close ICE-IMPACT-001 |
| F3 | 三 Case 映射 + RFC001 problem | Guardian detector |
| F4 | Abu + Dr.Dre 激活 | abu-weather-activity-constraint；persona-closure |
| F5 | Neptune 按需 | persona-closure repair-skip |
| F6 | Synthesis recommended | cgus-search（全量 CGUS 仍 flag 关） |
| F7 | Change Draft 投影 | productization PG-ADJUST |
| F8 | Confirm → Apply（port） | confirm-apply-idempotency.matrix |
| F9 | Hard Gate 不可 KEEP | road-close ICE-BLOCK；froad-2wd |
| F10 | notifyUser=false；Silent 有记录 | intervention-intelligence；proactive-surface-pilot |

Fixtures：`PROACTIVE_V1_HARNESS_FIXTURES`（Reynisfjara 风 14→25 / F-road / 冰川窗口）。  
Phase 4 黄金案例：`harness/phase4-golden-cases.e2e.spec.ts`  
Decision Trace：`trace/`（`nara.proactive_decision_trace@v1`）  
Shadow Canary + Trip Replay：`shadow/`（Stage 0 Log · `PROACTIVE_TRIP_REPLAY_SCENARIOS`）
