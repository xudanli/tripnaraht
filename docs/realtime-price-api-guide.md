# 实时价格 API 接入指南

## 推荐的实时价格 API

### 1. 机票价格 API

#### Amadeus API（推荐）
- **官网**: https://developers.amadeus.com/
- **API文档**: https://developers.amadeus.com/self-service/category/air/api-doc/flight-offers-search
- **特点**:
  - 提供全球航班搜索和价格查询
  - 支持实时价格和可用性
  - 提供免费测试环境
  - 生产环境需要付费
- **认证方式**: OAuth 2.0 (Client Credentials)
- **限流**: 根据订阅计划不同
- **费用**: 免费层有限制，付费层按调用次数计费

#### Skyscanner API
- **官网**: https://developers.skyscanner.net/
- **API文档**: https://developers.skyscanner.net/docs/flights/live-prices/overview
- **特点**:
  - 提供实时航班价格搜索
  - 支持多供应商价格对比
  - 需要申请合作伙伴权限
- **认证方式**: API Key
- **限流**: 根据合作伙伴等级

#### FlightAware AeroAPI
- **官网**: https://www.flightaware.com/commercial/aeroapi/
- **特点**:
  - 主要提供航班跟踪和状态
  - 价格信息有限
  - 适合航班状态查询

### 2. 酒店价格 API

#### Amadeus Hotel API（推荐）
- **官网**: https://developers.amadeus.com/
- **API文档**: https://developers.amadeus.com/self-service/category/hotel/api-doc/hotel-search
- **特点**:
  - 提供全球酒店搜索和价格查询
  - 支持实时价格和可用性
  - 与机票API使用同一平台
- **认证方式**: OAuth 2.0 (Client Credentials)
- **费用**: 免费层有限制，付费层按调用次数计费

#### Booking.com API
- **官网**: https://developers.booking.com/
- **特点**:
  - 需要成为 Booking.com 的合作伙伴
  - 提供酒店价格和可用性
  - 需要商业合作协议
- **认证方式**: API Key
- **申请**: 需要提交合作伙伴申请

#### Expedia API
- **官网**: https://developer.expedia.com/
- **特点**:
  - 需要成为 Expedia 的合作伙伴
  - 提供酒店、机票、租车等服务
  - 需要商业合作协议
- **认证方式**: API Key

### 3. 国内替代方案

#### 携程 API
- **官网**: https://open.ctrip.com/
- **特点**:
  - 主要面向中国市场
  - 提供酒店、机票、景点等服务
  - 需要企业认证
- **认证方式**: API Key + Secret

#### 飞猪 API
- **官网**: https://open.alitrip.com/
- **特点**:
  - 阿里巴巴旗下
  - 提供酒店、机票等服务
  - 需要企业认证
- **认证方式**: OAuth 2.0

## 环境变量配置

在 `.env` 文件中配置：

```bash
# 机票实时价格API
REALTIME_FLIGHT_API_PROVIDER=AMADEUS  # AMADEUS | SKYSCANNER
REALTIME_FLIGHT_API_KEY=your_api_key
REALTIME_FLIGHT_API_SECRET=your_api_secret  # 如果需要

# 酒店实时价格API
REALTIME_HOTEL_API_PROVIDER=AMADEUS  # AMADEUS | BOOKING | EXPEDIA
REALTIME_HOTEL_API_KEY=your_api_key
REALTIME_HOTEL_API_SECRET=your_api_secret  # 如果需要

# Amadeus API 配置
AMADEUS_API_KEY=your_amadeus_api_key
AMADEUS_API_SECRET=your_amadeus_api_secret
AMADEUS_API_ENV=sandbox  # sandbox | production
```

## 实现建议

### 1. 缓存策略

实时价格API调用成本较高，建议：

- **缓存时间**: 24小时（价格不会频繁变化）
- **缓存键**: `realtime-price:flight:${fromCity}:${toCity}:${date}`
- **降级策略**: API失败时使用数据库估算价格

### 2. 错误处理

- **API限流**: 返回429错误时，使用数据库估算价格
- **API失败**: 记录错误日志，降级到数据库查询
- **超时处理**: 设置5秒超时，超时后使用数据库查询

### 3. 成本控制

- **按需调用**: 只在用户明确请求实时价格时调用
- **批量查询**: 如果可能，批量查询多个日期
- **监控使用量**: 监控API调用次数，避免超限

## 实现示例

### Amadeus API 集成

```typescript
// 1. 获取 Access Token
async function getAmadeusToken(): Promise<string> {
  const response = await axios.post('https://test.api.amadeus.com/v1/security/oauth2/token', {
    grant_type: 'client_credentials',
    client_id: process.env.AMADEUS_API_KEY,
    client_secret: process.env.AMADEUS_API_SECRET,
  });
  return response.data.access_token;
}

// 2. 搜索航班价格
async function searchFlightPrices(
  origin: string,
  destination: string,
  date: string,
  token: string
): Promise<number | null> {
  const response = await axios.get(
    'https://test.api.amadeus.com/v2/shopping/flight-offers',
    {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: date,
        adults: 1,
        currencyCode: 'CNY',
      },
    }
  );

  if (response.data.data && response.data.data.length > 0) {
    // 返回最低价格
    return response.data.data[0].price.total;
  }
  return null;
}
```

## 价格对比功能

实现价格对比，在预测结果中包含：

```typescript
interface PriceComparison {
  predicted_price: number;
  realtime_price: number | null;
  price_difference: number | null;  // 实时价格 - 预测价格
  price_difference_percent: number | null;
  comparison_status: 'MATCH' | 'HIGHER' | 'LOWER' | 'UNAVAILABLE';
}
```

## 注意事项

1. **API费用**: 实时价格API通常按调用次数计费，需要控制调用频率
2. **数据准确性**: 实时价格可能因供应商、时间等因素变化
3. **合规性**: 使用第三方API需要遵守其使用条款
4. **备用方案**: 始终提供数据库估算价格作为备用

