# 价格预测技术策略标准件

## 1. 目标与边界

### 目标

为机票和酒店提供价格趋势预测，帮助用户做出购买决策：

1. **价格趋势预测**：预测未来 30 天的价格走势
2. **买入信号**：判断当前价格是否处于低位（建议买入）或高位（建议观望）
3. **季节性分析**：识别价格季节性模式和节假日效应

### 非目标（MVP 可不做）

- 实时价格监控和自动购买
- 多供应商价格对比
- 复杂的经济模型（通胀、汇率等）

## 2. 模型选择

### 进阶版：Prophet（Meta 开源）

**选择理由**：
- 可以很好地处理季节性（Seasonality）和节假日效应（Holidays）
- 对缺失数据和异常值有良好的鲁棒性
- 提供不确定性区间（confidence interval）
- 易于调参和解释

**模型特点**：
- **趋势组件**：捕获长期趋势（上升/下降/平稳）
- **季节性组件**：年季节性、周季节性、日季节性
- **节假日组件**：处理节假日对价格的影响
- **不确定性区间**：提供预测的置信区间

### MVP 版：历史同期均值法（备选）

如果数据不足或需要快速上线，可以使用：
- 预测 2026 年 5 月的价格，直接取 2023-2025 年 5 月的加权平均 + 通胀系数
- 简单但有效，适合数据量小的场景

## 3. 数据源与数据要求

### 数据源

需要持续爬取或购买历史价格数据（这是最大的门槛，而非算法本身）：

- **机票价格**：出发城市-目的地城市-日期-价格
- **酒店价格**：城市-酒店星级-日期-价格

### 数据要求

- **时间跨度**：至少 2-3 年的历史数据
- **数据频率**：每日或每周
- **数据质量**：去除异常值、处理缺失值
- **特征工程**：
  - 日期特征：年、月、周、星期几、是否节假日
  - 价格特征：原始价格、对数价格、价格变化率

## 4. 模型训练与预测

### 训练流程

1. **数据预处理**：
   - 清洗异常值（如价格 < 0 或 > 10倍中位数）
   - 处理缺失值（前向填充或插值）
   - 特征工程（日期特征、节假日特征）

2. **模型训练**：
   ```python
   from prophet import Prophet
   
   model = Prophet(
       yearly_seasonality=True,
       weekly_seasonality=True,
       daily_seasonality=False,  # 机票/酒店通常不需要日季节性
       holidays=holidays_df,      # 节假日数据
       seasonality_mode='multiplicative',  # 或 'additive'
       changepoint_prior_scale=0.05,       # 趋势变化敏感度
   )
   model.fit(df)
   ```

3. **预测**：
   ```python
   future = model.make_future_dataframe(periods=30)  # 预测未来30天
   forecast = model.predict(future)
   ```

### 预测输出

```typescript
interface PriceForecast {
  date: string; // ISO 8601 date
  price: number; // 预测价格
  lower_bound: number; // 置信区间下界
  upper_bound: number; // 置信区间上界
  trend: 'up' | 'down' | 'stable'; // 趋势方向
  confidence: number; // 0-1，置信度
}
```

## 5. 买入信号生成

### 信号逻辑

比较当前价格与历史均值和预测价格：

```typescript
interface BuySignal {
  signal: 'BUY' | 'WAIT' | 'NEUTRAL';
  reason: string;
  current_price: number;
  historical_mean: number;
  predicted_price: number;
  price_change_percent: number; // 相对历史均值的变化百分比
  recommendation: string; // 自然语言建议
}
```

**判断规则**：
- **BUY（绿色）**：当前价格 < 历史均值 × 0.85（低于 15%）
- **WAIT（红色）**：当前价格 > 历史均值 × 1.15（高于 15%）
- **NEUTRAL（黄色）**：其他情况

### 示例输出

```json
{
  "signal": "BUY",
  "reason": "当前价格低于历史均值 15%",
  "current_price": 850,
  "historical_mean": 1000,
  "predicted_price": 920,
  "price_change_percent": -15,
  "recommendation": "当前价格处于低位，建议立即购买"
}
```

## 6. API 接口设计

### 机票价格预测

```typescript
interface FlightPricePredictionRequest {
  from_city: string;
  to_city: string;
  departure_date: string; // ISO 8601 date
  return_date?: string; // 可选，往返
}

interface FlightPricePredictionResponse {
  current_price: number;
  buy_signal: BuySignal;
  forecast: PriceForecast[]; // 未来30天预测
  historical_trend: {
    mean_price: number;
    min_price: number;
    max_price: number;
    std_price: number;
  };
}
```

### 酒店价格预测

```typescript
interface HotelPricePredictionRequest {
  city: string;
  star_level: number; // 1-5
  check_in_date: string;
  check_out_date: string;
}

interface HotelPricePredictionResponse {
  current_price: number;
  buy_signal: BuySignal;
  forecast: PriceForecast[]; // 未来30天预测
  historical_trend: {
    mean_price: number;
    min_price: number;
    max_price: number;
    std_price: number;
  };
}
```

## 7. 模型更新策略

### 在线更新

- **频率**：每周或每月重新训练模型
- **触发条件**：新数据积累到一定量（如 100 条新记录）
- **版本管理**：保留历史模型版本，支持 A/B 测试

### 模型评估

- **指标**：MAE（平均绝对误差）、MAPE（平均绝对百分比误差）、RMSE（均方根误差）
- **基准**：与历史同期均值法对比
- **阈值**：MAPE < 20% 认为模型可用

## 8. 实现建议

### 技术栈

- **Python**：Prophet 库、pandas、numpy
- **数据存储**：PostgreSQL（历史价格数据）、Redis（缓存预测结果）
- **API**：NestJS（调用 Python 服务或直接实现）

### 性能优化

- **缓存**：预测结果缓存 24 小时（价格不会频繁变化）
- **异步处理**：模型训练异步执行，不阻塞 API
- **批量预测**：一次预测多条路线/酒店，提高效率

### 错误处理

- **数据不足**：历史数据 < 1 年时，降级到历史同期均值法
- **模型失败**：训练失败时，返回历史均值预测
- **异常价格**：检测到异常价格时，标记并人工审核

## 9. 监控与告警

### 监控指标

- 模型预测准确度（MAPE）
- API 响应时间
- 数据更新频率
- 缓存命中率

### 告警规则

- MAPE > 30%：模型性能下降，需要重新训练
- 数据更新延迟 > 7 天：数据源异常
- API 错误率 > 5%：服务异常

