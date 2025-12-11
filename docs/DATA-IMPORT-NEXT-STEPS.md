# 数据导入后的下一步操作指南

## 📊 当前状态

根据验证结果：
- ✅ **数据已成功导入**: 127,828 条记录
- ✅ **周内因子已计算**: 7 条记录（周一到周日）
- ⚠️ **新字段数据缺失**: 大部分新字段（里程、月度因子、航司数量、起飞/降落时间等）为 null

## 🔍 问题诊断

### 1. 检查数据文件列名

运行以下命令检查您的数据文件是否包含所需字段：

```bash
# 检查数据文件的列名
npx ts-node --project tsconfig.backend.json scripts/check-data-columns.ts /path/to/your/flight_data.csv
```

这个脚本会：
- 列出数据文件中的所有列名
- 检查必需字段是否存在
- 检查推荐字段是否存在
- 显示数据示例

### 2. 可能的原因

如果新字段都是 null，可能的原因：

1. **数据文件缺少这些列**
   - 原始数据文件中没有"里程（公里）"、"航空公司"、"起飞时间"、"降落时间"等列
   - **解决方案**: 需要包含这些字段的数据文件

2. **列名不匹配**
   - 数据文件中的列名与导入脚本期望的不同
   - **解决方案**: 更新导入脚本的列名映射，或重命名数据文件中的列

3. **数据格式问题**
   - 字段存在但格式不正确（如时间格式）
   - **解决方案**: 检查并修正数据格式

## 🛠️ 解决方案

### 方案 1: 如果数据文件包含这些字段但列名不同

更新导入脚本中的列名映射。编辑 `scripts/import-flight-data.ts`，在 `processExcelRow` 和 CSV 解析部分添加您的列名：

```typescript
// 例如，如果您的列名是 "距离" 而不是 "里程（公里）"
里程公里: (row as any)['里程（公里）'] || (row as any)['里程'] || (row as any)['里程公里'] || (row as any)['距离'] ? ...
```

### 方案 2: 如果数据文件缺少这些字段

#### 选项 A: 使用现有数据（部分功能受限）

- 核心功能（价格估算）仍然可用
- 新字段相关的功能无法使用
- 可以后续补充数据后再重新导入

#### 选项 B: 补充数据后重新导入

1. 获取包含完整字段的数据文件
2. 清理现有数据：`npm run clear:flight-price-data`
3. 重新导入：`npm run import:flight-data /path/to/new/data.csv`

### 方案 3: 计算可计算的字段

即使原始数据缺少某些字段，我们也可以计算部分字段：

- **monthFactor (月度因子)**: 可以从现有数据计算（需要修复导入脚本）
- **isWeekend (是否周末)**: 可以从 dayOfWeek 计算（应该已经有数据）

## ✅ 当前可用的功能

即使新字段缺失，以下功能仍然可用：

1. **价格估算 API** ✅
   - `/flight-prices/domestic/estimate` - 基于月度基准价和周内因子
   - 返回估算价格和价格范围

2. **周内因子查询** ✅
   - `/flight-prices/day-of-week-factors` - 返回周一到周日的价格因子

3. **月度趋势查询** ✅
   - `/flight-prices/domestic/monthly-trend` - 返回全年12个月的价格趋势

## 🚀 下一步建议

### 立即可以做的：

1. **测试 API 功能**
   ```bash
   # 启动后端服务
   npm run backend:dev
   
   # 测试 API
   ./test-domestic-flight-api.sh
   ```

2. **验证数据质量**
   ```bash
   npm run verify:flight-data
   ```

3. **检查数据文件列名**
   ```bash
   npx ts-node --project tsconfig.backend.json scripts/check-data-columns.ts /path/to/your/data.csv
   ```

### 如果需要完整功能：

1. **获取包含完整字段的数据文件**
   - 确保包含：里程、航空公司、起飞时间、降落时间

2. **重新导入数据**
   ```bash
   # 清理现有数据
   npm run clear:flight-price-data
   
   # 重新导入
   npm run import:flight-data /path/to/complete/data.csv
   ```

3. **验证新字段**
   ```bash
   npm run verify:flight-data
   ```

## 📝 数据字段要求

### 必需字段（核心功能）
- ✅ 出发城市
- ✅ 到达城市
- ✅ 日期
- ✅ 价格(元)

### 推荐字段（增强功能）
- ⚠️ 里程（公里）- 用于 distanceKm
- ⚠️ 航空公司 - 用于 airlineCount
- ⚠️ 起飞时间 - 用于 departureTime 和 timeOfDayFactor
- ⚠️ 降落时间 - 用于 arrivalTime

### 自动计算的字段
- ✅ isWeekend - 从 dayOfWeek 自动计算
- ⚠️ monthFactor - 需要修复导入脚本的计算逻辑

## 🔧 修复 monthFactor 计算

即使缺少其他字段，monthFactor 应该可以从现有数据计算。如果发现 monthFactor 也是 null，可能是导入脚本的计算逻辑有问题，需要检查并修复。

## 需要帮助？

如果遇到问题：
1. 运行 `check-data-columns.ts` 检查数据文件
2. 运行 `verify-flight-data.ts` 查看详细验证结果
3. 检查后端服务日志
4. 查看数据库中的实际数据

