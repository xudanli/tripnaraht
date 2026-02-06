# Booking.com 前端 API 文档

**服务名称**: Booking.com Car Rentals (via RapidAPI)  
**Base URL**: `/api/booking-com`  
**认证**: 当前无需认证（生产环境可能需要）

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [监控和成本管理](#监控和成本管理)
7. [注意事项](#注意事项)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/booking-com/health
```

**响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "booking-com"
  }
}
```

### 2. 搜索租车

```bash
curl -X POST http://localhost:3000/api/booking-com/search \
  -H "Content-Type: application/json" \
  -d '{
    "pick_up_latitude": 40.7128,
    "pick_up_longitude": -74.0060,
    "drop_off_latitude": 40.7589,
    "drop_off_longitude": -73.9851,
    "pick_up_date": "2026-02-15",
    "drop_off_date": "2026-02-20",
    "pick_up_time": "10:00",
    "drop_off_time": "10:00",
    "driver_age": 25,
    "currency_code": "USD",
    "location": "US"
  }'
```

---

## 📡 API 端点

### 1. 搜索租车

**端点**: `POST /api/booking-com/search`

**描述**: 根据取车/还车地点和时间搜索可用租车

**请求体**:
```typescript
interface SearchCarRentalsDto {
  pick_up_latitude: number;      // 取车地点纬度（必需）
  pick_up_longitude: number;     // 取车地点经度（必需）
  drop_off_latitude: number;     // 还车地点纬度（必需）
  drop_off_longitude: number;     // 还车地点经度（必需）
  pick_up_date: string;          // 取车日期（YYYY-MM-DD，必需）
  drop_off_date: string;          // 还车日期（YYYY-MM-DD，必需）
  pick_up_time: string;          // 取车时间（HH:mm，可选，默认 "10:00"）
  drop_off_time: string;          // 还车时间（HH:mm，可选，默认 "10:00"）
  driver_age: number;             // 司机年龄（可选，默认 25）
  currency_code: string;          // 货币代码（可选，默认 "USD"）
  location: string;               // 位置代码（可选，默认 "US"）
}
```

**响应**:
```typescript
interface SearchCarRentalsResponse {
  success: boolean;
  data: {
    data: Array<{
      id: string;
      company: string;
      vehicle_type: string;
      price: {
        amount: number;
        currency: string;
      };
      pickup_location?: {
        lat: number;
        lng: number;
        address?: string;
      };
      dropoff_location?: {
        lat: number;
        lng: number;
        address?: string;
      };
    }>;
    meta?: any;
  };
}
```

**示例**:
```typescript
// TypeScript/React 示例
const searchCarRentals = async (params: SearchCarRentalsDto) => {
  const response = await fetch('/api/booking-com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.message || '搜索租车失败');
  }
};

// 使用
const rentals = await searchCarRentals({
  pick_up_latitude: 40.7128,
  pick_up_longitude: -74.0060,
  drop_off_latitude: 40.7589,
  drop_off_longitude: -73.9851,
  pick_up_date: '2026-02-15',
  drop_off_date: '2026-02-20',
  pick_up_time: '10:00',
  drop_off_time: '10:00',
  driver_age: 25,
  currency_code: 'USD',
  location: 'US',
});
```

---

### 2. 检查服务状态

**端点**: `GET /api/booking-com/health`

**描述**: 检查 Booking.com 服务是否可用

**响应**:
```typescript
interface HealthResponse {
  success: boolean;
  data: {
    available: boolean;    // 服务是否可用
    service: string;       // 服务名称
  };
}
```

**示例**:
```typescript
const checkHealth = async () => {
  const response = await fetch('/api/booking-com/health');
  const result = await response.json();
  return result.data.available;
};
```

---

### 3. 获取监控统计

**端点**: `GET /api/booking-com/monitoring/stats`

**描述**: 获取 Booking.com API 使用统计、性能指标和成本估算

**查询参数**:
- `days` (可选): 统计天数（1-30，默认 7）

**响应**:
```typescript
interface MonitoringStatsResponse {
  success: boolean;
  data: {
    dailyStats: Array<{
      date: string;                    // 日期（YYYY-MM-DD）
      totalCalls: number;              // 总调用次数
      successfulCalls: number;         // 成功调用次数
      failedCalls: number;             // 失败调用次数
      avgResponseTime: number;         // 平均响应时间（毫秒）
      callsByTool: Record<string, number>; // 按工具分组的调用次数
      estimatedCost: number;           // 成本估算（USD）
    }>;
    performance: {
      avgResponseTime: number;          // 平均响应时间（毫秒）
      successRate: number;              // 成功率（0-1）
      totalCalls: number;               // 总调用次数
      callsByTool: Record<string, number>; // 按工具分组的调用次数
    };
    totalCostEstimate: number;          // 总成本估算（USD）
  };
}
```

**示例**:
```typescript
const getMonitoringStats = async (days: number = 7) => {
  const response = await fetch(`/api/booking-com/monitoring/stats?days=${days}`);
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.message || '获取监控统计失败');
  }
};

// 使用
const stats = await getMonitoringStats(7);
console.log(`总调用次数: ${stats.performance.totalCalls}`);
console.log(`成功率: ${(stats.performance.successRate * 100).toFixed(2)}%`);
console.log(`总成本估算: $${stats.totalCostEstimate.toFixed(2)}`);
```

---

### 4. 检查成本限制

**端点**: `GET /api/booking-com/monitoring/cost-check`

**描述**: 检查是否超过成本限制

**查询参数**:
- `limit` (必需): 成本限制（USD）
- `days` (可选): 统计天数（1-30，默认 7）

**响应**:
```typescript
interface CostCheckResponse {
  success: boolean;
  data: {
    exceeded: boolean;      // 是否超过限制
    currentCost: number;    // 当前成本（USD）
    limit: number;          // 限制值（USD）
  };
}
```

**示例**:
```typescript
const checkCostLimit = async (limit: number, days: number = 7) => {
  const response = await fetch(
    `/api/booking-com/monitoring/cost-check?limit=${limit}&days=${days}`
  );
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.message || '检查成本限制失败');
  }
};

// 使用
const costCheck = await checkCostLimit(100, 7);
if (costCheck.exceeded) {
  console.warn(`⚠️ 成本超过限制: $${costCheck.currentCost.toFixed(2)} / $${costCheck.limit}`);
} else {
  console.log(`✅ 成本正常: $${costCheck.currentCost.toFixed(2)} / $${costCheck.limit}`);
}
```

---

## 📊 数据模型

### CarRental

```typescript
interface CarRental {
  id: string;                    // 租车 ID
  company: string;               // 租车公司名称
  vehicle_type: string;          // 车型
  price: {
    amount: number;              // 价格金额
    currency: string;            // 货币代码
  };
  pickup_location?: {
    lat: number;                 // 纬度
    lng: number;                 // 经度
    address?: string;            // 地址
  };
  dropoff_location?: {
    lat: number;                 // 纬度
    lng: number;                 // 经度
    address?: string;            // 地址
  };
}
```

---

## ⚠️ 错误处理

### 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;                // 错误代码
    message: string;              // 错误消息
  };
}
```

### 常见错误

1. **服务不可用**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "Booking.com service is not available. Please check RAPIDAPI_BOOKING_COM_API_KEY configuration."
     }
   }
   ```

