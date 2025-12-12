# 国家档案表架构设计分析

## 当前表结构分析

### CountryProfile 表字段分类

#### 🌍 通用字段（适用于所有国家用户）

这些字段对所有用户都有意义，无论用户来自哪个国家：

1. **基础信息**
   - `isoCode` - 国家代码（ISO 3166-1 alpha-2）
   - `nameCN` - 中文名称（可扩展为多语言）
   - `updatedAt` - 更新时间

2. **货币信息** ✅ 通用
   - `currencyCode` - 货币代码（ISO 4217）
   - `currencyName` - 货币名称
   - `exchangeRateToCNY` - ⚠️ **问题**：硬编码为CNY，应该支持多基准货币
   - `paymentType` - 支付画像（CASH_HEAVY, BALANCED, DIGITAL_ONLY）
   - `paymentInfo` - 支付实用建议（小费、ATM、钱包App等）

3. **实用信息** ✅ 通用
   - `powerInfo` - 插座信息（电压、频率、插座类型）
   - `emergency` - 紧急电话（报警、火警、医疗）

#### 🇨🇳 中国特定字段（仅对中国用户有意义）

这些字段只对中国公民或从中国出发的旅行有意义：

1. **签证信息** 🇨🇳
   - `visaForCN` - 针对中国公民的签证政策
   - 包含：status, requirement, allowedStay, notes
   - **问题**：字段名和内容都硬编码为"CN"

2. **机票估算** 🇨🇳
   - `flightEstimates` - 从中国出发的机票价格估算
   - **已废弃**：已被 `FlightPriceReference` 表替代

---

## 架构问题分析

### 1. 汇率基准货币硬编码

**当前问题**：
```typescript
exchangeRateToCNY Float?  // 硬编码为人民币
```

**影响**：
- 美国用户无法直接获取 USD 到其他货币的汇率
- 欧洲用户无法直接获取 EUR 到其他货币的汇率
- 需要额外计算：USD → CNY → 目标货币

**解决方案**：
- 方案A：存储多基准货币汇率（USD, EUR, GBP, JPY, CNY等）
- 方案B：使用第三方汇率API实时计算
- 方案C：存储标准基准货币（如USD）的汇率，其他货币通过USD换算

### 2. 签证信息硬编码为中国

**当前问题**：
```typescript
visaForCN Json?  // 只存储中国公民的签证政策
```

**影响**：
- 美国用户无法查看美国公民的签证要求
- 需要为每个国家用户创建单独的签证信息表

**解决方案**：
- 方案A：创建 `VisaPolicy` 表，支持多国家组合
  ```sql
  VisaPolicy {
    fromCountryCode: String,  // 出发国家
    toCountryCode: String,    // 目的地国家
    status: String,
    requirement: String,
    ...
  }
  ```
- 方案B：将 `visaForCN` 改为 `visaPolicies` JSON数组，包含多个国家的签证政策
- 方案C：保持当前结构，但明确标注为"中国特定"，未来扩展时添加新表

### 3. 国家名称只有中文

**当前问题**：
```typescript
nameCN String  // 只有中文名称
```

**影响**：
- 非中文用户无法理解国家名称
- 国际化支持不足

**解决方案**：
- 方案A：添加 `nameEN` 字段（英文名称）
- 方案B：使用多语言表 `CountryName { isoCode, language, name }`
- 方案C：使用 i18n 库动态获取（当前已在脚本中使用）

---

## 推荐架构方案

### 方案一：渐进式改进（推荐，适合当前阶段）

保持现有结构，但明确区分通用和特定字段，为未来扩展做准备：

```typescript
model CountryProfile {
  // ========== 通用字段 ==========
  isoCode           String       @id @unique
  nameCN            String       // 中文名称（主要显示）
  nameEN            String?      // 英文名称（新增，用于国际化）
  
  // 货币信息（通用）
  currencyCode      String?
  currencyName      String?
  exchangeRateToUSD Float?       // 改为USD基准（国际标准）
  exchangeRateToCNY Float?       // 保留CNY（向后兼容）
  paymentType       PaymentType?
  paymentInfo       Json?
  
  // 实用信息（通用）
  powerInfo         Json?
  emergency         Json?
  
  // ========== 中国特定字段 ==========
  visaForCN         Json?        // 明确标注：仅对中国公民
  // flightEstimates 已废弃，使用 FlightPriceReference 表
  
  updatedAt         DateTime
}
```

### 方案二：完全国际化（长期方案）

创建多表结构，支持多国家用户：

```typescript
// 国家基础信息（通用）
model Country {
  isoCode  String @id @unique
  names    CountryName[]  // 多语言名称
  currency CurrencyInfo
  ...
}

// 多语言名称
model CountryName {
  countryCode String
  language    String  // 'zh', 'en', 'ja', etc.
  name        String
}

// 签证政策（多对多关系）
model VisaPolicy {
  fromCountryCode String  // 出发国家
  toCountryCode   String  // 目的地国家
  status          String
  requirement     String
  allowedStay     String?
  notes           String?
  // 支持多语言
  statusCN        String?
  requirementCN   String?
  notesCN         String?
}

// 汇率（多基准货币）
model ExchangeRate {
  fromCurrency String  // 源货币
  toCurrency   String  // 目标货币
  rate         Float
  updatedAt    DateTime
}
```

