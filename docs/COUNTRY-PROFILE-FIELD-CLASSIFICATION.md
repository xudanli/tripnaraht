# CountryProfile 字段分类说明

## 📋 快速参考

### 🌍 通用字段（Global Fields）

适用于所有国家用户，无论用户来自哪个国家：

```
✅ isoCode          - 国家代码（ISO标准）
✅ currencyCode     - 货币代码（ISO标准）
✅ currencyName     - 货币名称
✅ paymentType      - 支付画像（通用枚举）
✅ paymentInfo      - 支付建议（内容可多语言化）
✅ powerInfo        - 插座信息（物理标准，通用）
✅ emergency        - 紧急电话（数字，通用）
⚠️ nameCN           - 中文名称（当前仅中文，需扩展nameEN）
```

### 🇨🇳 中国特定字段（China-Specific Fields）

仅对中国用户有意义：

```
🇨🇳 exchangeRateToCNY  - 汇率（CNY基准，仅中国用户）
🇨🇳 visaForCN          - 中国公民签证政策
🇨🇳 flightEstimates    - 从中国出发机票（已废弃）
```

---

## 🔍 详细说明

### 1. 通用字段详解

#### `isoCode` ✅ 完全通用
- **用途**: 国家唯一标识
- **标准**: ISO 3166-1 alpha-2
- **国际化**: ✅ 已标准化，无需修改

#### `currencyCode` / `currencyName` ✅ 通用
- **用途**: 货币信息
- **标准**: ISO 4217
- **国际化**: ✅ 货币代码是国际标准
- **注意**: `currencyName` 可能需要多语言支持（如"美元" vs "US Dollar"）

#### `paymentType` ✅ 通用
- **用途**: 支付画像（现金为主/混合/数字化）
- **值**: `CASH_HEAVY`, `BALANCED`, `DIGITAL_ONLY`
- **国际化**: ✅ 枚举值通用，适用于所有用户

#### `paymentInfo` ⚠️ 通用但需多语言
- **用途**: 支付实用建议（小费、ATM、钱包App等）
- **内容**: JSON对象，包含文本描述
- **国际化**: ⚠️ 内容需要多语言支持
- **建议**: 存储为 `{ zh: {...}, en: {...} }` 格式

#### `powerInfo` ✅ 完全通用
- **用途**: 插座信息（电压、频率、插座类型）
- **标准**: 物理标准，全球统一
- **国际化**: ✅ 无需修改

#### `emergency` ✅ 完全通用
- **用途**: 紧急电话（报警、火警、医疗）
- **格式**: 数字字符串
- **国际化**: ✅ 数字通用，无需修改

#### `nameCN` ⚠️ 需要扩展
- **用途**: 国家中文名称
- **问题**: 只有中文，非中文用户无法理解
- **建议**: 添加 `nameEN` 字段，或使用多语言表

---

### 2. 中国特定字段详解

#### `exchangeRateToCNY` 🇨🇳
- **用途**: 汇率（1 外币 = 多少 CNY）
- **问题**: 硬编码为CNY基准
- **影响**: 
  - 美国用户需要：USD → CNY → 目标货币（两步换算）
  - 欧洲用户需要：EUR → CNY → 目标货币（两步换算）
- **解决方案**:
  - 方案A: 添加 `exchangeRateToUSD`（USD是国际标准基准）
  - 方案B: 创建 `ExchangeRate` 表，支持多基准货币
  - 方案C: 使用第三方汇率API实时计算

#### `visaForCN` 🇨🇳
- **用途**: 针对中国公民的签证政策
- **内容**: 
  ```json
  {
    "status": "VISA_FREE" | "VISA_REQUIRED" | "VISA_ON_ARRIVAL",
    "requirement": "Visa not required" | "Visa required",
    "allowedStay": "90 days",
    "notes": "..."
  }
  ```
- **问题**: 只存储中国公民的签证要求
- **影响**: 
  - 美国用户无法查看美国公民的签证要求
  - 需要为每个国家创建单独的签证信息
