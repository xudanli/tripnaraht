# 大文件导入优化方案

对于 65MB 的 Excel 文件，我们提供了两种优化方案：

## 方案 1: 先转换为 CSV，然后导入（推荐）

这是最节省内存的方案：

```bash
# 步骤 1: 将 Excel 转换为 CSV
npm run convert:excel-to-csv scripts/flight_data_2024_CN.xlsx

# 步骤 2: 使用 CSV 文件导入（CSV 处理更高效）
npm run import:flight-data scripts/flight_data_2024_CN.csv
```

**优点：**
- CSV 文件处理更快
- 内存占用更小
- 可以流式处理

## 方案 2: 直接导入 Excel（已优化）

如果文件不是特别大（<100MB），可以直接导入：

```bash
npm run import:flight-data scripts/flight_data_2024_CN.xlsx
```

**注意：**
- 脚本已优化为分批处理
- 但仍需要一次性加载 Excel 文件到内存
- 对于 65MB 文件，可能需要几分钟时间

## 性能对比

| 方案 | 内存占用 | 处理时间 | 推荐场景 |
|------|---------|---------|---------|
| Excel 直接导入 | 高 (~200MB) | 5-10分钟 | 小文件 (<50MB) |
| CSV 转换后导入 | 低 (~50MB) | 3-5分钟 | 大文件 (>50MB) |

## 故障排除

如果导入过程中出现内存不足错误：

1. 先转换为 CSV：
   ```bash
   npm run convert:excel-to-csv scripts/flight_data_2024_CN.xlsx
   ```

2. 然后导入 CSV：
   ```bash
   npm run import:flight-data scripts/flight_data_2024_CN.csv
   ```

3. 如果仍然有问题，可以尝试分批导入（需要手动分割文件）



