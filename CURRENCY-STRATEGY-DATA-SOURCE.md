# 货币策略数据获取说明

## 📊 数据架构概览

货币策略系统包含两类数据：

1. **静态数据（支付画像）**：支付习惯、小费文化、ATM 网络、钱包 App 等
2. **动态数据（汇率）**：实时汇率，每天自动更新

---

## 1. 静态数据：支付画像（Payment Profile）

### 数据来源

**手动填充脚本**：`scripts/seed-payment-profiles.ts`

### 数据生成方式

使用 **AI（LLM）生成**，然后手动审核和微调。

### 数据内容

每个国家包含以下信息：

```typescript
{
  isoCode: 'JP',                    // 国家代码
  nameCN: '日本',                   // 中文名称
  currencyCode: 'JPY',              // 货币代码
  currencyName: '日元',             // 货币名称
  paymentType: 'CASH_HEAVY',        // 支付类型：CASH_HEAVY | BALANCED | DIGITAL_ONLY
  paymentInfo: {
    tipping: '绝对不要给小费...',     // 小费文化
    atm_network: '7-11 ATM 支持...', // ATM 网络建议
    wallet_apps: ['Suica', 'PayPay'], // 钱包 App
    cash_preparation: '硬币使用极高...', // 现金准备建议
    notes: '虽然大城市开始接受信用卡...' // 其他注意事项
  }
}
```

### 支付类型分类

- **CASH_HEAVY（现金为王）**
  - 典型：日本、德国、大部分东南亚路边摊
  - 特点：必须在国内提前换好现金，或携带支持境外取现的借记卡

- **BALANCED（混合模式）**
  - 典型：美国、法国、大部分欧洲国家
  - 特点：大额刷卡（Visa/Master），小额（买水、上厕所、小费）用现金

- **DIGITAL_ONLY（数字/无现金）**
  - 典型：中国、瑞典、新加坡、英国（伦敦）
  - 特点：一张 Visa 卡走天下，或者绑定 Apple Pay/Alipay

### 填充方式

```bash
# 运行填充脚本
npm run seed:payment-profiles
```

### 数据位置

存储在 `CountryProfile` 表：
- `paymentType`: 支付类型枚举
- `paymentInfo`: JSONB 字段，包含详细建议

---

## 2. 动态数据：汇率（Exchange Rate）

### 数据来源

**自动更新任务**：`src/tasks/tasks.service.ts`

### 更新频率

**每天凌晨 4 点**自动更新（Cron Job）

### API 使用

**ExchangeRate-API**（免费层）
- URL: `https://api.exchangerate-api.com/v4/latest/CNY`
- 免费额度：每月 1500 次请求
- 支持 CNY 作为基准货币

### 数据转换

API 返回格式：`{ "rates": { "JPY": 20.5, "USD": 0.14, ... } }`
- API 返回：`1 CNY = 20.5 JPY`
- 数据库存储：`1 JPY = 0.0488 CNY`（取倒数）

### 更新逻辑

```typescript
// 1. 获取所有有货币代码的国家
const countries = await prisma.countryProfile.findMany({
  where: { currencyCode: { not: null } }
});

// 2. 从 API 获取最新汇率
const { data } = await axios.get('https://api.exchangerate-api.com/v4/latest/CNY');
const rates = data.rates;

// 3. 遍历所有国家，更新汇率
for (const country of countries) {
  const rateFromCNY = rates[country.currencyCode]; // 1 CNY = X 外币
  const rateToCNY = 1 / rateFromCNY;                // 1 外币 = X CNY
  
  await prisma.countryProfile.update({
    where: { isoCode: country.isoCode },
    data: { exchangeRateToCNY: rateToCNY }
  });
}
```

### 数据位置

存储在 `CountryProfile` 表：
- `exchangeRateToCNY`: Float 类型，表示 `1 外币 = X CNY`

---

## 3. 计算生成：速算规则（Quick Calculation Rules）

### 数据来源

**工具类计算**：`src/common/utils/currency-math.util.ts`

### 生成时机

**实时计算**：每次调用 `GET /countries/:countryCode/currency-strategy` API 时动态生成

### 生成内容

1. **速算口诀**（`quickRule`）
   - 示例：`"直接除以 20"`（日元）
   - 示例：`"直接乘以 7"`（美元）