- **解决方案**:
  - 方案A: 创建 `VisaPolicy` 表
    ```sql
    VisaPolicy {
      fromCountryCode: String,  // 出发国家
      toCountryCode: String,    // 目的地国家
      status: String,
      requirement: String,
      ...
    }
    ```
  - 方案B: 将 `visaForCN` 改为 `visaPolicies` JSON数组
  - 方案C: 保持当前结构，明确标注为"中国特定"

#### `flightEstimates` 🇨🇳 (已废弃)
- **用途**: 从中国出发的机票价格估算
- **状态**: ✅ 已废弃，使用 `FlightPriceReference` 表替代
- **建议**: 可以删除此字段

---

## 🎯 国际化扩展路径

### 阶段一：当前（中国用户为主）

```
CountryProfile {
  // 通用字段
  isoCode, currencyCode, paymentType, powerInfo, emergency
  
  // 中国特定字段
  exchangeRateToCNY, visaForCN
}
```

### 阶段二：添加英文支持（短期）

```
CountryProfile {
  // 通用字段
  isoCode, currencyCode, paymentType, powerInfo, emergency
  nameEN  // 新增：英文名称
  
  // 中国特定字段
  exchangeRateToCNY, visaForCN
  exchangeRateToUSD  // 新增：USD基准汇率（国际标准）
}
```

### 阶段三：完全国际化（长期）

```
Country {
  isoCode, names: CountryName[]
  currency, paymentInfo, powerInfo, emergency
}

VisaPolicy {
  fromCountryCode, toCountryCode
  status, requirement, allowedStay, notes
}

ExchangeRate {
  fromCurrency, toCurrency, rate
}
```

---

## 📝 Schema 注释建议

在 Prisma Schema 中添加字段注释，明确标注字段用途：

```prisma
model CountryProfile {
  // ========== 🌍 通用字段 ==========
  isoCode           String       @id @unique  // 国家代码（ISO标准）
  nameCN            String                    // 中文名称（主要显示）
  
  currencyCode      String?                   // 货币代码（ISO 4217，通用）
  currencyName      String?                   // 货币名称（通用）
  paymentType       PaymentType?              // 支付画像（通用）
  paymentInfo       Json?                     // 支付建议（通用，内容可多语言）
  powerInfo         Json?                     // 插座信息（通用，物理标准）
  emergency         Json?                     // 紧急电话（通用，数字）
  
  // ========== 🇨🇳 中国特定字段 ==========
  exchangeRateToCNY Float?                    // 🇨🇳 汇率（CNY基准，仅中国用户）
  visaForCN         Json?                     // 🇨🇳 中国公民签证政策
  flightEstimates   Json?                     // 🇨🇳 已废弃，使用 FlightPriceReference
  
  updatedAt         DateTime
}
```

---

## 🔄 迁移建议

### 保持向后兼容

1. **保留现有字段**：不删除 `exchangeRateToCNY` 和 `visaForCN`
2. **添加新字段**：逐步添加 `nameEN`, `exchangeRateToUSD` 等
3. **创建新表**：未来创建 `VisaPolicy`, `ExchangeRate` 表
4. **API版本控制**：使用 API 版本区分（v1 中国用户，v2 国际化）

### 数据迁移策略

1. **通用字段**：无需迁移，直接使用
2. **汇率字段**：添加 `exchangeRateToUSD`，保留 `exchangeRateToCNY`
3. **签证字段**：创建 `VisaPolicy` 表，迁移 `visaForCN` 数据
4. **名称字段**：添加 `nameEN`，使用 i18n 库填充

---

## ✅ 当前状态

- ✅ 通用字段已明确标识
- ✅ 中国特定字段已标注
- ✅ Schema 注释已更新
- ✅ 架构文档已创建
- ⚠️ 待实施：添加 `nameEN` 字段
- ⚠️ 待实施：添加 `exchangeRateToUSD` 字段
- ⚠️ 待设计：`VisaPolicy` 表结构
