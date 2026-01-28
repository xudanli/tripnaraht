# 接口测试指南

## 快速开始

### 1. 启动服务

```bash
npm run start:dev
```

### 2. 运行测试脚本

```bash
./scripts/test-interfaces.sh
```

## 测试脚本说明

### 脚本位置
`scripts/test-interfaces.sh`

### 测试内容

#### 1. 天气接口测试

**接口**: `GET /api/weather/current`

**测试场景**:
- ✅ 冰岛坐标（64.1466, -21.9426）- 测试 apis.is 或 WeatherAPI
- ✅ 北京坐标（39.9042, 116.4074）- 测试 WeatherAPI
- ✅ 验证体感温度字段 (`feelsLikeTemperature`)
- ✅ 验证缓存机制 (`metadata.cached`)

**验证项**:
- 响应成功 (`success: true`)
- 包含温度、体感温度、条件等字段
- 缓存标记正确

#### 2. 行程项列表接口测试

**接口**: `GET /api/itinerary-items`

**测试场景**:
- ✅ 获取行程项列表
- ✅ 验证返回数据结构

**验证项**:
- 响应成功
- 返回数组格式
- 包含 tripDayId、startTime、TripDay 等字段

#### 3. 行程项更新接口测试

**接口**: `PATCH /api/itinerary-items/:id`

**测试场景**:
- ✅ 跨日期调整（更新 startTime 到未来日期）
- ✅ 使用 `cascadeMode: "none"` 参数
- ✅ 验证 tripDayId 自动更新
- ✅ 验证 TripDay 信息正确性

**验证项**:
- 更新成功
- tripDayId 自动更新到新的日期
- TripDay.id 与 tripDayId 匹配
- startTime 日期与 TripDay.date 匹配

## 测试输出示例

```
==========================================
接口综合测试
==========================================

【检查】服务状态
----------------------------------------
✅ 服务运行正常 (HTTP 200)

【测试 1】天气接口 - 获取当前天气（冰岛）
----------------------------------------
✅ 天气接口测试通过
  数据源: weatherapi
  温度: 5.1°C
  体感温度: 3.2°C
  条件: cloudy
  缓存: ✅ 来自缓存

【测试 2】天气接口 - 获取当前天气（北京）
----------------------------------------
✅ 天气接口测试通过
  数据源: weatherapi
  温度: 2.3°C
  体感温度: 0.3°C
  条件: sunny

【测试 3】行程项接口 - 获取列表
----------------------------------------
✅ 行程项列表接口测试通过
  找到行程项: 6d2b2d61-face-43cd-a6db-2db7357eee62
  tripDayId: c7d673e5-bbb2-400e-ab20-b083d49efbac
  startTime: 2026-01-26T07:20:00.000Z
  TripDay 日期: 2026-01-26T00:00:00.000Z

【测试 4】行程项更新接口 - 跨日期调整
----------------------------------------
找到行程项 ID: 6d2b2d61-face-43cd-a6db-2db7357eee62
当前 tripDayId: c7d673e5-bbb2-400e-ab20-b083d49efbac
更新 startTime 到: 2026-01-30T10:00:00.000Z
✅ 行程项更新接口测试通过
  更新后的 tripDayId: ff352f93-a49e-43cf-9763-491f8adac650
  更新后的 startTime: 2026-01-30T10:00:00.000Z
  TripDay 日期: 2026-01-30T00:00:00.000Z
  TripDay ID: ff352f93-a49e-43cf-9763-491f8adac650
  ✅ tripDayId 和 TripDay.id 匹配
  ✅ startTime 日期 (2026-01-30) 与 TripDay 日期 (2026-01-30) 匹配

==========================================
测试总结
==========================================

测试结果:
  ✅ 通过: 4
  ❌ 失败: 0
  ⚠️  跳过: 0

已测试接口:
  1. GET /api/weather/current - 天气接口（冰岛、北京）
  2. GET /api/itinerary-items - 行程项列表
  3. PATCH /api/itinerary-items/:id - 行程项更新（跨日期 + cascadeMode）

✅ 所有测试通过！
```

## 自定义配置

### 使用自定义 API 地址

```bash
API_BASE_URL=http://your-server:3000/api ./scripts/test-interfaces.sh
```

### 环境变量

- `API_BASE_URL`: API 基础地址（默认: `http://localhost:3000/api`）

## 故障排除

### 问题: 服务未运行

**错误**: `❌ 服务未运行或不可访问 (HTTP 000)`

**解决**: 
```bash
npm run start:dev
```

### 问题: 未找到行程项

**错误**: `⚠️  未找到行程项（可能需要先创建测试数据）`

**解决**: 这是正常的，如果没有测试数据，更新测试会被跳过。

### 问题: jq 命令未找到

**错误**: `command not found: jq`

**解决**: 
```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq
```

## 相关文档

- [天气 API 文档](../src/weather/WEATHER_API.md)
- [行程项 API 文档](../src/itinerary-items/ITINERARY_ITEMS_API.md)
- [天气缓存测试报告](../src/weather/WEATHER_CACHE_TEST_REPORT.md)
