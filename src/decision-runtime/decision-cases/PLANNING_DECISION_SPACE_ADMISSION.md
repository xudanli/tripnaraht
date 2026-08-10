# 规划阶段 · 决策空间准入（产品冻结）

> **一句话**：决策空间不承载所有风险，只承载 **需要用户选择，并将结果写入行程约束或账户状态** 的事项。  
> **对接**：[`DECISION_SPACE_IOS_HANDOFF.md`](./DECISION_SPACE_IOS_HANDOFF.md) · Case 表 §13  
> **最后更新**：2026-07-20

---

## 1. 边界

| 进决策空间 | 不进决策空间 |
|------------|--------------|
| 用户必须二选一/多选一 | 纯告知、只读风险条 |
| Apply 后写约束 / 账户态 | Situation 冬季卡、准备度 checklist 行 |
| `requiredness` 可阻断或重要 | Opportunity 默认 inbox（未 publish） |

准备度报告、Situation、Daily Drive **可以深链进**决策空间，但本身不是决策卡。

---

## 2. 默认必出两张（REQUIRED_CHOICE · BLOCKING）

创建租车自驾行程后，队列应出现（未确认前）：

| # | 决策 | semanticKey | problemId |
|---|------|-------------|-----------|
| 1 | 车辆与道路适配 | `REQUIRED_CHOICE.VEHICLE_ROAD_FIT` | `dc_vehicle_{tripId}` |
| 2 | 租车保险 | `REQUIRED_CHOICE.RENTAL_INSURANCE` | `dc_insurance_{tripId}` |

**跳过条件（降噪）：**

- 车型：`drivingSettings.vehicle.vehicleClass` / `lifecycleStatus=model_confirmed|booked_unconfirmed` / `constraints.vehicle_type` / `vehicleConfirmedAt` 已有 → **不**再刷壳卡  
- 保险：`drivingSettings.insurance.configured` / 已 ack / `insurance_tier` / `coverage_confirmed` / `insuranceConfirmedAt` → **不**再刷壳卡  

### 2.1 车辆与道路适配

**触发（任一）：**

- 创建租车自驾行程后（壳卡；若车型已配置则跳过）
- 路线含 F-road / 高地 / 涉水 / 受限碎石
- 车型信息缺失
- 用户更换路线或车型
- 租车合同与计划路线冲突

**用户应看到：** 当前路线需要什么车 · 所选车是否适合 · 受影响路段 · 可选方案  

**选项示例：**

- 保留当前路线，改为四驱 SUV  
- 保留当前车辆，移除高地路段  
- 将高地体验改为当地团  
- 暂时不确定车型，先保存草案  

**写回（约束键）：** `vehicle_type` / `drive_type` / `avoid_f_road` · 路线范围 · 活动类型 · 租赁约束  

**与自驾设置联动（2026-07-21）：**

| 方向 | 行为 |
|------|------|
| 决策 Apply → 自驾设置 | 写回同时镜像 `icelandSelfDrive.drivingSettings.vehicle` / `insurance` / `routePreference.fRoadPreference` |
| 自驾设置 PATCH → 决策 | 镜像 `constraints.vehicle_type` / 保险 / F 路偏好，并 `ensure` 决策壳（已配置则跳过/自动关掉） |

**实现对照：** `buildVehicleShellCase` → 路线就绪 `enrichVehicleCase`；写回见 `DecisionCaseApplyWritebackService` + `decision-driving-settings-sync.util`。

### 2.2 租车保险

**触发（任一）：**

- 用户确认租车 / 车辆壳推进后  
- 已形成初始路线暴露分析  
- 路线含碎石、强风、沙尘、高地等暴露  
- 用户上传或选择保险方案  
- 路线明显变化后重新评估  

**用户应看到：** 车辆损坏暴露 · 现有覆盖 / 缺口 · 档位价格与自付额差异  

**用户决策：** 选档位 · 确认不覆盖风险 · 改线降暴露 · 标记稍后在租车公司确认  

**写回：** `insurance_tier` / `coverage_confirmed` / `accepted_exclusions` / `insurance_followup_required`  

**实现对照：** `buildInsuranceShellCase` → `enrichInsuranceCase`；涉水 `fordingExcluded` 恒 true；Coverage Gap 只认 `insurance.gaps` / `routeExposure`。

---

## 3. 条件触发型（RULE_TRIGGER · 越过门槛才入队）

默认 **不**出现；满足门槛后 publish：

| 问题 | 触发条件 | 用户选择 | semanticKey | 现状 |
|------|----------|----------|-------------|------|
| F-road 与车型冲突 | 已选两驱且路线保留 F-road | 改车 / 改线 / 跟团 | `RULE_TRIGGER.FROAD_VEHICLE_MISMATCH` | ✅ |
| 落地即长途驾驶 | **有证据**的国际抵达 + 首日驾驶超阈值（夜航/时差）；可用 `suppressLandingCase` / `landingMode` 关闭；**不再**对冰岛行程默认臆造 | 拆宿 / 缩短 / 接受风险 | `RULE_TRIGGER.LANDING_LONG_DRIVE` | ✅（三闸 + party） |
| 环岛还是南岸 | 天数不足、驾驶负荷过高 | 缩小范围 / 增加天数 | `RULE_TRIGGER.RING_VS_SOUTH_SCOPE` | ✅ |
| 单日驾驶过长 | 驾驶时间超过硬门槛 | 拆分住宿 / 删除活动 | `RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE` | ✅（与 Canonical 日载去重） |
| 驾照资格不足 | 明确不满足租车或驾驶资格 | 更换驾驶者 / 放弃自驾 | `RULE_TRIGGER.DRIVER_LICENSE_INELIGIBLE`（建议） | ❌ 待做 |
| 儿童座椅未解决 | 有儿童但座椅状态未知且临近出发 | 租赁 / 自带 / 改交通方式 | `RULE_TRIGGER.CHILD_SEAT_UNRESOLVED`（建议） | ❌ 待做 |

---

## 4. 与准备度 / Situation 的分工

| 层 | 职责 |
|----|------|
| **决策空间** | 要选、要写回约束 |
| **自驾准备报告** | checklist 总览；可 deepLink 到 `dc_vehicle_*` / `dc_insurance_*` |
| **Situation** | 解释性门禁与证据；CTA 可指向决策卡，**不**替代选档 |

示例：主驾年龄 `MUST_RESOLVE` 在准备度出现 → 应升级为决策卡「驾照/资格不足」后，才算进入决策空间（当前缺口见上表）。

---

## 5. 验收（规划阶段）

- [ ] 新建冰岛自驾：列表至少见 `dc_vehicle_*`、`dc_insurance_*`（未确认；**若 driving-settings 已填车型/保险则跳过**）  
- [ ] 机会层（冰川等）**默认不**并进决策空间列表（仅 `glacierNeedsBooking` 时 publish）  
- [ ] 无国际抵达证据时 **无**落地开程卡（除非 `forceLandingCase`）  
- [ ] 同日短 hop（≤40km 或 ≤40 分钟）软「缓冲偏紧」**不**进冲突/决策刷屏  
- [ ] 无 F-road 冲突时 **无** `dc_froad_*`  
- [ ] 两驱 + 保留 F-road 且车辆已 apply → 出现 F-road 冲突卡  
- [ ] 日驾超限与 Canonical `EXCESSIVE_DAILY_LOAD` 不同时双开  
- [ ] Apply 后约束键可在 trip metadata / constraints 读回  
