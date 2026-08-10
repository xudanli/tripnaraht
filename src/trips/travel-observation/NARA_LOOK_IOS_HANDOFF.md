# NARA Look · iOS 对接文档（S1 Capture + S5 Result）

> **状态**：后端可联调（S1–S9 + 媒体上传 + 列表 + 行中首页）  
> **日期**：2026-07-26  
> **读者**：iOS 客户端  
> **原则**：Look **只到 Assessment + Preview 入口**；**禁止** Look Apply / PlanVersion 写。

**相关文档**

- 工作包：[`evidence/work-packages/NARA-LOOK-P0/`](../../../evidence/work-packages/NARA-LOOK-P0/README.md)
- Open Questions（CLOSED）：[`OPEN_QUESTIONS.md`](../../../evidence/work-packages/NARA-LOOK-P0/OPEN_QUESTIONS.md)
- CTA / 角色冻结：[`CTA_AND_ROLES.md`](../../../evidence/work-packages/NARA-LOOK-P0/s0-contracts/CTA_AND_ROLES.md)
- TS Client SSOT：[`dto/frontend-nara-look-api-client.ts`](./dto/frontend-nara-look-api-client.ts)
- 类型：[`dto/frontend-nara-look-api.types.ts`](./dto/frontend-nara-look-api.types.ts)
- Result / Evidence / Preview：[`dto/frontend-nara-look-result.ts`](./dto/frontend-nara-look-result.ts)
- UWC Preview（改行程时）：[`../../decision-runtime/execution/authoritative-write/UWC_1E_WEB_IOS_HANDOFF.md`](../../decision-runtime/execution/authoritative-write/UWC_1E_WEB_IOS_HANDOFF.md)

---

## 1. 产品一句话

| 概念 | 含义 | 接口 |
|------|------|------|
| **NARA Look** | 拍照 → 现场观察 → 行程影响 → 建议 | `/api/v1/trips/{tripId}/observations` |
| **Observation Channel** | `LOOK_FIELD`（不是 Assessment Lane） | 响应字段 `channel` |
| **Assessment** | 四层结论；`writesPlanVersion=false` | `GET …/assessment` |
| **改行程** | 打开既有 Decision / Repair / Arrange Preview | **不是** Look Apply |

```text
场景选择 → 相机/相册 → 确认提交
  → POST observations
  → ANALYZING（GET status；GET assessment 遇 409 当进度）
  → RESULT（CTA）
  → PREVIEW ref（若有）→ 既有 Confirm 链
```

---

## 2. 环境与约定

| 项 | 值 |
|----|-----|
| Base URL | `{HOST}/api` |
| 路径前缀 | `/v1/trips/{tripId}/observations` |
| 鉴权 | `Authorization: Bearer <token>`；S1 mock 后端当前 `@Public()` |
| Assessment 未就绪 | **HTTP 409** + `OBSERVATION_ASSESSMENT_NOT_READY` — **禁止 error toast** |
| 终端失败 | **HTTP 422** |
| 媒体 TTL | `LOOK_MEDIA_SHORT_TERM_V1 = min(72h, tripEnd+24h)` |

---

## 3. Capture Mock 页面状态机

SwiftUI 屏幕枚举与 TS `NaraLookCaptureScreen` / `nextCaptureScreen` 对齐：

```text
SCENE_SELECT
  → CAMERA
  → CONFIRM
  → ANALYZING
  → RESULT
       ├→ RECAPTURE_SHEET → CAMERA（同 observationId append media）
       ├→ EVIDENCE_SHEET
       └→ Preview（外部 UWC / Decision）— 无 Look Apply
```

驾驶中：`DRIVING_BLOCK`（不得提供「仍然打开相机」）。

---

## 4. API 总表（P0）

