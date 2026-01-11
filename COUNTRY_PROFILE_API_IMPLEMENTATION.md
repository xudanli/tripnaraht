# 国家档案完整API接口实现

## 新增接口

### `GET /api/countries/:countryCode/profile`

**功能**: 获取完整的国家档案信息，包括所有字段

**路径参数**:
- `countryCode`: 国家代码（ISO 3166-1 alpha-2），例如：`JP`, `CN`, `US`

**返回字段**:

#### 基础字段
- `isoCode`: 国家代码
- `nameCN`: 中文名称
- `nameEN`: 英文名称
- `updatedAt`: 最后更新时间

#### 货币和支付字段
- `currencyCode`: 货币代码
- `currencyName`: 货币名称
- `exchangeRateToCNY`: 人民币汇率
- `exchangeRateToUSD`: 美元汇率
- `paymentType`: 支付画像类型
- `paymentInfo`: 支付详细信息（JSON）

#### JSON字段（完整提供）
- `powerInfo`: 电源信息
  - `voltage`: 电压
  - `frequency`: 频率
  - `plugTypes`: 插座类型数组
  - `note`: 备注
- `emergency`: 紧急信息
  - `police`: 警察电话
  - `fire`: 火警电话
  - `medical`: 医疗电话
  - `ambulance`: 救护车电话
  - `note`: 备注
  - `embassy`: 大使馆联系方式
- `visaForCN`: 中国公民签证信息
  - `required`: 是否需要签证
  - `type`: 签证类型
  - `duration`: 停留期限
  - `requirements`: 申请要求
  - `notes`: 备注
- `complianceInfo`: 合规信息
  - `visaPolicy`: 签证政策
  - `drivingRules`: 驾驶规则
  - `droneRules`: 无人机规则
  - `alcoholPolicy`: 酒精政策
  - `travelWarnings`: 旅行警告
  - `customs`: 海关规定
- `travelCulture`: 旅行文化
  - `tipping`: 小费文化
  - `taboos`: 禁忌列表
  - `dressCode`: 着装提示
  - `festivals`: 节庆日历
  - `etiquette`: 礼仪提示
  - `customs`: 风俗习惯

## 请求示例

```bash
# 获取日本完整档案
GET /api/countries/JP/profile

# 获取中国完整档案
GET /api/countries/CN/profile
```

## 响应示例

```json
{
  "success": true,
  "data": {
    "isoCode": "JP",
    "nameCN": "日本",
    "nameEN": "Japan",
    "updatedAt": "2025-12-12T05:29:37.945Z",
    "currencyCode": "JPY",
    "currencyName": "日元",
    "exchangeRateToCNY": 0.04468275245755138,
    "exchangeRateToUSD": 0.006389633601429847,
    "paymentType": "CASH_HEAVY",
    "paymentInfo": {
      "tipping": "绝对不要给小费，会被视为无礼。服务费通常已包含在账单中。",
      "atm_network": "7-11、Lawson、FamilyMart 的 ATM 支持银联卡取现。邮局 ATM 也支持。",
      "wallet_apps": ["Suica (Apple Pay)", "PayPay"],
      "notes": "虽然大城市开始接受信用卡，但小餐厅、寺庙、自动贩卖机仍主要使用现金。"
    },
    "powerInfo": {
      "voltage": 100,
      "frequency": 50,
      "plugTypes": ["A", "B"],
      "note": "电压: 100V, 频率: 50Hz, 插座类型: A, B"
    },
    "emergency": {
      "police": "110",
      "fire": "119",
      "medical": "119",
      "note": "报警: 110, 火警: 119, 医疗: 119"
    },
    "visaForCN": {
      "notes": "Passengers transiting through Narita or Haneda airport may apply for a shore pass..."
    },
    "complianceInfo": null,
    "travelCulture": null
  }
}
```

## 实现细节

### 1. DTO定义

