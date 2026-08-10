# 规划阶段 · Iceland Self-Drive Situation 接口要求

> 依据 iOS `IcelandSelfDriveSituation*` 模型（Pack `tripnara.iceland.self_drive_situation.client@v1`）与验收 fixture 整理。  
> **产品边界：** 规划期「当前自驾状态」诊断卡 / Situation 详情；**不是**行中「今日自驾状态」、**不是**整体准备度报告、**不是**团队规划状态。  
> **最后更新：** 2026-07-21  
> **实现：** `projectIcelandSelfDriveSituationClient` · `GET /trips/:tripId/iceland-self-drive-situation` · `decision-problems.icelandSelfDriveSituation`

**相关能力边界：**

| 能力 | 路径 / 文档 | 与本能力关系 |
|------|-------------|--------------|
| Situation（本页） | `iceland-self-drive-situation` / `decision-problems.icelandSelfDriveSituation` | 规划期路线可行性诊断 |
| 今日自驾状态 | [DAILY_DRIVE_STATUS_API.md](../../../trips/daily-drive/DAILY_DRIVE_STATUS_API.md) | 行中当日出发快览；**不**用 Situation 顶替 |
| 自驾准备度报告 | `overall-readiness?view=self_drive_report` | 行前 checklist；可从 Situation CTA 跳转 |
| 创建/自驾设置 | [ICELAND_SELF_DRIVE_IOS_API.md](../../../trips/iceland-self-drive/ICELAND_SELF_DRIVE_IOS_API.md) | `vehicle` / 保险等回流到 `vehicleRoadFit` / `insurance` |
| 行中路况清雪 | `mobile/.../execution/road-conditions` | 清雪 live 条；与 `road.plow*` **同源语义** |

**验收样例：** [.docs/iceland-self-drive-situation-acceptance-fixture.json](../../../../.docs/iceland-self-drive-situation-acceptance-fixture.json)  
**冒烟脚本：** `scripts/iceland-situation-smoke.sh`

---

## 路径

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| **主读（规划）** | `GET` | `trips/{tripId}/decision-problems` | `data.icelandSelfDriveSituation` |
| 专用读 | `GET` | `trips/{tripId}/iceland-self-drive-situation` | 同形对象 |
| 问题详情 | `GET` | `trips/{tripId}/decision-problems/{problemId}` | 可选同挂 |

非冰岛自驾：专用路由 `404` + `NOT_ICELAND_SELF_DRIVE`；列表/详情**省略**字段。

`schemaId`: `tripnara.iceland.self_drive_situation.client@v1`（亦下发兼容别名 `schema`）。

## 投影要点（后端）

1. `summary` / `aggregateReasons` **人话**（投影层剥离 `aggregate=` 遥测）。
2. `vehicleRoadFit` 主字段：`fitStatus` / `summaryZh` / `vehicleLabel` / `roadLabel` / `recommendedActions`（旧 `status`/`vehicleClass`/`conditionsToProceed` 仍保留兼容）。
3. `insurance` 主字段：`coverageTier` / `routeExposure{flags,gravel,…}` / `gaps[{code,exposure,status,summaryZh}]` / `fordAlwaysExcluded`（旧 `tier`/`fordingExcluded`/`gaps.dimension` 仍保留）。
4. `daylight.stack`：`fullLoadStack` / `nightDrivingRequired` / `exceedsComfortWindow`（旧 stack 键保留）。
5. `driving-settings.vehicle`（`vehicleClass` / `vehicleClassLabel` / `rentalRestrictions`）经 `loadTripContext` 回流；`no_f_road` → `fRoadAllowed=false`。
6. 专用 GET 会 `ensureP0Shells`，保证 `deepLink.problemIdHint`（`dc_insurance_*` / `dc_vehicle_*`）可命中。
7. 时间类一律区间或当地分钟；禁止伪造营业时刻 / 清雪单点 ETA。

实现文件：`iceland-self-drive-situation.client.ts` · `build-iceland-self-drive-situation.client.ts` · `decision-case.service.ts` · `iceland-self-drive-situation.controller.ts`