2. **速算提示**（`quickTip`）
   - 示例：`"看到价格 直接除以 20 即为人民币\n例：日元1,000 ≈ 50 元"`

3. **快速对照表**（`quickTable`）
   ```json
   [
     { "local": 100, "home": 5 },
     { "local": 1000, "home": 50 },
     { "local": 10000, "home": 500 }
   ]
   ```

### 算法逻辑

根据汇率数值，自动匹配最符合人类直觉的算术规则：

- **汇率极小**（如日元、韩元）：使用除法规则
  - 日元：`1 JPY = 0.048 CNY` → `"直接除以 20"`
  - 韩元：`1 KRW = 0.0052 CNY` → `"直接除以 200"`

- **汇率小于 1**（如泰铢、港币）：使用除法规则
  - 泰铢：`1 THB = 0.21 CNY` → `"直接除以 5"`
  - 港币：`1 HKD = 0.92 CNY` → `"当成 1:1 算 (打九折)"`

- **汇率大于 1**（如美元、欧元）：使用乘法规则
  - 美元：`1 USD = 7.24 CNY` → `"直接乘以 7"`
  - 欧元：`1 EUR = 7.8 CNY` → `"直接乘以 8"`

---

## 4. 数据流程

### 初始化流程

```
1. 运行 seed-payment-profiles.ts
   ↓
2. 填充支付画像数据（paymentType, paymentInfo）
   ↓
3. 手动或自动填充货币代码（currencyCode, currencyName）
   ↓
4. Cron Job 每天更新汇率（exchangeRateToCNY）
```

### API 调用流程

```
用户请求: GET /countries/JP/currency-strategy
   ↓
CountriesService.getCurrencyStrategy()
   ↓
1. 从数据库读取 CountryProfile
   ↓
2. 使用 CurrencyMathUtil 生成速算规则
   ↓
3. 返回完整货币策略信息
```

---

## 5. 数据维护

### 支付画像数据

**更新方式**：手动编辑 `scripts/seed-payment-profiles.ts`，然后重新运行脚本

```bash
# 编辑脚本添加新国家或更新现有数据
vim scripts/seed-payment-profiles.ts

# 重新运行（会自动更新现有记录）
npm run seed:payment-profiles
```

### 汇率数据

**自动更新**：无需手动干预，Cron Job 会自动运行

**手动触发**（如果需要）：
```typescript
// 在代码中调用
await tasksService.updateExchangeRates();
```

### 速算规则

**自动生成**：无需维护，每次 API 调用时根据最新汇率动态计算

---

## 6. 数据示例

### 完整数据示例（日本）

```json
{
  "countryCode": "JP",
  "countryName": "日本",
  "currencyCode": "JPY",
  "currencyName": "日元",
  "paymentType": "CASH_HEAVY",
  "exchangeRateToCNY": 0.0483,
  "quickRule": "直接除以 20",
  "quickTip": "看到价格 直接除以 20 即为人民币\n例：日元1,000 ≈ 50 元",
  "quickTable": [
    { "local": 100, "home": 4.83 },
    { "local": 1000, "home": 48.3 },
    { "local": 10000, "home": 483 }
  ],
  "paymentAdvice": {
    "tipping": "绝对不要给小费，会被视为无礼。",
    "atm_network": "7-11、Lawson、FamilyMart 的 ATM 支持银联卡取现。",
    "wallet_apps": ["Suica (Apple Pay)", "PayPay", "LINE Pay"],
    "cash_preparation": "硬币使用极高，务必准备零钱袋。"
  }
}
```

---

## 7. 相关文件

- **支付画像数据**：`scripts/seed-payment-profiles.ts`
- **汇率更新任务**：`src/tasks/tasks.service.ts`
- **速算工具类**：`src/common/utils/currency-math.util.ts`
- **API 服务**：`src/countries/countries.service.ts`
- **API 控制器**：`src/countries/countries.controller.ts`
- **数据库模型**：`prisma/schema.prisma` (CountryProfile)

---

## 8. 注意事项

1. **汇率 API 限制**：ExchangeRate-API 免费层每月 1500 次请求，如果超过可以切换到 Frankfurter API
2. **支付画像准确性**：数据基于 AI 生成，建议定期审核和更新
3. **时区问题**：Cron Job 使用服务器时区，确保时区设置正确
4. **错误处理**：汇率更新失败不会影响其他功能，只记录日志