| Method | Path | 用途 |
|--------|------|------|
| `POST` | `/v1/trips/{tripId}/media` | **上传现场图**（multipart `file`）→ `{ mediaId, mediaRef }` |
| `GET` | `/v1/trips/{tripId}/media/{mediaId}` | 媒体元数据 |
| `POST` | `/v1/trips/{tripId}/observations` | 创建观察（`mediaRefs` 必填；勿依赖 mockLocalMedia） |
| `GET` | `/v1/trips/{tripId}/observations` | 列表（`limit` / `cursor` / `filter`） |
| `GET` | `/v1/trips/{tripId}/observations/{id}` | 状态 / progress.stage |
| `GET` | `/v1/trips/{tripId}/observations/{id}/assessment` | 结论；未完成 **409** |
| `POST` | `/v1/trips/{tripId}/observations/{id}/assessment/feedback` | 结果反馈（§16.7；无 Apply） |
| `PATCH` | `/v1/trips/{tripId}/observations/{id}/context` | 补上下文 / 可选重评估（§16.5；如开定位重试） |
| `GET` | `/v1/trips/{tripId}/observations/{id}/decision-problem` | S4 关联 DecisionProblem（Preview only） |
| `GET` | `/v1/trips/{tripId}/observations/{id}/evidence-package` | 租车证据包（P0-B） |
| `POST` | `/v1/trips/{tripId}/observations/{id}/media` | 补拍（同 id，`captureRevision++`） |
| `DELETE` | `/v1/trips/{tripId}/observations/{id}` | 删原图 + `deletionReceipt` |

**列表 query**

| 参数 | 说明 |
|------|------|
| `limit` | 主页建议 `3`；历史默认 ≤50 |
| `cursor` | 上一页最后一项的 `observationId` |
| `filter` | `all` \| `road` \| `vehicle` \| `activity` \| `parking` \| `rental` |

列表项含：`observationId`、`intent`、`filter`、`titleZh`、`summaryZh`、`capturedAt`、`placeLabelZh?`、`status`（`needs_plan_change` \| `attention` \| `normal` \| `reference_only`）、`detailKind`（`assessment` \| `evidence` \| `evidence_package`）、`thumbnailUrl?`。

**推荐提交流程（Release）**

```text
1. POST …/media  (multipart file) → mediaRef
2. POST …/observations { intent, capturedAt, mediaRefs: [mediaRef], location? }
3. 轮询 GET …/assessment（409 = 进度）
```

**禁止实现：** `POST …/apply`、任何 PlanVersion 写。

行中配套（Mobile BFF，非 Look 专属）：

| Method | Path |
|--------|------|
| `GET` | `/mobile/trips/{tripId}/execution/in-trip-home` |
| `GET` | `/mobile/trips/{tripId}/execution/overview-dashboard` |
| `GET` | `/mobile/trips/{tripId}/execution/daily-drive-status` |

**禁止实现：** `POST …/apply`、任何 PlanVersion 写。

Assessment 若含 `decisionProblem.linkedDecisionProblemId`，主 CTA 的 `previewRef` 为 `decision:{id}`（Q2）。F-road 不适配另有 `constraintBridgeKey=OFFICIAL_IS_FROAD_2WD`。

S4-BE-02：同一 `problemId` 会投影进 RFC-001 DecisionProblem store（`triggerEventId=look_obs:{observationId}`），供 Decision Gateway 列表/详情；**仍无 Look Apply**。

S4-BE-03：投影时解析 `planVersionId`（effective → trip revision → pending）与最新 WorldState snapshot；成功后 `invalidateCache(tripId)`，与 TEP 对齐。

S4-BE-04：Grounding 后将观察事实写入 WorldState，谓词仅为 `look.field_observation`（`authoritative=false`，`USER`/`NARA_LOOK`）；**禁止**写 `road.status`。

S4-BE-05：Assessment 含 `authority`（§10.4）与 `contextHash`（GRD-FR-008）。`VISUAL_ONLY` 不得单独支撑 EXECUTION_BLOCK。API 路径以工程 `…/observations` 为准，见工作包 `API_NAMING_MAP.md`。

S7：`intent=CHECK_PARKING` — 完整停车牌；无 GPS 仅视觉说明；付费区 CTA「设置离开提醒 / 查看原文」；不承诺免罚。

S8：`intent=CHECK_RENTAL_HANDOVER` — 取还车多角度留证；`GET …/evidence-package`；AI 可标疑似损伤但 **不认定责任、不自动发给租车公司**；PDF 导出为后续能力。

