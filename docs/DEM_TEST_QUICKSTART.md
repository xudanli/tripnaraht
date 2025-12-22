# DEM 测试快速开始

## 概述

本文档提供DEM（数字高程模型）数据测试的快速开始指南。

## 测试脚本

### 1. 基础功能测试

测试DEM查询的基础功能，包括：
- 单个坐标点查询
- 城市DEM优先级
- 批量查询
- 边界情况处理

```bash
# 运行所有测试
npm run test:dem -- --all

# 测试指定城市
npm run test:dem -- --city "拉萨市"

# 仅检查DEM表状态
npm run test:dem
```

### 2. 用户场景测试

测试真实用户场景：
- 旅行路线规划
- POI海拔信息补充
- 批量地点查询

```bash
# 运行所有场景
npm run test:dem:scenarios

# 运行指定场景
npm run test:dem:scenarios -- --scenario route   # 路线规划
npm run test:dem:scenarios -- --scenario poi      # POI海拔补充
npm run test:dem:scenarios -- --scenario batch    # 批量查询
```

## 测试步骤

### 步骤1：检查DEM表状态

首先检查DEM数据是否已正确导入：

```bash
npm run test:dem
```

预期输出：
- ✅ 区域DEM表存在
- ✅ 城市DEM表数量 > 0
- ✅ 显示DEM覆盖范围

### 步骤2：运行基础功能测试

```bash
npm run test:dem -- --all
```

验证：
- ✅ 主要城市海拔查询正确
- ✅ 西藏地区海拔查询正确
- ✅ 边界情况处理正确
- ✅ 查询性能达标

### 步骤3：测试城市DEM优先级

验证城市DEM优先于区域DEM：

```bash
npm run test:dem -- --city "拉萨市"
```

预期：
- 自动识别城市DEM表
- 优先使用城市DEM数据
- 显示数据源信息

### 步骤4：运行用户场景测试

测试真实使用场景：

```bash
# 场景1：旅行路线规划
npm run test:dem:scenarios -- --scenario route

# 场景2：POI海拔补充
npm run test:dem:scenarios -- --scenario poi

# 场景3：批量查询
npm run test:dem:scenarios -- --scenario batch
```

## 测试用例

### 主要城市测试点

| 城市 | 坐标 | 期望海拔范围 |
|------|------|-------------|
| 北京 | 39.9042, 116.4074 | 40-60m |
| 上海 | 31.2304, 121.4737 | 0-20m |
| 成都 | 30.6624, 104.0633 | 480-520m |
| 拉萨 | 29.6544, 91.1322 | 3600-3700m |

### 西藏地区测试点

| 地点 | 坐标 | 期望海拔范围 |
|------|------|-------------|
| 拉萨布达拉宫 | 29.6544, 91.1322 | 3600-3700m |
| 日喀则 | 29.2675, 88.8801 | 3800-3900m |
| 林芝 | 29.6544, 94.3614 | 2900-3100m |

## 性能指标

### 查询性能目标

- **单点查询**：平均 < 500ms，最大 < 2000ms
- **批量查询**：平均 < 1000ms/点

### 验证方法

运行测试后查看统计信息：
- 平均查询时间
- 最大/最小查询时间
- 成功率

## 常见问题

### 1. 测试失败：表不存在

**问题**：`relation "geo_dem_xizang" does not exist`

**解决**：
```bash
# 导入区域DEM
npm run import:dem:xizang

# 或导入城市DEM
npm run import:dem:city -- --city "拉萨市" --tif "data/geographic/dem/china/cities/拉萨市.tif"
```

### 2. 查询返回 null

**可能原因**：
- 坐标超出DEM覆盖范围
- DEM表无数据
- 坐标点不在栅格范围内

**解决**：
- 检查坐标是否在DEM覆盖范围内
- 验证DEM表是否有数据
- 查看测试用例文档中的期望范围

### 3. 性能不达标

**可能原因**：
- DEM表未创建索引
- 数据库连接慢
- 栅格数据过大

**解决**：
- 检查PostGIS索引
- 优化数据库连接
- 考虑使用瓦片化存储

## 相关文档

- [完整测试用例文档](./DEM_TEST_CASES.md)
- [DEM数据导入文档](../data/geographic/dem/china/README.md)
- [DEMElevationService API](../src/trips/readiness/services/dem-elevation.service.ts)

