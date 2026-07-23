# ONT-P2-03A — Selected User Temporal Advisory Pilot

**状态：** `APPROVED / IMPLEMENTED / READY_FOR_SELECTED_USER_LIVE_ACTIVATION`  
**决策：** `APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT`  
**不是：** `PILOT PASSED` · `PRODUCT GATE PASSED`  
**上位：** [P2-02C](./travel-ontology-p2-02c-observation-gate.md) · [P2 Charter](./travel-ontology-p2-temporal-prediction-charter.md)

## 当前项目状态

| 层 | 状态 |
|----|------|
| ONT-P2-03A | APPROVED / IMPLEMENTED / PRE-ACTIVATION READY |
| Selected User Runtime | READY |
| Live User Emission | DISABLED BY KILL SWITCH |
| Observation Gate | IN_PROGRESS |
| Cohort Expansion | NOT AUTHORIZED |
| Product Gate | NOT AUTHORIZED |
| Canonical Upgrade | PROHIBITED |

## 冻结决策

| 项 | 值 |
|----|-----|
| authorityMode | `SHADOW` |
| deliveryMode | `ADVISORY_ONLY` |
| audience | `EXPLICIT_OPT_IN_SELECTED_USERS` |
| destination | `IS` |
| semanticScope | `WEATHER_DETERIORATION` |
| canonicalControl | `FORBIDDEN` |
| automaticPlanMutation | `FORBIDDEN` |
| blockingNotification | `FORBIDDEN` |
| externalFullRollout | `NOT_AUTHORIZED` |
| semanticScopeExpansion | `NOT_AUTHORIZED` |

**意味着：** 少量明确 Opt-in 的真实用户可以看见预测建议。  
**不意味着：** P2 已成为正式裁决，或可触发 BLOCK / 修改行程。

### 依赖

- 02A Quality Gate = PASS  
- 02C Observation Gate = PASS  
- P2 Weather Shadow Pilot = ACTIVE  
- P1 Canonical priority = ENFORCED  

### 授权件冻结字段

`approvedTripIds` · `approvedUserIds` · `consentVersion` · `approvedViewers` · `approvedSemanticScope` · `predictionRuntimeVersion` · `advisoryProjectionVersion` · `qualityBaselineVersion` · `rollbackCommand` · `approvedBy` · `approvedAt` · `authorizationHash`

产物：`artifacts/ontology-p2/selected-user-advisory/selected-user-temporal-advisory-authorization.json`

### 发布来源冻结（Activation Provenance）

关闭 Kill Switch 前必须可定位：

`authorizationHash` · `gitCommitSha` · `gitBranch` · `buildArtifactHash` · `runtimePackageVersion` · `predictionRuntimeVersion` · `advisoryProjectionVersion` · `consentLedgerVersion` · `selectedTripListHash` · `selectedUserListHash`

## Pre-Activation Gate

```bash
npm run ontology:p2-selected-user-advisory-live-readiness
```

机器结论仅允许：`ALLOW_WAVE_1_ACTIVATION`  
禁止宣称：`PILOT_PASS` / `PRODUCT_GATE_PASS`

至少检查：授权 APPROVED、authorizationHash 匹配、工作区 clean、runtimeCommitSha 含 03A bundle、consent 12、trips 7、users 12、AND 模式、dry-run PASS、Kill Switch ON、observation IN_PROGRESS。

## 激活顺序（强制）

### Step 0 — 清理与来源冻结

- 删除误残留 `untitled2@0.1.0`
- 非 03A 的 `same-day-travel-noise` 已 park 出 `src/`（`archives/parked-wip/same-day-travel-noise/`）
- 03A 形成独立 Git 提交后冻结 provenance

### Step 1 — Kill Switch 开启部署

`ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1`

| 请求 | 预期 |
|------|------|
| Opt-in + selected trip | 符合资格，但 emitter 静默 |
| selected trip、未 Opt-in | 不发射 |
| Opt-in、非 selected trip | 不发射 |
| 非冰岛 Trip | 不发射 |
| 其他语义 | 不发射 |

**allowlist ∧ consent（AND，非 OR）。**

### Step 2 — 用户投影 dry-run

审计字段：`eligible` · `consentMatched` · `tripMatched` · `predictionActive` · `contextRevisionMatched` · `canonicalConflictChecked` · `wouldEmit` · `blockedReason`

必须为零：`nonSelectedWouldEmit` · `nonOptInWouldEmit` · `supersededWouldEmit` · `expiredWouldEmit` · `canonicalBlockWeakened`

### Step 3 — Wave 1 小范围开放（仅 live-readiness ALLOW 后）

建议先开放：**2 trips · 3–4 users**（授权总范围不变，仅分批激活）。

然后从运行中进程关闭 Kill Switch：

`ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=0`

验证：`authorityMode=SHADOW` · `deliveryMode=ADVISORY_ONLY` · `selectedUserEmission=enabled` · `canonicalControl=false`

## 用户首屏（固定）

- 天气预测建议 · 实验功能  
- 不会自动修改行程  
- 正式风险状态以当前行程提示为准  

内容五段：预计发生什么 / 为什么影响你 / 最晚何时行动 / 推荐方案 / 当前状态  

**首轮禁止一键采用。** 「调整行程」必须进入现有 Decision → Preview → Canonical Assessment → 用户确认 → Canonical Apply。P2 不是写入捷径。

## 视觉优先级

**P1 Canonical Assessment > P2 SHADOW Advisory**

P1 已 BLOCK 时，P2 只能补充持续时间，不得把正式阻断弱化成「建议考虑调整」。

## 预测反转 / 撤回

状态：`ACTIVE` · `SUPERSEDED` · `WITHDRAWN` · `RESOLVED` · `EXPIRED`  

反转必须显式撤回文案，不可静默删除。  

必须持续为零：`superseded_advisory_visible` · `withdrawn_advisory_actionable` · `expired_deadline_visible` · `multiple_active_user_advisories` · `prediction_context_mismatch`

## 一票回滚

任意边界失守 → 立即 `ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1`  

关闭用户展示后：Prediction / Reconciliation / Internal Advisory / P0·P1 继续。

## Pilot 完成门槛（摘要）

5–10 selected Iceland trips · 10–20 明确 Opt-in 用户 · Observation Report frozen · 边界与 Canonical 控制指标全 0 · Kill Switch 实测通过。

## Pilot 通过后仅可申请

- Selected User Advisory Cohort Expansion，或  
- Weather Temporal Advisory Product Gate（数据充分时）

**仍不可：** P2 Canonical Authority · 预测触发 BLOCK · 自动改线 · 普通用户全量 · 第四条语义。

## 命令

```bash
npm run ontology:p2-selected-user-advisory-approve
npm run ontology:p2-selected-user-advisory-live-readiness
npm run test:ontology-p2-selected-user-advisory
```
