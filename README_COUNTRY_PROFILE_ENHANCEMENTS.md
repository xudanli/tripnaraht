# 国家档案增强数据导入脚本

## 概述

这个脚本用于导入 `complianceInfo`（合规信息）和 `travelCulture`（旅行文化）字段到 `CountryProfile` 表。

## 数据结构

### complianceInfo（合规信息）

包含以下字段：

- **visaPolicies** - 签证政策
  - visaForCN - 对中国公民的签证要求
  - internationalDrivingLicense - 国际驾照要求
  - otherRequirements - 其他签证要求

- **drivingRules** - 驾驶规则
  - drivingSide - 驾驶侧（left/right）
  - minAge - 最低驾驶年龄
  - requiresInternationalLicense - 是否需要国际驾照
  - speedLimits - 限速规则
  - specialRules - 特殊规则

- **droneRules** - 无人机规则
  - allowed - 是否允许无人机
  - requiresRegistration - 是否需要注册
  - restrictions - 飞行限制
  - maxAltitude - 最大飞行高度
  - prohibitedAreas - 禁止区域

- **alcoholPolicy** - 酒精政策
  - legalAge - 法定饮酒年龄
  - bacLimit - 血液酒精浓度限制
  - publicDrinking - 是否允许公共场所饮酒
  - specialRules - 特殊规则

- **travelWarnings** - 旅行警告
  - level - 警告级别（NONE/LOW/MEDIUM/HIGH）
  - warnings - 警告内容
  - source - 来源
  - updatedAt - 更新时间

### travelCulture（旅行文化）

包含以下字段：

- **tippingHabits** - 小费习惯
  - level - 小费文化程度（NONE/LOW/MEDIUM/HIGH）
  - typicalPercentage - 一般小费比例
  - description - 小费说明
  - scenarios - 不同场景的小费建议

- **tabooList** - 禁忌列表
  - category - 类别（如：宗教、社会、饮食）
  - items - 具体的禁忌项

- **dressCodeHints** - 着装提示
  - context - 场景（如：宗教场所、正式场合、海滩）
  - requirements - 要求
  - suggestions - 建议

- **festivalCalendar** - 节庆日历
  - month - 月份（1-12）
  - name - 节庆名称
  - nameCN - 中文名称
  - impact - 对旅行的影响（POSITIVE/NEGATIVE/NEUTRAL）
  - description - 节庆说明
  - travelTips - 旅行建议

## 使用方法

### 1. 使用示例数据

```bash
npm run import:country-profile-enhancements
```

这会导入脚本中内置的示例数据（冰岛、日本、挪威）。

### 2. 导入特定国家

```bash
npm run import:country-profile-enhancements -- --country IS
```

只导入冰岛的数据。

### 3. 从 JSON 文件导入

首先编辑 `data/country-profile-enhancements.sample.json` 文件，然后运行：

```bash
npm run import:country-profile-enhancements -- --file data/country-profile-enhancements.sample.json
```

## 数据文件格式

数据文件应该是一个 JSON 数组，每个元素包含：

```json
{
  "isoCode": "IS",
  "complianceInfo": {
    "drivingRules": {
      "drivingSide": "right",
      "minAge": 17,
      "requiresInternationalLicense": true,
      "speedLimits": {
        "urban": 50,
        "highway": 90
      }
    },
    "droneRules": {
      "allowed": true,
      "requiresRegistration": true,
      "maxAltitude": 120
    }
  },
  "travelCulture": {
    "tippingHabits": {
      "level": "LOW",
      "description": "冰岛没有强制小费文化"
    },
    "festivalCalendar": [
      {
        "month": 6,
        "name": "Midnight Sun",
        "nameCN": "午夜太阳",
        "impact": "POSITIVE",
        "description": "极昼现象，适合户外活动"
      }
    ]
  }
}
```

## 示例数据

脚本中包含以下国家的示例数据：

1. **IS（冰岛）**
   - 驾驶规则（F-road、4x4 要求）
   - 无人机规则
   - 酒精政策
   - 小费习惯

2. **JP（日本）**
   - 签证政策
   - 驾驶规则（左侧驾驶）
   - 酒精政策
   - 小费习惯（不接受小费）
   - 禁忌列表
   - 着装提示
   - 节庆日历（樱花季、盂兰盆节）

3. **NO（挪威）**
   - 驾驶规则
   - 无人机规则
   - 小费习惯
   - 着装提示

## 注意事项

1. 脚本会检查国家是否存在，如果不存在会跳过并记录错误
2. 如果字段为 `null` 或 `undefined`，会设置为 `null`
3. 脚本会更新 `updatedAt` 字段为当前时间
4. 支持部分更新（只更新提供的字段）

## 验证导入结果

运行脚本后，可以通过以下方式验证：

```sql
-- 查看已导入的国家
SELECT 
  "isoCode",
  "nameCN",
  "complianceInfo" IS NOT NULL as has_compliance_info,
  "travelCulture" IS NOT NULL as has_travel_culture
FROM "CountryProfile"
WHERE "complianceInfo" IS NOT NULL OR "travelCulture" IS NOT NULL;

-- 查看特定国家的合规信息
SELECT 
  "isoCode",
  "nameCN",
  "complianceInfo"->>'drivingRules' as driving_rules,
  "travelCulture"->>'tippingHabits' as tipping_habits
FROM "CountryProfile"
WHERE "isoCode" = 'IS';
```