S9：`PATCH …/context`（开定位 / 补 booking 后可默认重评估）；`POST …/assessment/feedback`（HELPFUL / NOT_HELPFUL / WRONG / UNCLEAR）。均 **不写 PlanVersion**。


---

## 5. 推荐调用顺序（Release）

```text
1. 场景选择 intent = CHECK_ROAD | CHECK_VEHICLE | CHECK_ACTIVITY_ENTRY | CHECK_PARKING | CHECK_RENTAL_HANDOVER
2. 权限：相机（进 CAMERA 时）；相册（点相册时）；定位（提交前或道路/入口场景）
3. 拍/选图 → 本地质量提示 → CONFIRM
4. POST …/media (multipart field `file`) → mediaRef   【必须；Release 勿依赖 mockLocalMedia】
5. 若无定位：仍可提交；结果为 INFO + NO_GPS CTA（开启定位后重试 / 仅查看标志说明）
6. POST observations { intent, capturedAt, mediaRefs: [mediaRef], location?, heading?, question?, mockLocalMedia: false }
   - `mediaRefs: string[]` **必填**
   - 别名可用：`mediaIds` / `mediaRef` / `images`
7. 进 ANALYZING：
     loop:
       GET observation
       GET assessment
         409 → 更新进度文案；sleep(retryAfterMs)；continue
         200 → RESULT（真实 assessment）
         422 → 重试/删除 CTA
8. RESULT：按 status 映射 CTA（见 §6）
9. NO_GPS 重试：PATCH …/context { location, reassess: true } → 再 GET assessment
10. RECAPTURE：先 POST …/media 拿新 mediaRef，再 POST …/observations/{id}/media { mediaRefs, reason: SYSTEM_RECAPTURE_REQUEST }
11. 主页最近观察：GET …/observations?limit=3；历史：limit+cursor+filter；点开用 observationId 拉 assessment / decision-problem
12. PREVIEW action：打开 previewRef 对应既有 Preview（UWC / Decision）— Confirm 不在 Look 内
13. 租车：GET …/evidence-package（complete=false 时引导补拍）
14. 可选：POST …/assessment/feedback
```

进度文案（禁止泛化「AI 思考中」）：

| stage | 中文 |
|-------|------|
| EXTRACTING_SCENE | 正在识别现场 |
| MATCHING_LOCATION | 正在匹配当前位置 |
| CHECKING_VEHICLE_ROAD_FIT | 正在核对车辆与道路要求 |
| CHECKING_TRIP_IMPACT | 正在检查行程影响 |

>8s：可显示「网络较慢，正在使用压缩图片继续分析」。

---

## 6. CTA / 权限（冻结）

完整表见 CTA_AND_ROLES。客户端必须：

| 规则 | 行为 |
|------|------|
| Member / Advisor | 不可 Confirm Apply |
| Advisor | 默认不可 Capture |
| Driver Apply | 需 `CAN_CONFIRM_EXECUTION_CHANGE` 且非行驶中 |
| EXECUTION_BLOCK | 禁止「继续 / 忽略 / 仍然前往 / Keep current plan」 |
| Look assessment | 断言 `writesPlanVersion === false` |

TS helper：`createNaraLookApiClient(…).resolveCta(status, 'zh')`。

---

## 7. 入口（产品）

| 入口 | 默认 intent |
|------|-------------|
| 执行总览「让 NARA 看一下」 | SCENE_SELECT |
| 问 NARA：看一下这条路 | CHECK_ROAD |
| 问 NARA：检查当前车辆 | CHECK_VEHICLE |
| 问 NARA：帮我找集合点 | CHECK_ACTIVITY_ENTRY |
| 问 NARA：这里能停车吗 | CHECK_PARKING |
| 问 NARA：取车/还车留证 | CHECK_RENTAL_HANDOVER |
| 风险详情「补充现场照片」 | CHECK_ROAD（可带 question） |
| 活动卡「确认集合点」 | CHECK_ACTIVITY_ENTRY + booking context |

---

## 8. S1 Mock 行为说明（给 QA）

当前后端：

- 同步 mock 管线 → 常直接 `COMPLETED`
- 无 GPS → `INFO` + `DATA_UNCERTAINTY.GPS_INSUFFICIENT`（无道路 EXECUTION_BLOCK）
- 有 GPS → `UNKNOWN` + 补拍引导（真视觉在 S2）
- 存储内存：进程重启丢失