---

## 当前阶段建议

### 立即可做的改进

1. **添加英文名称字段**
   ```typescript
   nameEN String?  // 使用 i18n-iso-countries 填充
   ```

2. **改进汇率字段命名**
   ```typescript
   exchangeRateToUSD Float?  // 新增USD基准
   exchangeRateToCNY Float?  // 保留（向后兼容）
   ```

3. **明确字段用途注释**
   ```typescript
   visaForCN Json?  // 🇨🇳 仅对中国公民的签证政策
   ```

### 未来扩展路径

1. **短期（3-6个月）**
   - 添加 `nameEN` 字段
   - 添加 `exchangeRateToUSD` 字段
   - 在API文档中明确标注中国特定字段

2. **中期（6-12个月）**
   - 创建 `VisaPolicy` 表，支持多国家组合
   - 迁移 `visaForCN` 数据到新表
   - 支持多语言国家名称

3. **长期（12个月+）**
   - 完全国际化架构
   - 支持多基准货币汇率
   - 多国家用户画像（支付习惯、签证政策等）

---

## 字段分类总结

### ✅ 通用字段（所有用户）

这些字段对所有国家用户都有意义，无论用户来自哪个国家：

| 字段 | 类型 | 说明 | 国际化需求 | 使用场景 |
|------|------|------|-----------|---------|
| `isoCode` | String | 国家代码 | ✅ 已标准化 | 所有用户 |
| `nameCN` | String | 中文名称 | ⚠️ 需要添加 `nameEN` | 所有用户（当前仅中文） |
| `currencyCode` | String | 货币代码 | ✅ 已标准化（ISO 4217） | 所有用户 |
| `currencyName` | String | 货币名称 | ⚠️ 需要多语言 | 所有用户 |
| `paymentType` | Enum | 支付画像 | ✅ 通用（枚举值） | 所有用户 |
| `paymentInfo` | Json | 支付建议 | ⚠️ 内容需要多语言 | 所有用户 |
| `powerInfo` | Json | 插座信息 | ✅ 通用（物理标准） | 所有用户 |
| `emergency` | Json | 紧急电话 | ✅ 通用（数字） | 所有用户 |

### 🇨🇳 中国特定字段

这些字段只对中国公民或从中国出发的旅行有意义：

| 字段 | 类型 | 说明 | 扩展方案 | 使用场景 |
|------|------|------|---------|---------|
| `exchangeRateToCNY` | Float | 汇率（CNY基准） | ⚠️ 需要多基准货币（USD/EUR等） | 仅中国用户 |
| `visaForCN` | Json | 中国公民签证政策 | 创建 `VisaPolicy` 表 | 仅中国用户 |
| `flightEstimates` | Json | 从中国出发机票 | ✅ 已用 `FlightPriceReference` 替代 | 已废弃 |

### 📊 字段使用统计

**通用字段覆盖率**（适用于所有用户）：
- `currencyCode`: 73% ✅
- `powerInfo`: 22% ✅
- `emergency`: 13% ✅
- `paymentInfo`: 14% ✅

**中国特定字段覆盖率**（仅中国用户）：
- `exchangeRateToCNY`: 需要从汇率API获取
- `visaForCN`: 99% ✅
- `flightEstimates`: 已废弃

---

## API设计建议

### 当前API（中国用户）

```typescript
GET /countries/:code/currency-strategy
// 返回：货币、支付、汇率（CNY基准）

GET /countries/:code/visa-info  // 假设的API
// 返回：visaForCN（中国公民）
```

### 未来API（国际化）

```typescript
GET /countries/:code/currency-strategy?baseCurrency=USD
// 返回：货币、支付、汇率（可配置基准货币）

GET /countries/:code/visa-policy?fromCountry=US
// 返回：从指定国家出发的签证政策

GET /countries/:code?language=en
// 返回：指定语言的国家信息
```

---

## 实施优先级

### P0（必须）
1. ✅ 保持现有结构（向后兼容）
2. ✅ 明确字段用途注释

### P1（重要）
1. 添加 `nameEN` 字段
2. 添加 `exchangeRateToUSD` 字段
3. 优化 `visaForCN` 的中文显示（当前任务）

### P2（优化）
1. 创建 `VisaPolicy` 表设计文档
2. 设计多语言支持方案
3. 设计多基准货币汇率方案

### P3（未来）
1. 实施完全国际化架构
2. 支持多国家用户画像

---

## 结论

**当前阶段**：
- 保持 `CountryProfile` 表结构
- 明确区分通用字段和中国特定字段
- 在代码和文档中标注字段用途

**未来扩展**：
- 通过新表（`VisaPolicy`, `ExchangeRate`）支持国际化
- 逐步迁移中国特定数据到新表
- 保持向后兼容性
