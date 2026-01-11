# 国家档案数据 API 覆盖情况

## 数据字段覆盖分析

根据 `COUNTRY_PROFILE_SCHEMA.md` 文档，以下是各字段在API中的覆盖情况：

### ✅ 已提供的字段

#### 1. 基础字段

| 字段 | API接口 | 说明 |
|------|---------|------|
| `isoCode` | `GET /api/countries` | ✅ 完整提供 |
| `nameCN` | `GET /api/countries` | ✅ 完整提供 |
| `nameEN` | `GET /api/countries` | ✅ 完整提供 |
| `updatedAt` | ❌ 未提供 | 仅在数据库中存在 |

#### 2. 货币和支付字段

| 字段 | API接口 | 说明 |
|------|---------|------|
| `currencyCode` | `GET /api/countries`<br>`GET /api/countries/:code/currency-strategy` | ✅ 完整提供 |
| `currencyName` | `GET /api/countries`<br>`GET /api/countries/:code/currency-strategy` | ✅ 完整提供 |
| `exchangeRateToCNY` | `GET /api/countries`<br>`GET /api/countries/:code/currency-strategy` | ✅ 完整提供 |
| `exchangeRateToUSD` | `GET /api/countries`<br>`GET /api/countries/:code/currency-strategy` | ✅ 完整提供 |
| `paymentType` | `GET /api/countries`<br>`GET /api/countries/:code/currency-strategy`<br>`GET /api/countries/:code/payment-info` | ✅ 完整提供 |
| `paymentInfo` | `GET /api/countries/:code/currency-strategy`<br>`GET /api/countries/:code/payment-info` | ✅ 部分提供（解析后的字段） |

### ❌ 缺失的字段

以下JSON字段在数据库中存在，但**没有专门的API接口**提供：

| 字段 | 数据库 | API接口 | 状态 |
|------|--------|---------|------|
| `powerInfo` | ✅ 存在 | ❌ 未提供 | **缺失** |
| `emergency` | ✅ 存在 | ❌ 未提供 | **缺失** |
| `visaForCN` | ✅ 存在 | ❌ 未提供 | **缺失** |
| `complianceInfo` | ✅ 存在 | ❌ 未提供 | **缺失** |
| `travelCulture` | ✅ 存在 | ❌ 未提供 | **缺失** |

## 现有API接口

### 1. `GET /api/countries`

**功能**: 获取国家列表（支持搜索和分页）

**返回字段**:
- `isoCode`
- `nameCN`
- `nameEN`
- `currencyCode`
- `currencyName`
- `paymentType`
- `exchangeRateToCNY`
- `exchangeRateToUSD`

**缺失字段**: `updatedAt`, 所有JSON字段

### 2. `GET /api/countries/:countryCode/currency-strategy`

**功能**: 获取国家的货币策略

**返回字段**:
- `countryCode`
- `countryName`
- `currencyCode`
- `currencyName`
- `paymentType`
- `exchangeRateToCNY`
- `exchangeRateToUSD`
- `quickRule` (计算字段)
- `quickTip` (计算字段)
- `quickTable` (计算字段)
- `paymentAdvice` (从 `paymentInfo` JSON解析)

**缺失字段**: `powerInfo`, `emergency`, `visaForCN`, `complianceInfo`, `travelCulture`

### 3. `GET /api/countries/:countryCode/payment-info`

**功能**: 获取目的地支付实用信息

**返回字段**: 与 `currency-strategy` 类似，但格式略有不同

**缺失字段**: 同 `currency-strategy`

### 4. `GET /api/countries/:countryCode/pack`

**功能**: 获取国家 Pack 配置（地形策略配置）

**说明**: 这个接口返回的是 `Country Pack` 配置（存储在配置文件中），**不是** `CountryProfile` 表的数据

### 5. `GET /api/countries/:countryCode/terrain-advice`

**功能**: 获取目的地地形适配建议

**说明**: 这个接口返回的是 `Country Pack` 配置，**不是** `CountryProfile` 表的数据

## 缺失的数据接口

需要新增以下接口来提供完整的国家档案数据：

### 建议的新接口

#### 1. `GET /api/countries/:countryCode/profile` (推荐)

**功能**: 获取完整的国家档案信息

**返回字段**:
- 所有基础字段
- 所有货币和支付字段
- **所有JSON字段**（`powerInfo`, `emergency`, `visaForCN`, `complianceInfo`, `travelCulture`）

#### 2. 或者分别提供专门的接口：

- `GET /api/countries/:countryCode/power-info` - 电源信息
- `GET /api/countries/:countryCode/emergency` - 紧急信息
- `GET /api/countries/:countryCode/visa` - 签证信息
- `GET /api/countries/:countryCode/compliance` - 合规信息
- `GET /api/countries/:countryCode/culture` - 旅行文化

## 数据完整性总结

### ✅ 完整提供（8个字段）
- `isoCode`
- `nameCN`
- `nameEN`
- `currencyCode`
- `currencyName`
- `exchangeRateToCNY`
- `exchangeRateToUSD`
- `paymentType`

### ⚠️ 部分提供（2个字段）
- `paymentInfo` - 通过 `currency-strategy` 和 `payment-info` 接口提供解析后的字段
- `updatedAt` - 数据库中存在，但API未返回

### ❌ 完全缺失（5个JSON字段）
- `powerInfo` - 电源信息
- `emergency` - 紧急信息
- `visaForCN` - 中国公民签证信息
- `complianceInfo` - 合规信息
- `travelCulture` - 旅行文化

## 建议

1. **创建完整档案接口**: 建议新增 `GET /api/countries/:countryCode/profile` 接口，返回所有字段
2. **或者扩展现有接口**: 在 `currency-strategy` 接口中添加可选参数来包含其他JSON字段
3. **保持向后兼容**: 新增接口不应影响现有接口的行为

## 数据使用场景

缺失的字段对应的使用场景：

- **powerInfo**: 电源适配器准备、电压转换器需求
- **emergency**: 紧急情况联系方式、医疗信息
- **visaForCN**: 签证申请指导、停留期限提醒
- **complianceInfo**: 合规检查、政策提醒（驾驶、无人机、酒精等）
- **travelCulture**: 文化适应、禁忌提醒、节庆信息

这些数据对完整的旅行准备非常重要，建议尽快提供API接口。