联调仍应实现完整 409 轮询与补拍同 id 逻辑。

---

## 9. Swift 模型建议

```swift
enum ObservationChannel: String, Codable { case lookField = "LOOK_FIELD" }
enum LookIntent: String, Codable {
  case checkVehicle = "CHECK_VEHICLE"
  case checkRoad = "CHECK_ROAD"
  case checkActivityEntry = "CHECK_ACTIVITY_ENTRY"
  case checkParking = "CHECK_PARKING"
  case checkRentalHandover = "CHECK_RENTAL_HANDOVER"
}
// Assessment.writesPlanVersion 必须为 false
// EvidencePackage.liabilityAssigned / autoSentToLessor 必须为 false
// 禁止 LookApplyRequest
```

复制 TS client：`frontend-nara-look-api-client.ts` → 手写 `NaraLookClient`。

---

## 10. 验收清单（S1-iOS Capture Mock）

- [ ] 三场景可进入相机/相册（Advisor 默认不可拍）
- [ ] 驾驶拦截文案与双 CTA（无「仍然打开相机」）
- [ ] 提交后 ANALYZING 使用阶段文案；409 不当错误
- [ ] RESULT 四层：发生了什么 / 影响 / 推荐 / CTA
- [ ] 无 GPS：NO_GPS CTA；无道路 BLOCK
- [ ] 补拍同 `observationId`，`captureRevision` 递增
- [ ] 无 Look Apply 按钮 / 方法
- [ ] 删除返回 deletionReceipt 并更新 UI

---

## 11. RESULT 四层 + Evidence + Preview（S5）

Assessment 就绪后：

```text
client.buildResult(tripId, assessment)
  → layers: status / whatHappened / impact / recommendation
  → evidenceSheet（secondary「查看识别依据」）
  → previewEntry（primary 打开既有 Preview；无 Apply）
```

| UI 区块 | 数据源 |
|---------|--------|
| 状态徽章 | `layers.status` + `statusLabel` |
| 发生了什么 | `layers.whatHappened` |
| 影响 | `layers.impact` |
| 推荐 | `layers.recommendation` |
| 主 CTA | `cta.primary` → `OPEN_PREVIEW` / `RECAPTURE` / `ENABLE_LOCATION` … |
| 次 CTA | `cta.secondary` → 常为 `OPEN_EVIDENCE` |
| 证据 Sheet | `evidenceSheet.items[]` |
| Preview | `previewLink(tripId, vm)` → Decision / Repair / Arrange / Nav |

`previewRef` 前缀约定：

| 前缀 | 去向 |
|------|------|
| `decision:{id}` | Decision 详情（Confirm 在 Decision 栈） |
| `repair:{key}` | Repair Preview |
| `arrange:{key}` | Arrange UWC Preview |
| `navigation:{key}` | 导航 |
| `unsupported:…` | 不支持通道说明（禁止自造 Apply） |

**EXECUTION_BLOCK** 禁止次要 CTA：继续 / 忽略 / 仍然前往 / Keep current plan。  
Member / Advisor：`confirmApplyAllowed === false`；Confirm 仅在外部 Preview 且角色门控通过后。

可选：`GET …/decision-problem`（`client.getDecisionProblem`）展示问题标题/urgency；CTA 仍以 assessment.actions 的 `previewRef` 为准。

屏幕机扩展：`RESULT` → `OPEN_EVIDENCE` → `EVIDENCE_SHEET` → `BACK` → `RESULT`。

---

## 12. 验收清单（S5-iOS Result）

- [ ] RESULT 四层齐全，不混入 Apply
- [ ] Evidence Sheet 展示 `evidenceIds`；CONFLICTING 有冲突项
- [ ] Primary 打开 `previewLink`（Decision/Repair/Arrange/Nav）
- [ ] EXECUTION_BLOCK 无「继续/忽略/保留计划」类文案
- [ ] Member/Advisor 不可 Confirm Apply（Look 内无 Apply 入口）
- [ ] NO_GPS：开启定位 / 仅查看标志说明
- [ ] `writesPlanVersion === false` 客户端断言
