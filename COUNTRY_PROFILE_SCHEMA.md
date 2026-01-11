# 国家档案表（CountryProfile）结构说明

## 概述

`CountryProfile` 表存储了基于国家维度的完整旅行信息，包括基础信息、货币支付、合规政策、旅行文化等多个维度的数据。

## 表结构

### 基础字段

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `isoCode` | String (主键) | 国家代码（ISO 3166-1 alpha-2） | `JP`, `CN`, `US` |
| `nameCN` | String | 国家中文名称 | `日本`, `中国`, `美国` |
| `nameEN` | String? | 国家英文名称（可选） | `Japan`, `China`, `United States` |
| `updatedAt` | DateTime | 最后更新时间 | `2025-01-11T10:00:00Z` |

### 货币和支付字段

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `currencyCode` | String? | 货币代码（ISO 4217） | `JPY`, `CNY`, `USD` |
| `currencyName` | String? | 货币名称 | `日元`, `人民币`, `美元` |
| `exchangeRateToCNY` | Float? | 汇率（1外币 = 多少CNY）🇨🇳 中国特定 | `0.0483` (JPY) |
| `exchangeRateToUSD` | Float? | 汇率（1外币 = 多少USD）🌍 国际化 | `0.0067` (JPY) |
| `paymentType` | PaymentType? | 支付画像类型 | `CASH_HEAVY`, `BALANCED`, `DIGITAL_HEAVY` |
| `paymentInfo` | Json? | 支付详细信息（JSON） | 见下方详细说明 |

### JSON 字段详细说明

#### 1. `powerInfo` (电源信息)

存储国家的电源插座类型、电压、频率等信息。

**可能包含的字段**：
- `voltage`: 电压（如 100V, 220V）
- `frequency`: 频率（如 50Hz, 60Hz）
- `plugTypes`: 插座类型数组（如 `["A", "B"]`）
- `notes`: 备注信息

**示例（日本）**：
```json
{
  "voltage": 100,
  "frequency": 50,
  "plugTypes": ["A", "B"],
  "note": "电压: 100V, 频率: 50Hz, 插座类型: A, B"
}
```

#### 2. `emergency` (紧急信息)

存储紧急联系方式、医疗信息等。

**可能包含的字段**：
- `police`: 警察电话
- `ambulance`: 救护车电话
- `fire`: 火警电话
- `embassy`: 大使馆联系方式
- `medical`: 医疗信息

**示例（日本）**：
```json
{
  "police": "110",
  "fire": "119",
  "medical": "119",
  "note": "报警: 110, 火警: 119, 医疗: 119"
}
```

#### 3. `paymentInfo` (支付信息)

存储详细的支付建议和实用信息。

**可能包含的字段**：
- `tipping`: 小费习惯说明
- `atm_network`: ATM网络信息（如支持银联）
- `wallet_apps`: 常用钱包App列表
- `cash_preparation`: 现金准备建议
- `tips`: 其他支付提示

**示例（日本）**：
```json
{
  "tipping": "绝对不要给小费，会被视为无礼。服务费通常已包含在账单中。",
  "atm_network": "7-11、Lawson、FamilyMart 的 ATM 支持银联卡取现。邮局 ATM 也支持。",
  "wallet_apps": ["Suica (Apple Pay)", "PayPay"],
  "notes": "虽然大城市开始接受信用卡，但小餐厅、寺庙、自动贩卖机仍主要使用现金。"
}
```

#### 4. `visaForCN` (中国公民签证信息)

存储针对中国公民的签证政策信息。

**可能包含的字段**：
- `required`: 是否需要签证
- `type`: 签证类型（如 `免签`, `落地签`, `电子签`）
- `duration`: 停留期限
- `requirements`: 申请要求
- `notes`: 备注信息

**示例**：
```json
{
  "required": false,
  "type": "免签",
  "duration": "15天",
  "requirements": ["护照有效期6个月以上"],
  "notes": "仅限旅游目的"
}
```

#### 5. `complianceInfo` (合规信息)

存储签证政策、驾驶规则、无人机规则、酒精政策、旅行警告等合规相关信息。

**可能包含的字段**：
- `visaPolicy`: 签证政策
- `drivingRules`: 驾驶规则（如是否需要国际驾照）
- `droneRules`: 无人机规则
- `alcoholPolicy`: 酒精政策
- `travelWarnings`: 旅行警告
- `customs`: 海关规定