创建了 `CountryProfileDto` 及其嵌套DTO：
- `PowerInfoDto`: 电源信息
- `EmergencyInfoDto`: 紧急信息
- `VisaInfoDto`: 签证信息
- `ComplianceInfoDto`: 合规信息
- `TravelCultureDto`: 旅行文化

### 2. Service方法

在 `CountriesService` 中添加了 `getCountryProfile` 方法：
- 查询完整的 `CountryProfile` 记录
- 返回所有字段，包括JSON字段
- 处理字段为 `null` 的情况

### 3. Controller路由

在 `CountriesController` 中添加了新的路由：
- 使用 `@Public()` 装饰器，允许未认证访问
- 路由顺序：固定路径（`packs`）在前，参数路径（`:countryCode/profile`）在后
- 完整的Swagger文档注解

## 数据覆盖情况

### ✅ 现在已完整提供

所有 `CountryProfile` 表的字段现在都可以通过API获取：

1. **基础字段** (4个) - ✅ 完整提供
2. **货币和支付字段** (6个) - ✅ 完整提供
3. **JSON字段** (5个) - ✅ 完整提供
   - `powerInfo` - ✅
   - `emergency` - ✅
   - `visaForCN` - ✅
   - `complianceInfo` - ✅
   - `travelCulture` - ✅

## 与其他接口的关系

### 接口对比

| 接口 | 返回字段 | 用途 |
|------|---------|------|
| `GET /api/countries` | 基础字段 + 部分货币字段 | 国家列表（搜索、分页） |
| `GET /api/countries/:code/currency-strategy` | 货币策略（含计算字段） | 货币换算、支付建议 |
| `GET /api/countries/:code/payment-info` | 支付实用信息（格式化） | 支付场景展示 |
| **`GET /api/countries/:code/profile`** | **所有字段（完整）** | **完整档案查询** |

### 使用建议

- **列表场景**: 使用 `GET /api/countries`（轻量，只返回必要字段）
- **货币场景**: 使用 `GET /api/countries/:code/currency-strategy`（包含计算字段）
- **完整信息**: 使用 `GET /api/countries/:code/profile`（包含所有字段）

## 修改的文件

1. **新建**: `src/countries/dto/country-profile.dto.ts` - 完整的DTO定义
2. **修改**: `src/countries/countries.service.ts` - 添加 `getCountryProfile` 方法
3. **修改**: `src/countries/countries.controller.ts` - 添加新的路由

## 测试

### 测试命令

```bash
# 测试日本完整档案
curl "http://localhost:3000/api/countries/JP/profile"

# 测试中国完整档案
curl "http://localhost:3000/api/countries/CN/profile"
```

### 验证要点

- ✅ 所有基础字段都能返回
- ✅ 所有货币和支付字段都能返回
- ✅ 所有JSON字段都能返回（如果有数据）
- ✅ 字段为 `null` 时正确处理
- ✅ 404错误处理正确（国家不存在时）

## 注意事项

1. **路由顺序**: 固定路径（如 `packs`）必须放在参数路径（如 `:countryCode/profile`）之前
2. **字段可选性**: 所有JSON字段都是可选的，可能为 `null`
3. **数据完整性**: 不是所有国家都有完整的JSON字段数据
4. **性能**: 返回完整数据，适合详情页使用，不适合列表场景

## 前端使用示例

```typescript
// 获取完整国家档案
const getCountryProfile = async (countryCode: string) => {
  const response = await fetch(`/api/countries/${countryCode}/profile`);
  const result = await response.json();
  
  if (result.success) {
    const profile = result.data;
    
    // 使用电源信息
    if (profile.powerInfo) {
      console.log(`需要${profile.powerInfo.voltage}V转换器`);
    }
    
    // 使用紧急信息
    if (profile.emergency) {
      console.log(`报警电话: ${profile.emergency.police}`);
    }
    
    // 使用签证信息
    if (profile.visaForCN) {
      console.log(`签证类型: ${profile.visaForCN.type}`);
    }
    
    return profile;
  }
};
```
