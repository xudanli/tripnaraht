# 清理航班价格数据

## 概述

当需要重新导入航班数据时，可以使用清理脚本清空相关数据表。

## 清理的表

脚本会清理以下三个表：
- **RawFlightData** - 原始航班数据表（如果存在）
- **FlightPriceDetail** - 国内航线价格详细表
- **DayOfWeekFactor** - 周内因子查找表

## 使用方法

### 方法 1: 使用 npm 脚本（推荐）

```bash
npm run clear:flight-price-data
```

### 方法 2: 直接运行脚本

```bash
npx ts-node --project tsconfig.backend.json scripts/clear-flight-price-data.ts
```

## 执行结果

脚本会：
1. 显示当前表中的记录数
2. 删除所有记录
3. 验证清理结果
4. 显示清理状态

## 示例输出

```
🧹 开始清理航班价格相关数据...

📊 清理 FlightPriceDetail 表...
   当前记录数: 70,714
   ✅ 已删除 70,714 条记录

📊 清理 DayOfWeekFactor 表...
   当前记录数: 7
   ✅ 已删除 7 条记录

🔍 验证清理结果...
   FlightPriceDetail 剩余记录: 0
   DayOfWeekFactor 剩余记录: 0

✅ 所有数据已成功清理！
💡 现在可以重新导入2023、2024年的数据了。
```

## 注意事项

⚠️ **警告**: 此操作会永久删除所有航班价格数据，请确保：
- 已备份重要数据（如需要）
- 准备重新导入新数据
- 确认要清理的数据表

## 重新导入数据

清理完成后，可以使用以下命令重新导入数据：

```bash
# 导入 CSV 文件
npm run import:flight-data /path/to/your/flight_data.csv

# 或使用流式导入（推荐用于大文件）
npm run import:flight-data:streaming /path/to/your/flight_data.csv
```

## 相关脚本

- `import:flight-data` - 导入航班数据
- `import:flight-data:streaming` - 流式导入航班数据（适合大文件）
- `convert:excel-to-csv` - 将 Excel 文件转换为 CSV

