# 航班价格估算 API 文档

## 概述

航班价格估算 API 提供两种数据源的价格查询：
1. **国际航线**：基于手动维护的估算数据库（FlightPriceReference）
2. **国内航线**：基于2023-2024年历史数据的统计模型（FlightPriceDetail）

## 数据模型

### 估算公式

**国内航线：**
```
预算价格 = 月度基准价 (P_month) × 周内因子 (F_day)
```

**国际航线：**
```
预算价格 = 旺季价格（或平均价格）+ 签证费用
```

## API 接口

### 1. 估算国际航线价格

**接口：** `GET /flight-prices/estimate`

**描述：** 根据目的地国家代码和出发城市估算机票+签证成本。

**查询参数：**
- `countryCode` (必填): 目的地国家代码，如 "JP", "US"
- `originCity` (可选): 出发城市代码，如 "PEK", "PVG"
- `useConservative` (可选): 是否使用保守估算（旺季价格），默认 `true`

**示例：**
```bash
GET /flight-prices/estimate?countryCode=JP&originCity=PEK&useConservative=true
```

**响应：**
```json
{
  "totalCost": 6000,
  "flightPrice": 6000,
  "visaCost": 0,
  "useConservative": true,
  "countryCode": "JP",
  "originCity": "PEK"
}
```

---

### 2. 估算国内航线价格（基于历史数据）

**接口：** `GET /flight-prices/domestic/estimate`

**描述：** 根据2023-2024年历史数据估算国内航线价格。

**查询参数：**
- `originCity` (必填): 出发城市，如 "成都"
- `destinationCity` (必填): 到达城市，如 "深圳"
- `month` (必填): 月份（1-12）
- `dayOfWeek` (可选): 星期几（0=周一, 6=周日）

**示例：**
```bash
GET /flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3&dayOfWeek=4
```

**响应：**
```json
{
  "estimatedPrice": 2375,
  "lowerBound": 2138,
  "upperBound": 2613,
  "monthlyBasePrice": 2200,
  "dayOfWeekFactor": 1.08,
  "sampleCount": 45
}
```

**字段说明：**
- `estimatedPrice`: 估算价格（元）
- `lowerBound`: 价格下限（估算价格 × 0.9）
- `upperBound`: 价格上限（估算价格 × 1.1）
- `monthlyBasePrice`: 月度基准价（该航线在该月的平均价格）
- `dayOfWeekFactor`: 周内因子（该星期几相对于总平均价的倍数）
- `sampleCount`: 样本数量

---

### 3. 获取航线月度价格趋势

**接口：** `GET /flight-prices/domestic/monthly-trend`

**描述：** 返回指定航线在全年12个月的价格趋势数据。

**查询参数：**
- `originCity` (必填): 出发城市
- `destinationCity` (必填): 到达城市

**示例：**
```bash
GET /flight-prices/domestic/monthly-trend?originCity=成都&destinationCity=深圳
```

**响应：**
```json
[
  {
    "month": 1,
    "basePrice": 2500,
    "sampleCount": 120
  },
  {
    "month": 2,
    "basePrice": 3200,
    "sampleCount": 95
  },
  {
    "month": 3,
    "basePrice": 1800,
    "sampleCount": 110
  }
]
```

---

### 4. 获取所有周内因子

**接口：** `GET /flight-prices/day-of-week-factors`

**描述：** 返回周一至周日的周内因子（相对于总平均价的倍数）。

**示例：**
```bash
GET /flight-prices/day-of-week-factors
```

**响应：**
```json
[
  {
    "id": 1,
    "dayOfWeek": 0,
    "factor": 0.98,
    "avgPrice": 2156,
    "totalAvgPrice": 2200,
    "sampleCount": 15000
  },
  {
    "id": 2,
    "dayOfWeek": 4,
    "factor": 1.15,
    "avgPrice": 2530,
    "totalAvgPrice": 2200,
    "sampleCount": 18000
  }
]
```

**说明：**
- `dayOfWeek`: 0=周一, 1=周二, ..., 6=周日
- `factor`: 周内因子，1.0 表示等于总平均价，>1.0 表示高于平均价
- 通常周五、周六、周日的因子较高（1.1-1.2），周一到周四较低（0.95-1.0）

---

## 数据导入

### 导入历史数据

