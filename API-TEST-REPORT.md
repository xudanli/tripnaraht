# API 测试和数据验证报告

**生成时间：** 2025-12-10

## 📊 数据统计

### FlightPriceDetail 数据
- **总记录数：** 127,828 条
- **唯一航线数：** 3,078 条
- **覆盖月份：** 12 个月（1-12月）
- **总样本数：** 694,158 个
- **数据源：** 2024年历史数据（需要更新为2023-2024年）

### 周内因子数据
- ✅ 数据完整，包含周一至周日的因子
- **样本总数：** 约 680,000+ 条
- **因子范围：** 0.9850 - 1.0052

### 国际航线价格参考数据
- **记录数：** 0 条（需要填充数据）

---

## 🔍 成都->深圳航线数据验证

### 数据存在性
✅ **数据存在**，已找到多条记录

### 示例数据（前10条）
| 月份 | 星期 | 基准价 | 样本数 |
|------|------|--------|--------|
| 1 | 周一(0) | 1740.79 | 14 |
| 1 | 周三(2) | 1809.11 | 27 |
| 1 | 周五(4) | 975.89 | 27 |
| 1 | 周日(6) | 956.33 | 27 |
| 2 | 周二(1) | 546.81 | 27 |
| 2 | 周四(3) | 929.93 | 30 |
| 2 | 周五(4) | 1784.00 | 24 |
| 2 | 周六(5) | 1809.11 | 27 |
| 3 | 周一(0) | 1028.85 | 34 |
| 3 | 周二(1) | 1764.05 | 20 |

---

## 🧪 API 接口测试结果

### 1. 国内航线价格估算接口
**接口：** `GET /flight-prices/domestic/estimate`

#### 测试用例 1：成都->深圳，10月，周一
```bash
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=10&dayOfWeek=0"
```

**结果：** 
- ✅ 接口正常响应
- ⚠️ 返回默认值（sampleCount=0），说明10月周一可能没有数据

#### 测试用例 2：成都->深圳，3月，周五
```bash
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3&dayOfWeek=4"
```

**结果：**
- ✅ 接口正常响应
- ⚠️ 返回默认值（sampleCount=0）

#### 测试用例 3：成都->深圳，1月，周一
```bash
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=1&dayOfWeek=0"
```

**预期：** 应该返回实际数据（基准价约1740.79元）

### 2. 月度价格趋势接口
**接口：** `GET /flight-prices/domestic/monthly-trend`

**测试：**
```bash
curl "http://localhost:3000/flight-prices/domestic/monthly-trend?originCity=成都&destinationCity=深圳"
```

**结果：**
- ✅ 接口正常响应
- ⚠️ 返回空数组 `[]`（可能需要检查数据聚合逻辑）

### 3. 周内因子接口
**接口：** `GET /flight-prices/day-of-week-factors`

**测试：**
```bash
curl "http://localhost:3000/flight-prices/day-of-week-factors"
```

**结果：**
- ✅ 接口正常响应
- ✅ 返回完整数据（7条记录，周一至周日）

### 4. 国际航线价格估算接口
**接口：** `GET /flight-prices/estimate`

**测试：**
```bash
curl "http://localhost:3000/flight-prices/estimate?countryCode=JP&useConservative=true"
```

**结果：**
- ✅ 接口正常响应
- ✅ 返回数据：`{"totalCost":5000,"flightPrice":5000,"visaCost":0,"useConservative":true,"countryCode":"JP"}`

---

## ⚠️ 发现的问题

### 1. 数据源标签需要更新
- **当前：** "2024年历史数据"
- **应该：** "2023-2024年历史数据"
- **影响：** 仅影响新插入的数据，已有数据需要手动更新

### 2. API 返回默认值问题
- 某些查询返回默认值（2000元），但数据库中实际存在数据
- **可能原因：**
  - routeId 格式不匹配
  - 查询逻辑问题
  - 数据格式问题

### 3. 月度趋势接口返回空数组
- 数据库中确实有数据，但接口返回空数组
- **需要检查：** `getMonthlyTrend` 方法的聚合逻辑

---

## ✅ 正常工作的功能

1. ✅ 周内因子接口 - 数据完整，响应正常
2. ✅ 国际航线价格估算接口 - 响应正常
3. ✅ 服务器运行状态 - 正常
4. ✅ Prisma 客户端 - 已重新生成
5. ✅ 数据库连接 - 正常

---

## 🔧 建议的修复

### 1. 更新数据源标签
```sql
UPDATE "FlightPriceDetail" 
SET "source" = '2023-2024年历史数据' 
WHERE "source" = '2024年历史数据';
```

### 2. 调试 API 查询问题
- 检查 routeId 的编码格式
- 验证查询条件是否匹配
- 查看服务器日志中的调试信息

### 3. 检查月度趋势聚合逻辑
- 验证 `getMonthlyTrend` 方法的数据聚合是否正确
- 检查是否有数据但聚合结果为空

---

## 📝 测试命令

### 测试国内航线价格估算
```bash
# 测试1：1月周一（应该有数据）
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=1&dayOfWeek=0"

# 测试2：3月周二（应该有数据）
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3&dayOfWeek=1"

# 测试3：不指定星期几
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=1"
```

### 测试月度趋势
```bash
curl "http://localhost:3000/flight-prices/domestic/monthly-trend?originCity=成都&destinationCity=深圳"
```

### 测试周内因子
```bash
curl "http://localhost:3000/flight-prices/day-of-week-factors"
```

---

## 📚 相关文档

- API 完整文档：`docs/FLIGHT-PRICES-API-COMPLETE.md`
- SQL 查询参考：`query-flight-price.sql`
- 数据检查脚本：`scripts/check-api-data.ts`

---

**报告生成完成！** 🎉
