---
name: country-pack-is
description: "冰岛 Country Pack 编排规则（弱种子 / 演示用）. Use when: 冰岛行程规划演示; iceland; demo-seed."
license: Proprietary. TripNARA internal skill.
compatibility: TripNARA SkillEvolver markdown skill; loadable in Claude Code / Cursor Agent Skills.
metadata:
  tripnara-skill-id: country_pack.IS
  tripnara-version: 2
  tripnara-artifact-type: country_pack
  tripnara-country-code: IS
  tripnara-parent-version: 1
---

<!-- tripnara-skill-evolver: do not edit export copy; source under data/skill-evolver/ -->

# 冰岛 Country Pack 编排规则（生产级）

## 原则
- 绑定 `countryCode=IS`。
- 夏季（7–8 月）可考虑高地路线，但必须满足以下前置条件。

## 步骤
1. 确认用户季节与强度偏好。
2. 在输出初步路线方向建议前，执行海拔数据可用性验证（详见下方注意事项）。
3. 若海拔数据可用且为夏季，启用高地路线规划逻辑；否则按默认路线处理。

## 规则

### 新增规则
- **Abu 海拔规则**：在夏季高地路线规划前，必须检查 Abu 海拔数据是否可用。若数据不可用，禁止启用高地路线。
- **证据门禁规则**：在访问酒店点位数据前，必须先验证证据门禁状态。若门禁未通过验证，禁止访问酒店点位。
- **`getHotelPointForDate` 方法调用前检查**：调用该方法前，必须确保对象存在且包含该方法，避免 `Cannot read properties of undefined` 错误。
- **错误处理规则**：当无法获取酒店点位时（如数据缺失、方法不存在或门禁未通过），应回退到默认路线规划逻辑。

### 修改规则
- **步骤 2 增强**：在输出初步路线方向建议前，增加海拔数据可用性验证（如调用 Abu 海拔服务检查）。
- **「高地」关键词触发逻辑**：关联 Abu 海拔检查条件，确保高地路线仅在海拔数据可用且通过验证时启用。
- **强化 `reject` 关键词处理**：当检测到 `dem` 数据缺失时，自动触发拒绝流程，直接返回非高地路线建议。

### 删除规则
- 删除弱种子演示标记，替换为生产级规则（如上所述）。
- 删除对 `execution_lapses` 的免责说明，改为直接修复技能缺陷（包括对象存在性检查、降级处理等）。

## ⚠️ 注意事项

- **Abu 海拔检查**：在夏季高地路线规划前，必须执行 Abu 海拔检查。若数据不可用，拒绝启用高地路线，并通知用户原因。
- **证据门禁验证**：所有酒店点位访问操作前，必须进行证据门禁验证。若门禁状态未通过，禁止继续访问，并回退到默认逻辑。
- **`reject` 与 `dem` 联合使用**：当 `dem` 数据不可用时，应拒绝执行高地路线相关操作，并触发 `reject` 流程。
- **对象存在性检查**：在调用 `getHotelPointForDate` 前，必须检查对象是否存在且包含该方法，否则将抛出 `Cannot read properties of undefined` 错误。
- **降级处理路径**：技能中必须定义当酒店点位获取失败时的降级处理路径（如回退到默认路线规划）。若未定义，将导致无响应或异常终止。