**示例**：
```json
{
  "visaPolicy": {
    "forCN": "免签15天",
    "forUS": "免签90天"
  },
  "drivingRules": {
    "requiresInternationalLicense": true,
    "driveOnLeft": true
  },
  "droneRules": {
    "allowed": false,
    "notes": "需要特殊许可"
  }
}
```

#### 6. `travelCulture` (旅行文化)

存储小费习惯、禁忌列表、着装提示、节庆日历等文化相关信息。

**可能包含的字段**：
- `tipping`: 小费文化
- `taboos`: 禁忌列表
- `dressCode`: 着装提示
- `festivals`: 节庆日历
- `etiquette`: 礼仪提示
- `customs`: 风俗习惯

**示例**：
```json
{
  "tipping": "不需要给小费",
  "taboos": [
    "不要在公共场合大声说话",
    "不要在地铁上打电话"
  ],
  "dressCode": "商务场合需正装",
  "festivals": [
    {
      "name": "樱花节",
      "month": 4,
      "description": "全国樱花盛开"
    }
  ]
}
```

## PaymentType 枚举

```typescript
enum PaymentType {
  CASH_HEAVY      // 现金为主
  BALANCED        // 混合支付
  DIGITAL_ONLY    // 数字化支付为主
}
```

## 字段分类

### 🌍 通用字段（适用于所有国家用户）

- `isoCode`: 国家代码
- `nameCN`: 中文名称
- `nameEN`: 英文名称
- `currencyCode`: 货币代码
- `currencyName`: 货币名称
- `paymentType`: 支付画像类型
- `exchangeRateToUSD`: 美元汇率
- `powerInfo`: 电源信息
- `emergency`: 紧急信息
- `complianceInfo`: 合规信息
- `travelCulture`: 旅行文化

### 🇨🇳 中国特定字段（仅对中国用户有意义）

- `exchangeRateToCNY`: 人民币汇率
- `visaForCN`: 中国公民签证信息

## API 使用

### 1. 获取国家列表

```bash
GET /api/countries?limit=100&offset=0
```

返回字段：
- `isoCode`
- `nameCN`
- `nameEN`
- `currencyCode`
- `currencyName`
- `paymentType`
- `exchangeRateToCNY`
- `exchangeRateToUSD`

### 2. 获取货币策略

```bash
GET /api/countries/:countryCode/currency-strategy
```

返回完整的货币和支付信息，包括：
- 基础货币信息
- 汇率和速算口诀（基于CNY）
- 支付建议（从 `paymentInfo` 解析）

### 3. 获取支付信息

```bash
GET /api/countries/:countryCode/payment-info
```

返回增强的支付实用信息，包括：
- 货币信息
- 支付方式建议
- 实用提示（小费、ATM、钱包App等）

## 数据完整性

### 必填字段

- `isoCode`: 主键，必填
- `nameCN`: 中文名称，必填
- `updatedAt`: 更新时间，必填

### 可选字段

- 所有其他字段都是可选的（`?` 标记）
- JSON 字段可以为 `null`

## 扩展性

JSON 字段的设计允许灵活扩展，无需修改数据库结构：

1. **新增字段**: 可以直接在 JSON 中添加新字段
2. **结构化数据**: JSON 可以存储复杂的嵌套结构
3. **多语言支持**: 可以在 JSON 中存储多语言内容

## 相关配置

除了数据库中的 `CountryProfile` 表，还有：

### Country Pack 配置

存储在 `src/trips/readiness/config/country-pack.config.ts` 中，包含：
- `riskThresholds`: 风险阈值（高海拔、陡坡等）
- `effortLevelMapping`: 体力等级映射
- `terrainConstraints`: 地形约束

这些配置用于行程规划的地形适配建议。

## 使用场景

1. **行程创建**: 选择国家时显示国家列表和基本信息
2. **货币换算**: 显示汇率和速算口诀
3. **支付建议**: 提供支付方式建议和实用提示
4. **合规检查**: 检查签证、驾驶、无人机等合规要求
5. **文化适应**: 提供小费、禁忌、着装等文化信息
6. **紧急情况**: 提供紧急联系方式

## 注意事项

1. **数据更新**: `updatedAt` 字段用于追踪数据更新时间
2. **国际化**: `nameEN` 和 `exchangeRateToUSD` 支持国际化
3. **中国特定**: `exchangeRateToCNY` 和 `visaForCN` 仅对中国用户有意义
4. **JSON 字段**: 使用 JSON 类型存储灵活的结构化数据
5. **性能**: 查询时可以通过 `select` 只获取需要的字段
