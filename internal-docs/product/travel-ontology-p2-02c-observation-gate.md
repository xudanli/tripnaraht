# ONT-P2-02C — Internal Advisory Observation Gate

**状态：** Observation Gate **PASS**（依赖已冻结的 02B Observation Report）  
**上位：** [P2-02B](./travel-ontology-p2-02b-internal-temporal-advisory.md) · [P2 Charter](./travel-ontology-p2-temporal-prediction-charter.md)

## 通过条件

1. 02B Observation Report **FROZEN** 且 observationVerdict=PASS  
2. **建议版本一致**：无 prediction mismatch / stale / withdrawal failure；反馈绑定 predictionVersion  
3. **控制边界全零**（Canonical Apply、Assessment、Plan、READY/Confirm/Execute、外部发射、multi-active 等）  
4. **内部理解无未裁决问题**：unclear 受控、无 unresolved actionable FN、故障注入全绿  
5. **反馈与对账完整**：completion ≥ 0.4、reconciled ≥ 5、emitted ≥ 20  

通过后允许：**提交** ONT-P2-03A（不自动批准）。

## 命令

```bash
npm run test:ontology-p2-observation-gate
npm run ontology:p2-observation-gate
```

产物：`artifacts/ontology-p2/internal-advisory/internal-advisory-observation.frozen.json`  
`artifacts/ontology-p2/internal-advisory/observation-gate.latest.json`