**命令：**
```bash
npm run import:flight-data [CSV文件路径]
```

**示例：**
```bash
# 使用默认路径（flight_data_2024.csv）
npm run import:flight-data

# 指定文件路径
npm run import:flight-data /path/to/flight_data_2024.csv
```

**CSV 文件格式要求：**
- 必须包含列：`出发城市`, `到达城市`, `日期`, `价格(元)` 或 `价格元`
- 日期格式：`2024/1/1` 或 `2024-01-01`
- 价格列：数字类型

**处理流程：**
1. 高效加载 CSV（指定数据类型，减少内存占用）
2. 计算星期几和月份
3. 计算总平均价
4. 计算周内因子（F_day）
5. 计算月度基准价（P_month）
6. 按航线-月份-星期几分组计算详细数据
7. 批量写入数据库

**输出示例：**
```
🚀 开始导入航班数据...
📁 文件路径: flight_data_2024.csv
📂 正在加载文件: flight_data_2024.csv...
✅ 成功加载 500000 条记录
📊 有效记录: 485000 条（过滤 15000 条无效数据）

📈 总平均价格: 2200.00 元

📊 计算周内因子...
✅ 周内因子计算完成:
  周一 (0): 0.980 (样本: 65000)
  周二 (1): 0.950 (样本: 62000)
  周三 (2): 0.970 (样本: 64000)
  周四 (3): 0.990 (样本: 68000)
  周五 (4): 1.150 (样本: 75000)
  周六 (5): 1.200 (样本: 72000)
  周日 (6): 1.100 (样本: 71000)

📊 计算月度基准价...
📦 共 5000 条航线-月份组合

📊 计算航线-月份-星期几详细数据...
💾 开始写入数据库（35000 条记录）...
  进度: 1000 / 35000
  进度: 2000 / 35000
  ...

📊 导入统计:
  总记录数: 500000
  有效记录: 485000
  成功导入: 35000 条
  创建: 35000 条
  更新: 0 条
  周内因子: 7 个
  航线-月份组合: 5000 个

✅ 数据导入完成！
```

---

## 使用场景

### 场景 1：查询国内航线价格

```bash
# 查询成都到深圳，3月，周五的价格
GET /flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3&dayOfWeek=4

# 响应：2375 元（月度基准价 2200 × 周内因子 1.08）
```

### 场景 2：查询价格趋势

```bash
# 查看成都到深圳全年价格趋势
GET /flight-prices/domestic/monthly-trend?originCity=成都&destinationCity=深圳

# 用于前端展示价格走势图
```

### 场景 3：查询周内因子

```bash
# 查看一周内哪天最便宜
GET /flight-prices/day-of-week-factors

# 通常周二、周三最便宜（因子 < 1.0）
```

---

## 数据库表结构

### FlightPriceDetail（国内航线价格详细表）

| 字段 | 类型 | 说明 |
|------|------|------|
| routeId | String | 航线ID（"成都->深圳"） |
| originCity | String | 出发城市 |
| destinationCity | String | 到达城市 |
| month | Int | 月份（1-12） |
| dayOfWeek | Int? | 星期几（0-6，null表示汇总） |
| monthlyBasePrice | Float | 月度基准价 |
| dayOfWeekFactor | Float? | 周内因子 |
| sampleCount | Int | 样本数量 |
| minPrice | Float? | 最低价格 |
| maxPrice | Float? | 最高价格 |
| stdDev | Float? | 标准差 |

### DayOfWeekFactor（周内因子表）

| 字段 | 类型 | 说明 |
|------|------|------|
| dayOfWeek | Int | 星期几（0-6） |
| factor | Float | 周内因子 |
| avgPrice | Float? | 该星期几的平均价格 |
| totalAvgPrice | Float? | 总平均价格 |
| sampleCount | Int | 样本数量 |

---

## 注意事项

1. **数据文件大小**：65MB 的 CSV 文件需要足够的内存，建议在服务器环境运行
2. **处理时间**：50万条记录的处理时间约 5-10 分钟
3. **内存优化**：脚本已优化数据类型，减少内存占用
4. **数据更新**：建议每月更新一次历史数据

---

## Swagger 文档

启动服务后，访问 Swagger UI 查看完整的 API 文档：

```
http://localhost:3000/api
```

所有接口都在 `flight-prices` 标签下。

