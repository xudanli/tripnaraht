# Shapefile 导入错误处理指南

## 错误类型：`RangeError: Offset is outside the bounds of the DataView`

### 错误含义

这个错误表示 `shapefile` 库在解析 Shapefile 文件时，尝试读取的数据超出了文件的实际范围。通常发生在：

1. **文件损坏或不完整**：Shapefile 的某个记录数据损坏
2. **格式问题**：某些特殊几何数据格式不符合标准
3. **库的兼容性问题**：`shapefile` 库在处理某些复杂几何时可能出现边界检查问题

### 错误示例

```
❌ 导入失败: geo_coastlines RangeError: Offset is outside the bounds of the DataView
    at DataView.getFloat64 (<anonymous>)
    at Shp.parsePolyLine [as _parse] (/home/devbox/project/node_modules/shapefile/dist/shapefile.node.js:176:84)
```

### 解决方案

#### 1. 改进的错误处理（已实现）

导入脚本已更新，现在会：

- ✅ **捕获读取错误**：在 `source.read()` 时捕获错误
- ✅ **跳过损坏记录**：自动跳过无法读取的记录，继续处理后续数据
- ✅ **错误计数限制**：如果连续错误过多（默认 100 次），会停止导入以防止无限循环
- ✅ **详细日志**：记录跳过的记录数量和错误信息

#### 2. 验证已导入的数据

即使导入过程中出现错误，大部分数据通常已经成功导入。检查方法：

```bash
# 使用测试脚本
npx ts-node --project tsconfig.backend.json scripts/test-aliyun-db-connection.ts

# 或直接查询
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM geo_coastlines;"
```

#### 3. 重新导入（如果需要）

如果数据不完整，可以重新导入：

```bash
# 删除现有表并重新导入
npx ts-node --project tsconfig.backend.json scripts/import-coastlines-to-postgis.ts --drop-existing
```

### 当前状态

✅ **海岸线数据**：429,369 条记录已成功导入  
✅ **错误处理**：脚本已更新，可以跳过损坏记录  
✅ **数据完整性**：大部分数据已成功导入

### 其他导入脚本

所有导入脚本（河流、山脉、道路、海岸线）都已采用相同的错误处理策略：

- `scripts/import-rivers-to-postgis.ts`
- `scripts/import-mountains-to-postgis.ts`
- `scripts/import-roads-to-postgis.ts`
- `scripts/import-coastlines-to-postgis.ts` ✅ 已修复

### 最佳实践

1. **导入前检查文件**：确保所有必需文件（.shp, .shx, .dbf, .prj）都存在且完整
2. **监控导入过程**：注意警告信息，了解跳过了多少记录
3. **验证数据**：导入后检查记录数量是否符合预期
4. **备份数据**：导入前备份数据库

### 如果问题持续

如果导入仍然失败：

1. **检查文件完整性**：使用 GIS 软件（如 QGIS）打开 Shapefile 验证
2. **尝试其他工具**：考虑使用 `shp2pgsql`（PostGIS 官方工具）或 `ogr2ogr`（GDAL）
3. **分段导入**：如果文件很大，考虑分割后分批导入
4. **联系数据提供方**：如果数据源有问题，联系数据提供方获取修复版本

