# ONT-P2-01 — Weather Production Shadow Pilot

**状态：** Shadow Gate **PASS** · Authorization **APPROVED**（SHADOW only）  
**工作项：** ONT-P2-01  
**上位：** [P2 Charter](./travel-ontology-p2-temporal-prediction-charter.md) · [Gate 0](./travel-ontology-p2-00-gate0-offline-validation.md) · [P1 Weather](./travel-ontology-p1-weather-deterioration-slice.md)

---

## 1. 范围

| 项 | 冻结值 |
|----|--------|
| 国家 | `IS` |
| 语义 | `WEATHER_DETERIORATION` only |
| 行程 | selected pilot trips（见 whitelist） |
| 权威 | 全部对象 `authorityMode=SHADOW` |

### 允许（只读）

- 读取现有 TravelWorldFact / 天气序列  
- 观察 Context Revision（**不** ++）  
- 读取路线 segment、车辆 class  
- 发出 SHADOW `PredictionRecord`  
- 在线 Outcome Reconciliation  
- 生产 Replay 导出  

### 禁止

- 修改 ConstraintAssessment  
- 修改 Plan Revision  
- 控制 READY / Confirm / Execute  
- 调用 OntologyCanonicalApply  
- 面向普通用户的时序建议（Shadow Gate 通过后仍须 **另开门禁**）  
- 增加第四条持续变化语义  

Kill Switch：`ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH=1`

---

## 2. 交付能力

| 能力 | 实现 |
|------|------|
| 预测版本替换 | `ShadowPredictionVersionStore` ACTIVE → SUPERSEDED |
| 在线对账 | tick 时用实际天气 Fact 序列 reconcile |
| 独立 Kill Switch | 环境变量 + semantic 列表 |
| 控制边界指标 | `ShadowControlBoundaryProbe`（全 0） |
| 生产 Replay | `tripnara.ontology_p2_weather_shadow_replay@v1` |

---

## 3. 命令与产物

```bash
npm run test:ontology-p2-weather-shadow
npm run ontology:p2-weather-shadow-pilot-approve
```

产物目录：`artifacts/ontology-p2/weather-shadow-pilot/`

| 文件 | 含义 |
|------|------|
| `weather-shadow-pilot-authorization.json` | **APPROVED** 审批件 |
| `shadow-gate.latest.json` | Shadow Gate 报告 |
| `production-pilot-report.latest.json` | Pilot 运行报告 |
| `production-replay.latest.json` | Replay 导出 |

---

## 4. Shadow Gate 通过后仍禁止

- 普通用户时序建议 UI / 文案投影  
- 第四条语义  
- 任何 Canonical 写路径  

下一步若要用户面时序建议，须单独 Gate（见 Charter）。

---

## 修订

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-23 | ONT-P2-01：提交并审批 Weather Production Shadow Pilot |