2. **参数错误**
   ```json
   {
     "success": false,
     "error": {
       "code": "BAD_REQUEST",
       "message": "Invalid request parameters"
     }
   }
   ```

3. **API 调用失败**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "Failed to search car rentals: [error details]"
     }
   }
   ```

### 错误处理示例

```typescript
try {
  const rentals = await searchCarRentals(params);
  // 处理成功结果
} catch (error: any) {
  if (error.message.includes('not available')) {
    // 服务不可用，显示提示信息
    console.error('Booking.com 服务不可用，请检查配置');
  } else if (error.message.includes('Invalid')) {
    // 参数错误，提示用户修正
    console.error('请求参数错误，请检查输入');
  } else {
    // 其他错误
    console.error('搜索失败:', error.message);
  }
}
```

---

## 💡 使用示例

### React Hook 示例

```typescript
import { useState, useEffect } from 'react';

interface UseCarRentalsParams {
  pickupLocation: { lat: number; lng: number };
  dropoffLocation: { lat: number; lng: number };
  pickupDate: string;
  dropoffDate: string;
  driverAge?: number;
}

export const useCarRentals = (params: UseCarRentalsParams) => {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRentals = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch('/api/booking-com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pick_up_latitude: params.pickupLocation.lat,
            pick_up_longitude: params.pickupLocation.lng,
            drop_off_latitude: params.dropoffLocation.lat,
            drop_off_longitude: params.dropoffLocation.lng,
            pick_up_date: params.pickupDate,
            drop_off_date: params.dropoffDate,
            driver_age: params.driverAge || 25,
            currency_code: 'USD',
            location: 'US',
          }),
        });
        
        const result = await response.json();
        if (result.success) {
          setRentals(result.data.data || []);
        } else {
          setError(result.error?.message || '搜索失败');
        }
      } catch (err: any) {
        setError(err.message || '网络错误');
      } finally {
        setLoading(false);
      }
    };

    if (params.pickupDate && params.dropoffDate) {
      fetchRentals();
    }
  }, [params]);

  return { rentals, loading, error };
};
```

### 使用 Hook

```typescript
const CarRentalsComponent = () => {
  const { rentals, loading, error } = useCarRentals({
    pickupLocation: { lat: 40.7128, lng: -74.0060 },
    dropoffLocation: { lat: 40.7589, lng: -73.9851 },
    pickupDate: '2026-02-15',
    dropoffDate: '2026-02-20',
    driverAge: 25,
  });

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  return (
    <div>
      <h2>可用租车 ({rentals.length})</h2>
      {rentals.map((rental: any) => (
        <div key={rental.id}>
          <h3>{rental.company} - {rental.vehicle_type}</h3>
          <p>价格: {rental.price.currency} {rental.price.amount}</p>
        </div>
      ))}
    </div>
  );
};
```

---

## 📈 监控和成本管理

### 成本估算

Booking.com API 的成本估算基于 RapidAPI 定价（需要根据实际定价调整）：

- `searchCarRentals`: 约 $0.01/次（假设）

### 监控最佳实践

1. **定期检查成本**
   ```typescript
   // 每日检查成本限制
   const checkDailyCost = async () => {
     const costCheck = await checkCostLimit(10, 1); // $10/天限制
     if (costCheck.exceeded) {
       // 发送告警
       console.warn('⚠️ 今日成本超过限制');
     }
   };
   ```

2. **监控性能**
   ```typescript
   // 每周检查性能指标
   const checkPerformance = async () => {
     const stats = await getMonitoringStats(7);
     if (stats.performance.successRate < 0.95) {
       console.warn('⚠️ 成功率低于 95%');
     }
     if (stats.performance.avgResponseTime > 2000) {
       console.warn('⚠️ 平均响应时间超过 2 秒');
     }
   };
   ```

---

## ⚠️ 注意事项

### 1. API Key 配置

- **后端需要设置 `RAPIDAPI_BOOKING_COM_API_KEY` 环境变量**
- 获取 API Key: https://rapidapi.com/apidojo/api/booking-com15
- 前端无需关心 API Key，由后端统一管理

### 2. 搜索限制

- **结果数量**: API 返回的结果数量可能有限
- **缓存**: 搜索结果会缓存 6-24 小时，相同参数的重复请求会使用缓存

### 3. 错误处理

- **服务不可用**: 如果 API Key 未配置或服务不可用，会返回 `available: false`
- **网络错误**: 确保网络连接正常
- **参数验证**: 确保必填参数已提供且格式正确

### 4. 成本管理

- **成本估算**: 基于假设的定价，实际价格需要查看 RapidAPI 定价页面
- **成本监控**: 建议定期检查成本限制，避免超出预算
- **缓存策略**: 使用缓存可以减少 API 调用，降低成本

### 5. 数据准确性

- **实时性**: 租车价格和可用性可能实时变化
- **缓存影响**: 缓存的结果可能不是最新的
- **建议**: 对于关键决策，考虑使用较短的缓存时间或禁用缓存

---

## 🔗 相关文档

- **产品策略**: `src/mcp/BOOKING_COM_PRODUCT_STRATEGY.md`
- **集成评估**: `src/mcp/BOOKING_COM_INTEGRATION_ASSESSMENT.md`
- **实施总结**: `src/mcp/BOOKING_COM_IMPLEMENTATION_SUMMARY.md`
- **测试文档**: `scripts/README-BOOKING-COM-TEST.md`

---

**最后更新**: 2026-02-06
